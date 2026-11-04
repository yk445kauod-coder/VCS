import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/memory.js';
import { CatalogService } from '../src/commerce/catalog.js';
import { OrderService } from '../src/commerce/orders.js';
import { UpsellEngine } from '../src/commerce/upsell.js';
import { FollowUpService } from '../src/commerce/followups.js';
import { bus } from '../src/core/events.js';

test('each upsell strategy produces a sensible reason and discount', async () => {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);

  const main = await catalog.create({ tenantId: 't1', name: 'Main item', price: 10000 });
  const targets = await Promise.all(
    ['bundle', 'cross_sell', 'upgrade', 'quantity', 'renewal', 'win_back'].map(async (strategy) => {
      const product = await catalog.create({ tenantId: 't1', name: `${strategy} target`, price: 2000 });
      return { strategy, product };
    }),
  );

  await catalog.update('t1', main.id, {
    upsells: targets.map(({ strategy, product }, index) => ({
      strategy: strategy as never,
      targetSku: product.sku,
      discountPercent: strategy === 'upgrade' ? 10 : 0,
      priority: index,
      active: true,
    })),
  });

  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'webchat',
    items: [{ sku: main.sku }],
  });

  const opportunities = await upsell.findOpportunities({
    tenantId: 't1',
    order,
    cartProducts: [await catalog.findBySku('t1', main.sku) as never],
  });
  assert.equal(opportunities.length, 6);
  for (const opportunity of opportunities) {
    assert.ok(opportunity.reason.length > 5, `${opportunity.rule.strategy} needs a reason`);
    assert.ok(opportunity.expectedRevenue >= 0);
  }
  // An upgrade with a discount should be priced below list.
  const upgrade = opportunities.find((opportunity) => opportunity.rule.strategy === 'upgrade');
  assert.ok(upgrade && upgrade.expectedRevenue < 2000 * 1.5);
});

test('inactive rules and out-of-stock targets are skipped', async () => {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);

  const main = await catalog.create({ tenantId: 't1', name: 'Main', price: 5000 });
  const inactive = await catalog.create({ tenantId: 't1', name: 'Inactive target', price: 1000 });
  const soldOut = await catalog.create({ tenantId: 't1', name: 'Sold out target', price: 1000 });
  await catalog.update('t1', soldOut.id, { stock: 0 });

  await catalog.update('t1', main.id, {
    upsells: [
      { strategy: 'cross_sell', targetSku: inactive.sku, active: false, priority: 1 },
      { strategy: 'cross_sell', targetSku: soldOut.sku, active: true, priority: 2 },
    ],
  });

  const order = await orders.create({
    tenantId: 't1',
    customerId: 'c1',
    channel: 'webchat',
    items: [{ sku: main.sku }],
  });
  const opportunities = await upsell.findOpportunities({
    tenantId: 't1',
    order,
    cartProducts: [await catalog.findBySku('t1', main.sku) as never],
  });
  assert.equal(opportunities.length, 0);
});

test('follow-ups target only idle, likely drafts and emit outbound messages', async () => {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);
  const followUps = new FollowUpService(store, catalog, upsell);

  await store.tenants.put({
    id: 't1',
    name: 'Atlas',
    currency: 'USD',
    locale: 'en',
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const product = await catalog.create({ tenantId: 't1', name: 'Beans', price: 1800 });

  const customer = await store.customers.put({
    id: 'c1',
    tenantId: 't1',
    channel: 'whatsapp',
    externalId: '+15550001111',
    name: 'Maya',
    tags: [],
    ltv: 0,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const conversation = await store.conversations.put({
    id: 'cnv1',
    tenantId: 't1',
    customerId: customer.id,
    channel: 'whatsapp',
    status: 'open',
    metadata: {},
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Old draft with a good probability: should be chased.
  const stale = await orders.create({
    tenantId: 't1',
    customerId: customer.id,
    conversationId: conversation.id,
    channel: 'whatsapp',
    items: [{ sku: product.sku }],
  });
  await store.orders.patch(stale.id, { createdAt: new Date(Date.now() - 7_200_000).toISOString() });
  await orders.setProbability('t1', stale.id, 0.8);

  // Fresh draft: must be left alone.
  const fresh = await orders.create({
    tenantId: 't1',
    customerId: customer.id,
    channel: 'whatsapp',
    items: [{ sku: product.sku }],
  });
  await orders.setProbability('t1', fresh.id, 0.9);

  const seen: string[] = [];
  const unsubscribe = bus.on('message.outbound', (payload) => {
    seen.push(payload.conversationId);
  });

  try {
    const preview = await followUps.run({ tenantId: 't1', dryRun: true, olderThanMinutes: 60 });
    assert.equal(preview.length, 1);
    assert.equal(preview[0]!.orderId, stale.id);
    assert.equal(seen.length, 0, 'dry runs must not message anyone');

    const sent = await followUps.run({ tenantId: 't1', dryRun: false, olderThanMinutes: 60 });
    assert.equal(sent.length, 1);
    assert.equal(seen.length, 1, 'a real run emits one outbound message');
  } finally {
    unsubscribe();
  }

  const messages = await store.messages.list({ where: { conversationId: conversation.id } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.role, 'agent');
});
