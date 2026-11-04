import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/memory.js';
import { CatalogService } from '../src/commerce/catalog.js';
import { OrderService, estimatePurchaseProbability } from '../src/commerce/orders.js';
import { UpsellEngine } from '../src/commerce/upsell.js';
import { AnalyticsService } from '../src/commerce/analytics.js';
import type { Tenant } from '../src/core/types.js';

async function setup() {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);

  const beans = await catalog.create({ tenantId: 't1', name: 'Beans', price: 1800, tags: ['coffee'] });
  const filters = await catalog.create({ tenantId: 't1', name: 'Filters', price: 900 });
  const subscription = await catalog.create({ tenantId: 't1', name: 'Subscription', price: 3200 });

  await catalog.update('t1', beans.id, {
    upsells: [
      { strategy: 'cross_sell', targetSku: filters.sku, priority: 2, active: true },
      { strategy: 'upgrade', targetSku: subscription.sku, discountPercent: 10, priority: 1, active: true },
    ],
  });

  return { store, catalog, orders, upsell, beans, filters, subscription };
}

test('catalogue generates a sku and rejects bad prices', async () => {
  const { catalog } = await setup();
  const product = await catalog.create({ tenantId: 't1', name: 'Cold Brew Kit', price: 4500 });
  assert.ok(product.sku.length > 0);
  await assert.rejects(() => catalog.create({ tenantId: 't1', name: 'Bad', price: -1 }));
});

test('orders compute totals from the catalogue, not the caller', async () => {
  const { orders, beans } = await setup();
  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'whatsapp',
    items: [{ sku: beans.sku, quantity: 2 }],
  });
  assert.equal(order.subtotal, 3600);
  assert.equal(order.total, 3600);
  assert.match(order.number, /^DTY-\d{8}-[A-Z0-9]{4}$/);
});

test('adding, removing and discounting recalculates the total', async () => {
  const { orders, beans, filters } = await setup();
  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'whatsapp',
    items: [{ sku: beans.sku }],
  });
  const withFilters = await orders.addItem('t1', order.id, { sku: filters.sku });
  assert.equal(withFilters.total, 2700);

  const discounted = await orders.applyDiscount('t1', order.id, 700);
  assert.equal(discounted.total, 2000);

  const reduced = await orders.removeItem('t1', order.id, filters.sku);
  assert.equal(reduced.total, 1100);
});

test('unknown products are rejected rather than silently dropped', async () => {
  const { orders } = await setup();
  await assert.rejects(
    () =>
      orders.create({
        tenantId: 't1',
        customerId: 'c1',
        channel: 'webchat',
        items: [{ sku: 'DOES-NOT-EXIST' }],
      }),
    /Unknown product/,
  );
});

test('upsell engine ranks the highest expected revenue first', async () => {
  const { orders, upsell, catalog, beans, subscription } = await setup();
  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'whatsapp',
    items: [{ sku: beans.sku }],
  });
  const opportunities = await upsell.findOpportunities({
    tenantId: 't1',
    order,
    cartProducts: [await catalog.findBySku('t1', beans.sku) as never],
    customerLtv: 5000,
  });
  assert.equal(opportunities.length, 2);
  // The subscription is worth more than the filters, so it should lead.
  assert.equal(opportunities[0]!.product.sku, subscription.sku);
  assert.ok(opportunities[0]!.expectedRevenue > 0);
  for (const opportunity of opportunities) {
    assert.ok(opportunity.probability > 0 && opportunity.probability <= 1);
  }
});

test('upsell rules are never re-offered for items already in the cart', async () => {
  const { orders, upsell, catalog, beans, filters } = await setup();
  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'whatsapp',
    items: [{ sku: beans.sku }, { sku: filters.sku }],
  });
  const opportunities = await upsell.findOpportunities({
    tenantId: 't1',
    order,
    cartProducts: [await catalog.findBySku('t1', beans.sku) as never],
  });
  assert.ok(!opportunities.some((opportunity) => opportunity.product.sku === filters.sku));
});

test('purchase probability rises with intent strength', async () => {
  const weak = estimatePurchaseProbability({
    intentConfidence: 0.3,
    intent: 'other',
    messageCount: 1,
    customerLtv: 0,
    hasMatchingProduct: false,
    sentiment: 0.5,
  });
  const strong = estimatePurchaseProbability({
    intentConfidence: 0.95,
    intent: 'order_intent',
    messageCount: 6,
    customerLtv: 20000,
    hasMatchingProduct: true,
    sentiment: 0.8,
  });
  assert.ok(strong > weak);
  assert.ok(strong <= 1 && weak >= 0);
});

test('analytics computes revenue, conversion and upsell lift', async () => {
  const { store, orders, beans, subscription } = await setup();
  const first = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'whatsapp',
    items: [{ sku: beans.sku }],
  });
  await orders.setStatus('t1', first.id, 'paid');
  await orders.markUpsell('t1', first.id, subscription.sku, true);

  const second = await orders.create({
    tenantId: 't1',
    customerId: 'c2',
    channel: 'webchat',
    items: [{ sku: subscription.sku }],
  });
  await orders.setProbability('t1', second.id, 0.5);

  const analytics = new AnalyticsService(store);
  const metrics = await analytics.metrics('t1', { days: 30 });

  assert.equal(metrics.orders, 2);
  assert.equal(metrics.paidOrders, 1);
  assert.equal(metrics.grossRevenue, 1800);
  assert.equal(metrics.averageOrderValue, 1800);
  assert.equal(metrics.conversionRate, 0.5);
  assert.equal(metrics.upsellOffers, 1);
  assert.equal(metrics.upsellAccepts, 1);
  assert.equal(metrics.pipelineValue, 1600);
});

test('report generation stores a narrative', async () => {
  const { store } = await setup();
  const tenant: Tenant = {
    id: 't1',
    name: 'Atlas',
    currency: 'USD',
    locale: 'en',
    settings: {},
    createdAt: '',
    updatedAt: '',
  };
  const analytics = new AnalyticsService(store);
  const report = await analytics.generateReport(tenant, { days: 7 });
  assert.ok(report.narrative.length > 20);
  assert.equal((await analytics.listReports('t1')).length, 1);
});
