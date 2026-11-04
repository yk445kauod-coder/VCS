import pg from 'pg';
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

/** JSONB document repository. Works with Postgres, Neon, Supabase Postgres, RDS. */
class PostgresRepository<T extends BaseDoc> implements Repository<T> {
  constructor(
    private readonly pool: pg.Pool,
    private readonly table: Collection,
  ) {}

  async get(id: string): Promise<T | null> {
    const { rows } = await this.pool.query(`SELECT doc FROM ${this.table} WHERE id = $1`, [id]);
    return rows[0] ? (rows[0].doc as T) : null;
  }

  async list(filter?: Filter<T>): Promise<T[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const where = (filter?.where ?? {}) as Record<string, unknown>;
    if (typeof where.tenantId === 'string' && where.tenantId) {
      params.push(where.tenantId);
      clauses.push(`tenant_id = $${params.length}`);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // Residual `where` keys are applied in JS after the query, so keep the SQL
    // window wide when any are present.
    const pushdownKeys = new Set(['tenantId']);
    const hasResidual = Object.entries(where).some(([key, value]) => value !== undefined && !pushdownKeys.has(key));
    const limit =
      hasResidual || !filter?.limit || filter.limit <= 0 ? 1000 : Math.min(filter.limit, MAX_LIMIT);
    const offset = hasResidual ? 0 : filter?.offset ?? 0;
    const direction = filter?.order === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await this.pool.query(
      `SELECT doc FROM ${this.table} ${whereSql} ORDER BY created_at ${direction} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return applyFilter(rows.map((row) => row.doc as T), filter);
  }

  async count(filter?: Filter<T>): Promise<number> {
    return (await this.list({ ...filter, limit: 0, offset: 0 })).length;
  }

  async put(entity: T): Promise<T> {
    const anyEntity = entity as unknown as Record<string, unknown>;
    const tenantId = typeof anyEntity.tenantId === 'string' ? anyEntity.tenantId : null;
    const createdAt = typeof anyEntity.createdAt === 'string' ? anyEntity.createdAt : new Date().toISOString();
    const updatedAt = typeof anyEntity.updatedAt === 'string' ? anyEntity.updatedAt : createdAt;
    await this.pool.query(
      `INSERT INTO ${this.table} (id, tenant_id, created_at, updated_at, doc)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = EXCLUDED.updated_at, doc = EXCLUDED.doc`,
      [entity.id, tenantId, createdAt, updatedAt, JSON.stringify(entity)],
    );
    return entity;
  }

  async patch(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    return this.put({ ...existing, ...partial, id } as T);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresStore implements Store {
  readonly kind = 'postgres';
  private pool!: pg.Pool;

  tenants!: Repository<any>;
  customers!: Repository<any>;
  conversations!: Repository<any>;
  messages!: Repository<any>;
  products!: Repository<any>;
  orders!: Repository<any>;
  knowledge!: Repository<any>;
  reports!: Repository<any>;

  constructor(private readonly connectionString: string) {}

  async init(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.connectionString,
      max: 10,
      ssl: /sslmode=require|neon\.tech|supabase\.co/.test(this.connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    for (const table of COLLECTIONS) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${table} (
           id TEXT PRIMARY KEY,
           tenant_id TEXT,
           created_at TIMESTAMPTZ DEFAULT now(),
           updated_at TIMESTAMPTZ DEFAULT now(),
           doc JSONB NOT NULL
         );`,
      );
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_created ON ${table}(created_at);`);
    }
    for (const table of COLLECTIONS) {
      (this as unknown as Record<string, unknown>)[table] = new PostgresRepository(this.pool, table);
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, detail: 'postgres connection ok' };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }
}

export const postgresStore = (connectionString: string): PostgresStore =>
  new PostgresStore(connectionString);
