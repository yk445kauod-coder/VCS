import type {
  Conversation,
  Customer,
  KnowledgeDocument,
  Message,
  Order,
  Product,
  Report,
  Tenant,
} from '../core/types.js';

export interface BaseDoc {
  id: string;
}

export type SortOrder = 'asc' | 'desc';

export interface Filter<T> {
  /** Equality match on top-level fields (shallow). */
  where?: Partial<Record<keyof T | string, unknown>>;
  /** Full-text-ish substring match across the given fields. */
  search?: { fields: Array<keyof T | string>; term: string };
  limit?: number;
  offset?: number;
  orderBy?: keyof T | string;
  order?: SortOrder;
}

export interface Repository<T extends BaseDoc> {
  get(id: string): Promise<T | null>;
  list(filter?: Filter<T>): Promise<T[]>;
  count(filter?: Filter<T>): Promise<number>;
  put(entity: T): Promise<T>;
  patch(id: string, partial: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export type CollectionName =
  | 'tenants'
  | 'customers'
  | 'conversations'
  | 'messages'
  | 'products'
  | 'orders'
  | 'knowledge'
  | 'reports';

export interface Store {
  readonly kind: string;
  init(): Promise<void>;
  close(): Promise<void>;
  health(): Promise<{ ok: boolean; detail: string }>;
  tenants: Repository<Tenant>;
  customers: Repository<Customer>;
  conversations: Repository<Conversation>;
  messages: Repository<Message>;
  products: Repository<Product>;
  orders: Repository<Order>;
  knowledge: Repository<KnowledgeDocument>;
  reports: Repository<Report>;
}
