import type { Store } from '../storage/index.js';
import type { Order, Report, RevenueMetrics, Tenant } from '../core/types.js';
import { newId, nowIso } from '../core/ids.js';
import { formatMoney, percent } from '../core/money.js';
import { createLogger } from '../core/logger.js';
import type { LLMProvider } from '../ai/provider.js';

const log = createLogger('analytics');

export interface ReportOptions {
  tenantId: string;
  kind?: Report['kind'];
  days?: number;
  now?: Date;
}

export class AnalyticsService {
  constructor(
    private readonly store: Store,
    private readonly provider: LLMProvider | null = null,
  ) {}

  async metrics(tenantId: string, options: { days?: number; now?: Date } = {}): Promise<RevenueMetrics> {
    const days = options.days ?? 30;
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    const orders = (await this.store.orders.list({ where: { tenantId }, limit: 5000 })).filter(
      (order) => order.createdAt >= since,
    );

    return this.computeMetrics(orders);
  }

  computeMetrics(orders: Order[]): RevenueMetrics {
    const paid = orders.filter((order) => order.status === 'paid' || order.status === 'fulfilled');
    const grossRevenue = paid.reduce((sum, order) => sum + order.total, 0);
    const discounts = paid.reduce((sum, order) => sum + order.discount, 0);
    const pipelineValue = orders
      .filter((order) => !['paid', 'fulfilled', 'cancelled', 'refunded'].includes(order.status))
      .reduce((sum, order) => sum + Math.round(order.total * order.purchaseProbability), 0);

    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const productMap = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();

    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
      if (order.status === 'paid' || order.status === 'fulfilled') {
        byChannel[order.channel] = (byChannel[order.channel] ?? 0) + order.total;
        for (const line of order.lines) {
          const entry = productMap.get(line.sku) ?? {
            sku: line.sku,
            name: line.name,
            quantity: 0,
            revenue: 0,
          };
          entry.quantity += line.quantity;
          entry.revenue += line.total;
          productMap.set(line.sku, entry);
        }
      }
    }

    const upsellOffers = orders.filter((order) => order.upsellOffered).length;
    const upsellAccepts = orders.filter((order) => order.upsellAccepted).length;
    const upsellRevenue = orders
      .filter((order) => order.upsellAccepted)
      .reduce((sum, order) => sum + order.total, 0);

    return {
      orders: orders.length,
      paidOrders: paid.length,
      grossRevenue,
      discounts,
      netRevenue: grossRevenue - discounts,
      averageOrderValue: paid.length ? Math.round(grossRevenue / paid.length) : 0,
      conversionRate: percent(paid.length, orders.length),
      upsellOffers,
      upsellAccepts,
      upsellRevenue,
      upsellAcceptanceRate: percent(upsellAccepts, upsellOffers),
      pipelineValue,
      byChannel,
      byStatus,
      topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
  }

  async generateReport(tenant: Tenant, options: Omit<ReportOptions, 'tenantId'> = {}): Promise<Report> {
    const days = options.days ?? 7;
    const now = options.now ?? new Date();
    const periodStart = new Date(now.getTime() - days * 86_400_000).toISOString();
    const periodEnd = now.toISOString();
    const metrics = await this.metrics(tenant.id, { days, now });

    const narrative = await this.narrate(tenant, metrics, days);
    const report: Report = {
      id: newId('rep'),
      tenantId: tenant.id,
      kind: options.kind ?? 'revenue',
      title: `${days}-day revenue report — ${tenant.name}`,
      periodStart,
      periodEnd,
      metrics: flattenMetrics(metrics),
      narrative,
      createdAt: nowIso(),
    };
    await this.store.reports.put(report);
    log.info(`generated ${report.kind} report for ${tenant.name}`, { reportId: report.id });
    return report;
  }

