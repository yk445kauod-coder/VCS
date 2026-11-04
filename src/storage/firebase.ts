import { initializeApp, cert, deleteApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import type { BaseDoc, Filter, Repository, Store } from './types.js';
import { applyFilter } from './filter.js';

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

/** Firebase Realtime Database adapter. Every collection is a flat node of docs. */
class FirebaseRepository<T extends BaseDoc> implements Repository<T> {
  constructor(
    private readonly db: Database,
    private readonly table: Collection,
  ) {}

  private node(): ReturnType<Database['ref']> {
    return this.db.ref(this.table);
  }

  async get(id: string): Promise<T | null> {
    const snapshot = await this.node().child(id).get();
    return snapshot.exists() ? (snapshot.val() as T) : null;
  }

  async list(filter?: Filter<T>): Promise<T[]> {
    const snapshot = await this.node().get();
    const value = snapshot.val() as Record<string, T> | null;
    if (!value) return [];
    const docs = Object.values(value);
    return applyFilter(docs, filter);
  }

  async count(filter?: Filter<T>): Promise<number> {
    return (await this.list({ ...filter, limit: 0, offset: 0 })).length;
  }

  async put(entity: T): Promise<T> {
    await this.node().child(entity.id).set(JSON.parse(JSON.stringify(entity)));
    return entity;
  }

  async patch(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    return this.put({ ...existing, ...partial, id } as T);
  }

  async delete(id: string): Promise<boolean> {
    await this.node().child(id).remove();
    return true;
  }
}

export class FirebaseStore implements Store {
  readonly kind = 'firebase';
  private app!: App;
  private db!: Database;

  tenants!: Repository<any>;
  customers!: Repository<any>;
  conversations!: Repository<any>;
  messages!: Repository<any>;
  products!: Repository<any>;
  orders!: Repository<any>;
  knowledge!: Repository<any>;
  reports!: Repository<any>;

  constructor(
    private readonly databaseUrl: string,
    private readonly serviceAccountJson: string,
  ) {}

  async init(): Promise<void> {
    const credential = this.serviceAccountJson
      ? cert(JSON.parse(this.serviceAccountJson))
      : undefined;
    this.app = initializeApp(
      { databaseURL: this.databaseUrl, ...(credential ? { credential } : {}) },
      `duty-${Date.now()}`,
    );
    this.db = getDatabase(this.app);
    for (const table of COLLECTIONS) {
      (this as unknown as Record<string, unknown>)[table] = new FirebaseRepository(this.db, table);
    }
  }

  async close(): Promise<void> {
    if (this.app) await deleteApp(this.app);
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.db.ref('tenants').limitToFirst(1).get();
      return { ok: true, detail: 'firebase rtdb reachable' };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }
}

export const firebaseStore = (url: string, serviceAccountJson: string): FirebaseStore =>
  new FirebaseStore(url, serviceAccountJson);
