import type { Order, Product, UpsellRule, UpsellStrategy } from '../core/types.js';
import { createLogger } from '../core/logger.js';
import type { CatalogService } from './catalog.js';

const log = createLogger('upsell');

export interface UpsellOpportunity {
  rule: UpsellRule;
  product: Product;
  /** Expected incremental revenue in minor units. */
  expectedRevenue: number;
  /** 0..1 likelihood the customer takes it. */
  probability: number;
  reason: string;
}

const STRATEGY_BASE: Record<UpsellStrategy, number> = {
  bundle: 0.42,
  cross_sell: 0.34,
  upgrade: 0.3,
  quantity: 0.46,
  renewal: 0.5,
  win_back: 0.18,
};

/**
 * Revenue engine. Given a cart + customer context it ranks the next best offer
 * using the rules the merchant attached to their products. Deterministic so
 * results are reproducible in tests and explainable to the merchant.
 */
export class UpsellEngine {
  constructor(private readonly catalog: CatalogService) {}

  async findOpportunities(input: {
    tenantId: string;
    order: Order;
    cartProducts: Product[];
    customerLtv?: number;
    strategyPreference?: UpsellStrategy;
  }): Promise<UpsellOpportunity[]> {
    const { tenantId, order, cartProducts } = input;
    const inCart = new Set(order.lines.map((line) => line.sku));
    const opportunities: UpsellOpportunity[] = [];

    for (const product of cartProducts) {
      for (const rule of product.upsells ?? []) {
        if (!rule.active) continue;
        if (inCart.has(rule.targetSku)) continue;
        if (rule.minSubtotal && order.subtotal < rule.minSubtotal) continue;
        if (input.strategyPreference && rule.strategy !== input.strategyPreference) continue;
        const target = await this.catalog.findBySku(tenantId, rule.targetSku);
        if (!target || !target.active) continue;
        if (typeof target.stock === 'number' && target.stock <= 0) continue;

        const price = rule.discountPercent
          ? Math.round(target.price * (1 - rule.discountPercent / 100))
          : target.price;
        const probability = this.score(rule, order, target, input.customerLtv ?? 0);
        opportunities.push({
          rule,
          product: target,
          expectedRevenue: Math.round(price * probability),
          probability,
          reason: this.explain(rule, target),
        });
      }
    }

    const deduped = new Map<string, UpsellOpportunity>();
    for (const opportunity of opportunities) {
      const key = opportunity.product.sku;
      const existing = deduped.get(key);
      if (!existing || opportunity.expectedRevenue > existing.expectedRevenue) {
        deduped.set(key, opportunity);
      }
    }

    const ranked = [...deduped.values()].sort((a, b) => {
      if (b.expectedRevenue !== a.expectedRevenue) return b.expectedRevenue - a.expectedRevenue;
      return a.rule.priority - b.rule.priority;
    });
    log.debug(`found ${ranked.length} upsell opportunities for order ${order.number}`);
    return ranked;
  }

  async best(input: Parameters<UpsellEngine['findOpportunities']>[0]): Promise<UpsellOpportunity | null> {
    const opportunities = await this.findOpportunities(input);
    return opportunities[0] ?? null;
  }

  private score(rule: UpsellRule, order: Order, target: Product, ltv: number): number {
    let probability = STRATEGY_BASE[rule.strategy] ?? 0.3;
    // Attach-rate style decay: the more expensive relative to the cart, the less likely.
    const ratio = target.price / Math.max(1, order.subtotal);
    probability -= Math.min(0.2, ratio * 0.25);
    // Discounts lift conversion.
    if (rule.discountPercent) probability += Math.min(0.15, rule.discountPercent / 200);
    // Loyalty lifts conversion.
    probability += Math.min(0.12, ltv / 1_000_000);
    // Priority is a merchant-controlled nudge.
    probability += Math.min(0.08, (10 - Math.min(10, rule.priority)) * 0.008);
    return Math.round(Math.min(0.95, Math.max(0.05, probability)) * 100) / 100;
  }

  private explain(rule: UpsellRule, target: Product): string {
    switch (rule.strategy) {
      case 'bundle':
        return `Pairs naturally with the cart as a bundle (${target.name}).`;
      case 'cross_sell':
        return `Customers who bought the cart items also buy ${target.name}.`;
      case 'upgrade':
        return `A higher tier that unlocks more value: ${target.name}.`;
      case 'quantity':
        return `Buying more of ${target.name} lowers the unit cost.`;
      case 'renewal':
        return `Keeps the customer on ${target.name} instead of lapsing.`;
      case 'win_back':
        return `A reason to come back: ${target.name}.`;
      default:
        return `Recommended next purchase: ${target.name}.`;
    }
  }

  /** Aggregate performance of the upsell programme. */
  static summarize(orders: Order[]): {
    offers: number;
    accepts: number;
    acceptanceRate: number;
    revenue: number;
    byStrategy: Record<string, { offers: number; accepts: number; revenue: number }>;
  } {
    const byStrategy: Record<string, { offers: number; accepts: number; revenue: number }> = {};
    let offers = 0;
    let accepts = 0;
    let revenue = 0;
    for (const order of orders) {
      if (!order.upsellOffered) continue;
      offers += 1;
      if (order.upsellAccepted) {
        accepts += 1;
        revenue += order.total;
      }
      const strategy = String(order.metadata?.upsellStrategy ?? 'unknown');
      byStrategy[strategy] ??= { offers: 0, accepts: 0, revenue: 0 };
      byStrategy[strategy].offers += 1;
      if (order.upsellAccepted) {
        byStrategy[strategy].accepts += 1;
        byStrategy[strategy].revenue += order.total;
      }
    }
    return {
      offers,
      accepts,
      acceptanceRate: offers ? Math.round((accepts / offers) * 10000) / 10000 : 0,
      revenue,
      byStrategy,
    };
  }
}
