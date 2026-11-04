import type { BaseDoc, Filter, Repository, Store, CollectionName } from './types.js';
import { applyFilter } from './filter.js';
import { nowIso } from '../core/ids.js';

/** In-memory store. Used by tests and as a zero-dependency fallback. */
export class MemoryRepository<T extends BaseDoc> implements Repository<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly clone = true) {}

  private copy(doc: T): T {
    return this.clone ? (JSON.parse(JSON.stringify(doc)) as T) : doc;
  }

  async get(id: string): Promise<T | null> {
    const doc = this.map.get(id);
    return doc ? this.copy(doc) : null;
  }

  async list(filter?: Filter<T>): Promise<T[]> {
    return applyFilter([...this.map.values()], filter).map((doc) => this.copy(doc));
  }

  async count(filter?: Filter<T>): Promise<number> {
    return applyFilter([...this.map.values()], { ...filter, limit: 0, offset: 0 }).length;
  }

  async put(entity: T): Promise<T> {
    this.map.set(entity.id, this.copy(entity));
    return this.copy(entity);
  }

  async patch(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = this.map.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...partial, id } as T;
    this.map.set(id, this.copy(updated));
    return this.copy(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.map.delete(id);
  }

  seed(docs: T[]): void {
    for (const doc of docs) this.map.set(doc.id, this.copy(doc));
  }
}

export class MemoryStore implements Store {
  readonly kind = 'memory';
  tenants = new MemoryRepository<any>();
  customers = new MemoryRepository<any>();
  conversations = new MemoryRepository<any>();
  messages = new MemoryRepository<any>();
  products = new MemoryRepository<any>();
  orders = new MemoryRepository<any>();
  knowledge = new MemoryRepository<any>();
  reports = new MemoryRepository<any>();

  async init(): Promise<void> {
    /* nothing to do */
  }

  async close(): Promise<void> {
    /* nothing to do */
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: `in-memory store, ${nowIso()}` };
  }
}

export const memoryStore = (): MemoryStore => new MemoryStore();

export type { CollectionName };
