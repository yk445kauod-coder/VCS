import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

/** Supabase adapter over the PostgREST API (service-role key). */
class SupabaseRepository<T extends BaseDoc> implements Repository<T> {
  constructor(
    private readonly client: SupabaseClient,
    private readonly table: Collection,
  ) {}

  async get(id: string): Promise<T | null> {
    const { data, error } = await this.client.from(this.table).select('doc').eq('id', id).maybeSingle();
    if (error) throw new Error(`${this.table}.get: ${error.message}`);
    return (data?.doc as T) ?? null;
  }

  async list(filter?: Filter<T>): Promise<T[]> {
    let query = this.client.from(this.table).select('doc');
    const where = (filter?.where ?? {}) as Record<string, unknown>;
    if (typeof where.tenantId === 'string' && where.tenantId) query = query.eq('tenant_id', where.tenantId);
    const pushdownKeys = new Set(['tenantId']);
    const hasResidual = Object.entries(where).some(([key, value]) => value !== undefined && !pushdownKeys.has(key));
    const limit =
      hasResidual || !filter?.limit || filter.limit <= 0 ? 1000 : Math.min(filter.limit, MAX_LIMIT);
    const offset = hasResidual ? 0 : filter?.offset ?? 0;
    query = query
      .order('created_at', { ascending: filter?.order === 'asc' })
      .range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${this.table}.list: ${error.message}`);
    return applyFilter((data ?? []).map((row) => row.doc as T), filter);
  }

  async count(filter?: Filter<T>): Promise<number> {
    // list() windows at 1000 rows, so counting through it stops growing past that.
    // PostgREST can count server-side; only fall back to list() for residual filters.
    const where = (filter?.where ?? {}) as Record<string, unknown>;
    const pushdownKeys = new Set(['tenantId']);
    const hasResidual = Object.entries(where).some(
      ([key, value]) => value !== undefined && !pushdownKeys.has(key),
    );
    if (!hasResidual) {
      let query = this.client.from(this.table).select('id', { count: 'exact', head: true });
      if (typeof where.tenantId === 'string' && where.tenantId) query = query.eq('tenant_id', where.tenantId);
      const { count, error } = await query;
      if (error) throw new Error(`${this.table}.count: ${error.message}`);
      return count ?? 0;
    }
    return (await this.list({ ...filter, limit: 0, offset: 0 })).length;
  }

  async put(entity: T): Promise<T> {
    const anyEntity = entity as unknown as Record<string, unknown>;
    const row = {
      id: entity.id,
      tenant_id: typeof anyEntity.tenantId === 'string' ? anyEntity.tenantId : null,
      created_at: typeof anyEntity.createdAt === 'string' ? anyEntity.createdAt : new Date().toISOString(),
      updated_at: typeof anyEntity.updatedAt === 'string' ? anyEntity.updatedAt : new Date().toISOString(),
      doc: entity,
    };
    const { error } = await this.client.from(this.table).upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`${this.table}.put: ${error.message}`);
    return entity;
  }

  async patch(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    return this.put({ ...existing, ...partial, id } as T);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.client.from(this.table).delete().eq('id', id);
    if (error) throw new Error(`${this.table}.delete: ${error.message}`);
    return true;
  }
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase';
  private client!: SupabaseClient;

  tenants!: Repository<any>;
  customers!: Repository<any>;
  conversations!: Repository<any>;
  messages!: Repository<any>;
  products!: Repository<any>;
  orders!: Repository<any>;
  knowledge!: Repository<any>;
  reports!: Repository<any>;

  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
  ) {}

  async init(): Promise<void> {
    this.client = createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const table of COLLECTIONS) {
      (this as unknown as Record<string, unknown>)[table] = new SupabaseRepository(this.client, table);
    }
  }

  async close(): Promise<void> {
    /* supabase-js holds no persistent socket we must close */
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const { error } = await this.client.from('tenants').select('id').limit(1);
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: 'supabase reachable' };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }

  /** SQL to create the required tables, shown by `duty doctor` when missing. */
  static schemaSql(): string {
    return COLLECTIONS.map(
      (table) => `CREATE TABLE IF NOT EXISTS ${table} (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);
CREATE INDEX IF NOT EXISTS idx_${table}_created ON ${table}(created_at);`,
    ).join('\n');
  }
}

export const supabaseStore = (url: string, key: string): SupabaseStore => new SupabaseStore(url, key);
