import { createLogger } from '../core/logger.js';
import { newId, nowIso, truncate } from '../core/ids.js';
import { bus } from '../core/events.js';
import { formatMoney } from '../core/money.js';
import type { Order, Message } from '../core/types.js';
import type { Store } from '../storage/index.js';
import type { UpsellEngine } from './upsell.js';
import type { CatalogService } from './catalog.js';

const log = createLogger('followups');

export interface FollowUpResult {
  orderId: string;
  orderNumber: string;
  customerId: string;
  channel: string;
  message: string;
  expectedRevenue: number;
  probability: number;
}

/**
 * Revenue recovery. Draft orders that went quiet are the cheapest revenue a
 * merchant has; Duty nudges them with a message the channel can deliver.
 */
export class FollowUpService {
  constructor(
    private readonly store: Store,
    private readonly catalog: CatalogService,
    private readonly upsell: UpsellEngine,
  ) {}

  async findAbandoned(input: {
    tenantId: string;
    olderThanMinutes?: number;
    minProbability?: number;
    limit?: number;
  }): Promise<Order[]> {
    const olderThan = input.olderThanMinutes ?? 60;
    const minProbability = input.minProbability ?? 0.4;
    const cutoff = new Date(Date.now() - olderThan * 60_000).toISOString();
    const orders = await this.store.orders.list({
      where: { tenantId: input.tenantId, status: 'draft' },
      limit: 500,
      orderBy: 'createdAt',
      order: 'asc',
    });
    return orders
      .filter((order) => order.createdAt <= cutoff && order.purchaseProbability >= minProbability)
      .slice(0, input.limit ?? 25);
  }

  async run(input: {
    tenantId: string;
    olderThanMinutes?: number;
    minProbability?: number;
    limit?: number;
    dryRun?: boolean;
  }): Promise<FollowUpResult[]> {
    const tenant = await this.store.tenants.get(input.tenantId);
    if (!tenant) return [];
    const orders = await this.findAbandoned(input);
    const results: FollowUpResult[] = [];

    for (const order of orders) {
      const customer = await this.store.customers.get(order.customerId);
      if (!customer) continue;
      const cartProducts = (
        await Promise.all(order.lines.map((line) => this.catalog.findBySku(tenant.id, line.sku)))
      ).filter((product): product is NonNullable<typeof product> => Boolean(product));
      const opportunity = await this.upsell.best({
        tenantId: tenant.id,
        order,
        cartProducts,
        customerLtv: customer.ltv,
      });

      const currency = order.currency || tenant.currency;
      const item = order.lines[0]?.name ?? 'your order';
      let message =
        `Hi ${customer.name ?? 'there'} 👋 — your ${item} (${formatMoney(order.total, currency)}) ` +
        `is still reserved for you. Want me to confirm it now?`;
      if (opportunity) {
        message += ` Add ${opportunity.product.name} for ${formatMoney(opportunity.product.price, opportunity.product.currency)} and I'll include it.`;
      }

      if (!input.dryRun) {
        const outbound: Message = {
          id: newId('msg'),
          tenantId: tenant.id,
          conversationId: order.conversationId ?? '',
          role: 'agent',
          content: message,
          actions: [{ kind: 'schedule_followup', label: 'Abandoned-cart follow-up', payload: { orderId: order.id } }],
          metadata: { kind: 'followup' },
          createdAt: nowIso(),
        };
        if (order.conversationId) {
          await this.store.messages.put(outbound);
          bus.emit('message.outbound', {
            tenantId: tenant.id,
            conversationId: order.conversationId,
            channel: order.channel,
            text: message,
          });
        }
        await this.store.orders.patch(order.id, { updatedAt: nowIso() });
      }

      results.push({
        orderId: order.id,
        orderNumber: order.number,
        customerId: customer.id,
        channel: order.channel,
        message: truncate(message, 200),
        expectedRevenue: order.total,
        probability: order.purchaseProbability,
      });
    }

    log.info(`follow-up run: ${results.length} order(s)`, { tenantId: tenant.id, dryRun: Boolean(input.dryRun) });
    return results;
  }
}