  private async narrate(tenant: Tenant, metrics: RevenueMetrics, days: number): Promise<string> {
    const currency = tenant.currency || 'USD';
    const facts =
      `Period: last ${days} days. Orders: ${metrics.orders} (paid ${metrics.paidOrders}). ` +
      `Gross revenue: ${formatMoney(metrics.grossRevenue, currency)}. ` +
      `Average order value: ${formatMoney(metrics.averageOrderValue, currency)}. ` +
      `Conversion rate: ${(metrics.conversionRate * 100).toFixed(1)}%. ` +
      `Pipeline (probability-weighted): ${formatMoney(metrics.pipelineValue, currency)}. ` +
      `Upsell offers ${metrics.upsellOffers}, accepted ${metrics.upsellAccepts} ` +
      `(${(metrics.upsellAcceptanceRate * 100).toFixed(1)}%), upsell revenue ${formatMoney(metrics.upsellRevenue, currency)}. ` +
      `Top products: ${metrics.topProducts.map((p) => `${p.name} (${p.quantity})`).join(', ') || 'none'}. ` +
      `Channels: ${Object.entries(metrics.byChannel).map(([c, v]) => `${c} ${formatMoney(v, currency)}`).join(', ') || 'none'}.`;

    if (this.provider) {
      try {
        const result = await this.provider.complete({
          system:
            'You are Duty, a revenue analyst for a small business. Write a short, direct briefing a busy owner reads in 30 seconds. ' +
            'Lead with what happened, then the single most valuable action to take next. No fluff, no markdown headers, max 160 words.',
          messages: [{ role: 'user', content: `${facts}\n\nBusiness context: ${tenant.about ?? 'n/a'}` }],
          temperature: 0.3,
          maxTokens: 350,
        });
        if (result.text.trim()) return result.text.trim();
      } catch (error) {
        log.warn('LLM narration failed, using template', String(error));
      }
    }

    const action = suggestAction(metrics);
    return `${facts}\n\nNext best action: ${action}`;
  }

  async listReports(tenantId: string, limit = 20): Promise<Report[]> {
    return this.store.reports.list({ where: { tenantId }, limit, orderBy: 'createdAt', order: 'desc' });
  }
}

export function suggestAction(metrics: RevenueMetrics): string {
  if (metrics.orders === 0) return 'Publish your catalogue and connect a channel so Duty can start capturing demand.';
  if (metrics.upsellOffers > 0 && metrics.upsellAcceptanceRate < 0.2)
    return 'Upsell acceptance is low — test a smaller discount or a cheaper cross-sell on the top product.';
  if (metrics.upsellOffers === 0)
    return 'No upsells offered yet — attach an upsell rule to your best-selling product.';
  if (metrics.conversionRate < 0.3)
    return 'Conversion is soft — follow up on the highest-probability draft orders before they go cold.';
  if (metrics.pipelineValue > metrics.grossRevenue)
    return 'More value sits in the pipeline than in closed revenue — chase the top three draft orders today.';
  return 'Momentum is good — raise average order value by bundling your top two products.';
}

export function flattenMetrics(metrics: RevenueMetrics): Record<string, number> {
  return {
    orders: metrics.orders,
    paidOrders: metrics.paidOrders,
    grossRevenue: metrics.grossRevenue,
    discounts: metrics.discounts,
    netRevenue: metrics.netRevenue,
    averageOrderValue: metrics.averageOrderValue,
    conversionRate: metrics.conversionRate,
    upsellOffers: metrics.upsellOffers,
    upsellAccepts: metrics.upsellAccepts,
    upsellRevenue: metrics.upsellRevenue,
    upsellAcceptanceRate: metrics.upsellAcceptanceRate,
    pipelineValue: metrics.pipelineValue,
  };
}

export function renderReportMarkdown(report: Report, currency = 'USD'): string {
  const lines = [
    `# ${report.title}`,
    '',
    `_${report.periodStart} → ${report.periodEnd}_`,
    '',
    report.narrative,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
  ];
  const moneyKeys = new Set(['grossRevenue', 'netRevenue', 'averageOrderValue', 'pipelineValue', 'upsellRevenue', 'discounts']);
  for (const [key, value] of Object.entries(report.metrics)) {
    const formatted = moneyKeys.has(key)
      ? formatMoney(value, currency)
      : Number.isInteger(value)
        ? String(value)
        : (value * 100).toFixed(1) + '%';
    lines.push(`| ${key} | ${formatted} |`);
  }
  return lines.join('\n');
}
