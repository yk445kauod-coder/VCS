/**
 * Duty domain model. These types are the contract every storage adapter,
 * channel and UI surface shares. Keep them serialisable (plain JSON) so the
 * same objects can live in SQLite, Postgres, Supabase or Firebase.
 */

export type ChannelKind = 'whatsapp' | 'webchat' | 'webhook' | 'email' | 'mcp' | 'api';

export type ConversationStatus = 'open' | 'escalated' | 'closed';

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded';

export type MessageRole = 'customer' | 'agent' | 'human' | 'system';

export interface Money {
  /** Amount in minor units (cents) to avoid float drift. */
  amount: number;
  currency: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  channel: ChannelKind;
  /** Channel-scoped identity: phone number, session id, email, external id. */
  externalId: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
  tags: string[];
  /** Lifetime value in minor units. */
  ltv: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  tenantId: string;
  customerId: string;
  channel: ChannelKind;
  status: ConversationStatus;
  subject?: string;
  /** Rolling summary produced by the brain, used to keep prompts small. */
  summary?: string;
  intent?: string;
  sentiment?: number;
  escalationReason?: string;
  assignedTo?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Structured actions the agent took alongside the text reply. */
  actions?: AgentAction[];
  attachments?: Attachment[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Attachment {
  name: string;
  url: string;
  mimeType?: string;
}

export type AgentActionKind =
  | 'reply'
  | 'create_order'
  | 'update_order'
  | 'offer_upsell'
  | 'escalate'
  | 'send_report'
  | 'schedule_followup'
  | 'noop';

export interface AgentAction {
  kind: AgentActionKind;
  label: string;
  payload?: Record<string, unknown>;
  confidence?: number;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  tags: string[];
  /** Extra search terms (synonyms, other languages) used to match customer wording. */
  aliases: string[];
  /** Upsell rules attached to this product. */
  upsells: UpsellRule[];
  stock?: number;
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type UpsellStrategy =
  | 'bundle'
  | 'cross_sell'
  | 'upgrade'
  | 'quantity'
  | 'renewal'
  | 'win_back';

export interface UpsellRule {
  strategy: UpsellStrategy;
  /** SKU to offer. */
  targetSku: string;
  /** Optional discount in percent (0-100) applied when accepted. */
  discountPercent?: number;
  /** Message the agent should adapt when presenting the offer. */
  pitch?: string;
  /** Only trigger when cart subtotal is at least this many minor units. */
  minSubtotal?: number;
  priority: number;
  active: boolean;
}

export interface OrderLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  tenantId: string;
  number: string;
  customerId: string;
  conversationId?: string;
  channel: ChannelKind;
  status: OrderStatus;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  currency: string;
  /** Probability the customer will convert, 0..1. */
  purchaseProbability: number;
  upsellOffered?: string;
  upsellAccepted?: boolean;
  notes?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  title: string;
  source: 'file' | 'website' | 'text' | 'faq' | 'manual';
  url?: string;
  content: string;
  /** Chunks used for retrieval; each has its own embedding vector. */
  chunks: KnowledgeChunk[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  embedding?: number[];
}

export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  websiteUrl?: string;
  /** Short description of the business, injected into every prompt. */
  about?: string;
  tone?: string;
  currency: string;
  locale: string;
  /** Provider settings can be overridden per tenant (BYOK per customer). */
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  aiProvider?: string;
  aiModel?: string;
  aiApiKeyRef?: string;
  autoReply?: boolean;
  escalationThreshold?: number;
  businessHours?: string;
  timezone?: string;
  goals?: string[];
  [key: string]: unknown;
}

export interface Report {
  id: string;
  tenantId: string;
  kind: 'daily' | 'weekly' | 'revenue' | 'funnel' | 'upsell';
  title: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, number>;
  narrative: string;
  createdAt: string;
}

export interface RevenueMetrics {
  orders: number;
  paidOrders: number;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  averageOrderValue: number;
  conversionRate: number;
  upsellOffers: number;
  upsellAccepts: number;
  upsellRevenue: number;
  upsellAcceptanceRate: number;
  pipelineValue: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  topProducts: Array<{ sku: string; name: string; quantity: number; revenue: number }>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface InboundMessage {
  tenantId: string;
  channel: ChannelKind;
  externalId: string;
  text: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface AgentTurn {
  conversationId: string;
  customerId: string;
  reply: string;
  actions: AgentAction[];
  intent: string;
  sentiment: number;
  confidence: number;
  escalated: boolean;
  /** Orders created or updated during the turn. */
  orderIds: string[];
  upsell?: UpsellRule & { product?: Product };
}
