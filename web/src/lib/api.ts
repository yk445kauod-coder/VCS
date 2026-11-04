export type ChannelKind = 'whatsapp' | 'webchat' | 'webhook' | 'email' | 'mcp' | 'api';
export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  tags: string[];
  aliases: string[];
  active: boolean;
  upsells: UpsellRule[];
  stock?: number;
}

export interface UpsellRule {
  strategy: 'bundle' | 'cross_sell' | 'upgrade' | 'quantity' | 'renewal' | 'win_back';
  targetSku: string;
  discountPercent?: number;
  pitch?: string;
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
  purchaseProbability: number;
  upsellOffered?: string;
  upsellAccepted?: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  channel: ChannelKind;
  externalId: string;
  tags: string[];
  ltv: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  channel: ChannelKind;
  status: 'open' | 'escalated' | 'closed';
  subject?: string;
  summary?: string;
  intent?: string;
  sentiment?: number;
  customerName?: string;
  updatedAt: string;
}

export interface AgentAction {
  kind: string;
  label: string;
  payload?: Record<string, unknown>;
  confidence?: number;
}

export interface Message {
  id: string;
  role: 'customer' | 'agent' | 'human' | 'system';
  content: string;
  actions?: AgentAction[];
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

export interface Overview {
  tenantId: string;
  currency: string;
  metrics: RevenueMetrics;
  counts: {
    conversations: number;
    openConversations: number;
    escalated: number;
    customers: number;
    products: number;
    knowledgeDocuments: number;
    reports: number;
  };
  series: Array<{ date: string; orders: number; revenue: number }>;
  recentOrders: Order[];
  escalatedConversations: Conversation[];
  channels: Array<{ kind: string; enabled: boolean }>;
}

export interface Report {
  id: string;
  kind: string;
  title: string;
  narrative: string;
  metrics: Record<string, number>;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  about?: string;
  tone?: string;
  currency: string;
  locale: string;
  websiteUrl?: string;
  settings: Record<string, unknown>;
}

export interface KnowledgeSummary {
  id: string;
  title: string;
  source: string;
  url?: string;
  chunks: number;
  characters: number;
  createdAt: string;
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
  orderIds: string[];
}

export interface RuntimeStatus {
  status: string;
  version: string;
  store: { kind: string; ok: boolean; detail: string };
  ai: { provider: string; model?: string };
  channels: Array<{ kind: string; enabled: boolean }>;
  at: string;
}

/** Thin fetch wrapper: injects the admin token and unwraps Duty's error envelope. */
export class DutyClient {
  constructor(
    private readonly baseUrl = '',
    private token = '',
  ) {}

  setToken(token: string): void {
    this.token = token;
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('x-admin-token', this.token);
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } })?.error?.message ?? `Request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  health = () => this.get<RuntimeStatus>('/api/health');
  overview = (days = 30) => this.get<Overview>(`/api/overview?days=${days}`);
  settings = () => this.get<{ tenant: Tenant; runtime: Record<string, unknown> }>('/api/settings');

  patchSettings = (body: Record<string, unknown>) => this.patch<Tenant>('/api/settings', body);

  conversations = (query = '') => this.get<{ items: Conversation[] }>(`/api/conversations${query}`);
  conversation = (id: string) =>
    this.get<{ conversation: Conversation; messages: Message[]; customer: Customer; orders: Order[] }>(
      `/api/conversations/${id}`,
    );
  reply = (id: string, text: string) => this.post<Message>(`/api/conversations/${id}/reply`, { text });
  setConversationStatus = (id: string, status: string) =>
    this.post<Conversation>(`/api/conversations/${id}/status`, { status });

  customers = (query = '') => this.get<{ items: Customer[] }>(`/api/customers${query}`);
  customer = (id: string) =>
    this.get<{ customer: Customer; conversations: Conversation[]; orders: Order[] }>(`/api/customers/${id}`);

  products = (query = '') => this.get<{ items: Product[] }>(`/api/products${query}`);
  createProduct = (body: unknown) => this.post<Product>('/api/products', body);
  updateProduct = (id: string, body: unknown) => this.patch<Product>(`/api/products/${id}`, body);
  deleteProduct = (id: string) => this.del<{ removed: boolean }>(`/api/products/${id}`);
  importProducts = (csv: string) => this.post<{ imported: number }>('/api/products/import', { csv });

  orders = (query = '') => this.get<{ items: Order[] }>(`/api/orders${query}`);
  order = (id: string) => this.get<{ order: Order; customer?: Customer }>(`/api/orders/${id}`);
  setOrderStatus = (id: string, status: OrderStatus) => this.post<Order>(`/api/orders/${id}/status`, { status });
  orderUpsells = (id: string) =>
    this.get<{
      items: Array<{ sku: string; name: string; price: string; strategy: string; probability: number; expectedRevenue: string; reason: string }>;
    }>(`/api/orders/${id}/upsell`);

  knowledge = () => this.get<{ items: KnowledgeSummary[] }>('/api/knowledge');
  ingestText = (title: string, content: string) => this.post('/api/knowledge/text', { title, content });
  ingestWebsite = (url: string, maxPages = 8) =>
    this.post<{ pages: number; documents: number; profileApplied: boolean }>('/api/knowledge/website', { url, maxPages });
  ingestFaq = (entries: Array<{ question: string; answer: string }>) => this.post('/api/knowledge/faq', { entries });
  refreshProfile = () => this.post<{ applied: boolean; source: string }>('/api/knowledge/profile/refresh', {});
  removeKnowledge = (id: string) => this.del<{ removed: boolean }>(`/api/knowledge/${id}`);

  async uploadKnowledge(file: File): Promise<{ chunks: number; characters: number }> {
    const form = new FormData();
    form.append('file', file);
    const headers = new Headers();
    if (this.token) headers.set('x-admin-token', this.token);
    const response = await fetch('/api/knowledge/upload', { method: 'POST', body: form, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? 'Upload failed');
    return payload;
  }

  reports = () => this.get<{ items: Report[] }>('/api/reports');
  generateReport = (days: number, format: 'json' | 'markdown' = 'markdown') =>
    this.post<{ markdown?: string; report: Report }>('/api/reports/generate', { days, format });

  agentMessage = (text: string, externalId = 'dashboard-tester') =>
    this.post<AgentTurn>('/api/agent/message', { text, externalId });

  runFollowups = (dryRun = true) =>
    this.post<{ sent: number; results: Array<Record<string, unknown>> }>('/api/automation/followups', { dryRun, minProbability: 0.2 });

  sendDailyReport = (email?: string) =>
    this.post<{ delivered: boolean; markdown: string }>('/api/automation/daily-report', { days: 1, email });

  bootstrap = (body: unknown) => this.post<{ tenant: Tenant }>('/api/bootstrap', body);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const client = new DutyClient();

export function subscribeToEvents(onEvent: (event: string, payload: unknown) => void, token: string): () => void {
  const url = `/api/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);
  const events = [
    'message.inbound',
    'message.outbound',
    'order.created',
    'order.updated',
    'order.paid',
    'upsell.offered',
    'upsell.accepted',
    'conversation.escalated',
    'report.generated',
    'knowledge.ingested',
  ];
  for (const event of events) {
    source.addEventListener(event, (message) => {
      const payload = safeJson((message as MessageEvent).data);
      onEvent(event, payload);
    });
  }
  return () => source.close();
}
