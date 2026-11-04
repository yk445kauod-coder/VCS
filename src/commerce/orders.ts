import type { Store } from '../storage/index.js';
import type {
  ChannelKind,
  Order,
  OrderLine,
  OrderStatus,
  Product,
} from '../core/types.js';
import { newId, nowIso, orderNumber } from '../core/ids.js';
import { badRequest, notFound } from '../core/errors.js';
import { clamp01, percent } from '../core/money.js';
import type { CatalogService } from './catalog.js';

export interface OrderItemInput {
  sku?: string;
  productId?: string;
  quantity?: number;
}

export interface CreateOrderInput {
  tenantId: string;
  customerId: string;
  conversationId?: string;
  channel: ChannelKind;
  items: OrderItemInput[];
  currency?: string;
  shipping?: number;
  discount?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ProbabilitySignals {
  intentConfidence: number;
  intent: string;
  messageCount: number;
  customerLtv: number;
  hasMatchingProduct: boolean;
  sentiment: number;
}

/** Heuristic purchase-probability model. Deterministic, explainable, tunable. */
export function estimatePurchaseProbability(signals: ProbabilitySignals): number {
  let score = 0.18;
  score += clamp01(signals.intentConfidence) * 0.3;
  if (signals.intent === 'order_intent') score += 0.22;
  if (signals.intent === 'price_inquiry') score += 0.12;
  if (signals.hasMatchingProduct) score += 0.12;
  score += Math.min(0.1, signals.messageCount * 0.02);
  score += Math.min(0.08, signals.customerLtv / 500_000);
  score += (signals.sentiment - 0.5) * 0.1;
  return Math.round(clamp01(score) * 100) / 100;
}

export class OrderService {
  constructor(
    private readonly store: Store,
    private readonly catalog: CatalogService,
    private readonly defaultCurrency = 'USD',
  ) {}

  async list(
    tenantId: string,
    options: { status?: OrderStatus; limit?: number; offset?: number } = {},
  ): Promise<Order[]> {
    return this.store.orders.list({
      where: { tenantId, ...(options.status ? { status: options.status } : {}) },
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      orderBy: 'createdAt',
      order: 'desc',
    });
  }

  async get(tenantId: string, id: string): Promise<Order | null> {
    const order = await this.store.orders.get(id);
    if (!order || order.tenantId !== tenantId) return null;
    return order;
  }

  async lastForCustomer(tenantId: string, customerId: string): Promise<Order | null> {
    const orders = await this.store.orders.list({
      where: { tenantId, customerId },
      limit: 1,
      orderBy: 'createdAt',
      order: 'desc',
    });
    return orders[0] ?? null;
  }

  async listForCustomer(tenantId: string, customerId: string): Promise<Order[]> {
    return this.store.orders.list({ where: { tenantId, customerId }, limit: 100, orderBy: 'createdAt', order: 'desc' });
  }

  /** Build (or extend) a draft order for a conversation, resolving items to products. */
  async create(input: CreateOrderInput): Promise<Order> {
    if (!input.items.length) throw badRequest('An order needs at least one item');
    const currency = input.currency || this.defaultCurrency;
    const lines: OrderLine[] = [];

    for (const item of input.items) {
      const product = item.productId
        ? await this.catalog.get(input.tenantId, item.productId)
        : item.sku
          ? await this.catalog.findBySku(input.tenantId, item.sku)
          : null;
      if (!product) throw badRequest(`Unknown product: ${item.sku ?? item.productId}`);
      const quantity = Math.max(1, Math.round(item.quantity ?? 1));
      lines.push({
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.price,
        total: product.price * quantity,
      });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
    const discount = input.discount ?? 0;
    const shipping = input.shipping ?? 0;
    const now = nowIso();

    const order: Order = {
      id: newId('ord'),
      tenantId: input.tenantId,
      number: orderNumber(),
      customerId: input.customerId,
      conversationId: input.conversationId,
      channel: input.channel,
      status: 'draft',
      lines,
      subtotal,
      discount,
      shipping,
      total: Math.max(0, subtotal - discount + shipping),
      currency,
      purchaseProbability: 0.5,
      notes: input.notes,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    return this.store.orders.put(order);
  }

  async addItem(tenantId: string, orderId: string, item: OrderItemInput): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    const product = item.productId
      ? await this.catalog.get(tenantId, item.productId)
      : item.sku
        ? await this.catalog.findBySku(tenantId, item.sku)
        : null;
    if (!product) throw badRequest(`Unknown product: ${item.sku ?? item.productId}`);
    const quantity = Math.max(1, Math.round(item.quantity ?? 1));
    const existing = order.lines.find((line) => line.sku === product.sku);
    if (existing) {
      existing.quantity += quantity;
      existing.total = existing.unitPrice * existing.quantity;
    } else {
      order.lines.push({
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.price,
        total: product.price * quantity,
      });
    }
    return this.recalculate(order);
  }

  async removeItem(tenantId: string, orderId: string, sku: string): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    order.lines = order.lines.filter((line) => line.sku !== sku);
    return this.recalculate(order);
  }

  async setStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    order.status = status;
    order.updatedAt = nowIso();
    if (status === 'paid') order.purchaseProbability = 1;
    if (status === 'cancelled' || status === 'refunded') order.purchaseProbability = 0;
    return this.store.orders.put(order);
  }

  async applyDiscount(tenantId: string, orderId: string, discount: number): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    order.discount = Math.max(0, Math.round(discount));
    return this.recalculate(order);
  }

  async markUpsell(tenantId: string, orderId: string, sku: string, accepted: boolean): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    order.upsellOffered = sku;
    order.upsellAccepted = accepted;
    order.updatedAt = nowIso();
    return this.store.orders.put(order);
  }

  async setProbability(tenantId: string, orderId: string, probability: number): Promise<Order> {
    const order = await this.get(tenantId, orderId);
    if (!order) throw notFound('Order');
    order.purchaseProbability = clamp01(probability);
    order.updatedAt = nowIso();
    return this.store.orders.put(order);
  }

  private async recalculate(order: Order): Promise<Order> {
    order.subtotal = order.lines.reduce((sum, line) => sum + line.total, 0);
    order.total = Math.max(0, order.subtotal - order.discount + order.shipping);
    order.updatedAt = nowIso();
    return this.store.orders.put(order);
  }

  static lineCount(order: Order): number {
    return order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  static discountRate(order: Order): number {
    return percent(order.discount, order.subtotal);
  }
}

export type { Product };
