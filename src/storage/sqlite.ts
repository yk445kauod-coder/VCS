import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BaseDoc, Filter, Repository, Store } from './types.js';
import { applyFilter, MAX_LIMIT } from './filter.js';

const COLLECTIONS = [
  'tenants',
  'customers',
  'conversations',
  'messages',
  'products',
  'orders',
  'knowledge',
  'reports',
] as const;

type Collection = (typeof COLLECTIONS)[number];

/**
 * SQLite-backed repository. Documents are stored as JSON blobs with an
 * indexed `id` and denormalised `tenant_id`/`created_at` columns so we can
 * push the common filters down to SQL and keep the rest in JS.
 */
class SqliteRepository<T extends BaseDoc> implements Repository<T> {
  constructor(
    private readonly db: DatabaseSync,
    private readonly table: Collection,
  ) {}

  async get(id: string): Promise<T | null> {
    const row = this.db
      .prepare(`SELECT doc FROM ${this.table} WHERE id = ?`)
      .get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as T) : null;
  }

  async list(filter?: Filter<T>): Promise<T[]> {
    const { sql, params } = this.buildQuery(filter);
    const rows = this.db.prepare(sql).all(...params) as Array<{ doc: string }>;
    const docs = rows.map((row) => JSON.parse(row.doc) as T);
    return applyFilter(docs, filter);
  }

  async count(filter?: Filter<T>): Promise<number> {
    const rows = await this.list({ ...filter, limit: 0, offset: 0 });
    return rows.length;
  }

  async put(entity: T): Promise<T> {
    const anyEntity = entity as unknown as Record<string, unknown>;
    const tenantId = typeof anyEntity.tenantId === 'string' ? anyEntity.tenantId : '';
    const createdAt = typeof anyEntity.createdAt === 'string' ? anyEntity.createdAt : '';
    const updatedAt = typeof anyEntity.updatedAt === 'string' ? anyEntity.updatedAt : createdAt;
    this.db
      .prepare(
        `INSERT INTO ${this.table} (id, tenant_id, created_at, updated_at, doc)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tenant_id = excluded.tenant_id,
           updated_at = excluded.updated_at,
           doc = excluded.doc`,
      )
      .run(entity.id, tenantId, createdAt, updatedAt, JSON.stringify(entity));
    return entity;
  }

  async patch(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...partial, id } as T;
    return this.put(updated);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
    return Number(result.changes ?? 0) > 0;
  }

  private buildQuery(filter?: Filter<T>): { sql: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const where = filter?.where ?? {};
    const tenantId = (where as Record<string, unknown>).tenantId;
    if (typeof tenantId === 'string' && tenantId) {
      clauses.push('tenant_id = ?');
      params.push(tenantId);
    }
    const id = (where as Record<string, unknown>).id;
    if (typeof id === 'string' && id) {
      clauses.push('id = ?');
      params.push(id);
    }
    const column = 'created_at';
    const direction = filter?.order === 'asc' ? 'ASC' : 'DESC';
    // Only push LIMIT/OFFSET into SQL when every `where` key is handled above.
    // Otherwise the residual keys are applied in JS *after* the query, and a
    // SQL LIMIT would silently truncate rows before they are filtered.
    const pushdownKeys = new Set(['tenantId', 'id']);
    const hasResidual = Object.entries(where).some(([key, value]) => value !== undefined && !pushdownKeys.has(key));
    const limit =
      hasResidual || !filter?.limit || filter.limit <= 0 ? 1000 : Math.min(filter.limit, MAX_LIMIT);
    const offset = hasResidual ? 0 : filter?.offset ?? 0;
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return {
      sql: `SELECT doc FROM ${this.table} ${whereSql} ORDER BY ${column} ${direction} LIMIT ? OFFSET ?`,
      params: [...params, limit, offset],
    };
  }
}

export class SqliteStore implements Store {
  readonly kind = 'sqlite';
  private db!: DatabaseSync;

  tenants!: Repository<any>;
  customers!: Repository<any>;
  conversations!: Repository<any>;
  messages!: Repository<any>;
  products!: Repository<any>;
  orders!: Repository<any>;
  knowledge!: Repository<any>;
  reports!: Repository<any>;

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    if (this.filePath !== ':memory:') {
      mkdirSync(path.dirname(path.resolve(this.filePath)), { recursive: true });
    }
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    for (const table of COLLECTIONS) {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (
           id TEXT PRIMARY KEY,
           tenant_id TEXT,
           created_at TEXT,
           updated_at TEXT,
           doc TEXT NOT NULL
         );`,
      );
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_created ON ${table}(created_at);`);
    }
    for (const table of COLLECTIONS) {
      (this as unknown as Record<string, unknown>)[table] = new SqliteRepository(this.db, table);
    }
  }

  async close(): Promise<void> {
    this.db?.close();
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const row = this.db.prepare('SELECT 1 AS ok').get() as { ok: number };
      return { ok: row.ok === 1, detail: `sqlite file=${this.filePath}` };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }
}

export const sqliteStore = (filePath: string): SqliteStore => new SqliteStore(filePath);
