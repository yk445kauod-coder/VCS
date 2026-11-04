import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/memory.js';
import { CatalogService } from '../src/commerce/catalog.js';
import { OrderService } from '../src/commerce/orders.js';
import { UpsellEngine } from '../src/commerce/upsell.js';
import { IngestionService } from '../src/integrations/ingest.js';
import { hashEmbedder } from '../src/ai/embeddings.js';
import { loadConfig } from '../src/core/config.js';
import { DutyAgent } from '../src/ai/agent.js';
import { parseWhatsAppWebhook, toInbound } from '../src/channels/whatsapp.js';
import type { Tenant } from '../src/core/types.js';

async function harness() {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);
  const ingestion = new IngestionService({ store, embedder: hashEmbedder, provider: null, config: loadConfig({}) });

  const tenant: Tenant = {
    id: 't1',
    name: 'Atlas Coffee',
    about: 'Specialty coffee roaster.',
    tone: 'warm',
    currency: 'USD',
    locale: 'en',
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.tenants.put(tenant);

  const beans = await catalog.create({ tenantId: 't1', name: 'Ethiopia Yirgacheffe 250g', price: 1800 });
  const subscription = await catalog.create({ tenantId: 't1', name: 'Monthly Subscription', price: 3200 });
  await catalog.update('t1', beans.id, {
    upsells: [{ strategy: 'upgrade', targetSku: subscription.sku, priority: 1, active: true }],
  });

  await ingestion.ingestText({
    tenantId: 't1',
    title: 'Shipping',
    content: 'Standard delivery takes 3-5 business days. International delivery takes 5-10 business days.',
  });

  const agent = new DutyAgent({
    store,
    catalog,
    orders,
    upsell,
    provider: null,
    embedder: hashEmbedder,
    config: loadConfig({}),
  });

  return { store, agent, catalog, orders };
}

const inbound = (text: string, externalId = '+15550001111') => ({
  tenantId: 't1',
  channel: 'whatsapp' as const,
  externalId,
  text,
  name: 'Tester',
});

test('a full purchase flow runs from greeting to confirmed order', async () => {
  const { agent, orders } = await harness();

  const greeting = await agent.handleInbound(inbound('Hi there'));
  assert.equal(greeting.intent, 'greeting');
  assert.ok(greeting.reply.length > 0);

  const purchase = await agent.handleInbound(inbound('I want to order the Ethiopia Yirgacheffe 250g'));
  assert.equal(purchase.intent, 'order_intent');
  assert.equal(purchase.orderIds.length, 1);

  const order = await orders.get('t1', purchase.orderIds[0]!);
  assert.equal(order?.status, 'draft');
  assert.equal(order?.total, 1800);

  const confirm = await agent.handleInbound(inbound('confirm'));
  assert.equal(confirm.intent, 'confirm_order');
  assert.equal((await orders.get('t1', purchase.orderIds[0]!))?.status, 'pending');
});

test('the upsell is offered and accepting it grows the order', async () => {
  const { agent, orders } = await harness();

  const purchase = await agent.handleInbound(inbound('I want to buy the Ethiopia Yirgacheffe'));
  const orderId = purchase.orderIds[0]!;
  assert.ok(purchase.actions.some((action) => action.kind === 'offer_upsell'), 'an upsell should be offered');

  const accepted = await agent.handleInbound(inbound('yes add it'));
  assert.equal(accepted.intent, 'upsell_accept');
  const order = await orders.get('t1', orderId);
  assert.equal(order?.lines.length, 2, 'the upsell item should be on the order');
  assert.equal(order?.upsellAccepted, true);
  assert.ok((order?.total ?? 0) > 1800);
});

test('declining an upsell leaves the order untouched', async () => {
  const { agent, orders } = await harness();
  const purchase = await agent.handleInbound(inbound('I want to buy the Ethiopia Yirgacheffe'));
  const before = await orders.get('t1', purchase.orderIds[0]!);
  await agent.handleInbound(inbound('no thanks'));
  const after = await orders.get('t1', purchase.orderIds[0]!);
  assert.equal(after?.lines.length, before?.lines.length);
});

test('refunds are escalated to a human instead of being handled', async () => {
  const { agent } = await harness();
  const turn = await agent.handleInbound(inbound('I want a refund for my last order'));
  assert.equal(turn.escalated, true);
  assert.ok(turn.actions.some((action) => action.kind === 'escalate'));
});

test('knowledge answers questions about policies', async () => {
  const { agent } = await harness();
  const turn = await agent.handleInbound(inbound('How long does international delivery take?'));
  assert.match(turn.reply.toLowerCase(), /5-10|delivery|business days/);
});

test('the same customer keeps one conversation', async () => {
  const { agent } = await harness();
  const first = await agent.handleInbound(inbound('Hi'));
  const second = await agent.handleInbound(inbound('Do you ship internationally?'));
  assert.equal(first.conversationId, second.conversationId);
  assert.equal(first.customerId, second.customerId);
});

test('different customers get separate conversations', async () => {
  const { agent } = await harness();
  const first = await agent.handleInbound(inbound('Hi', '+15550000001'));
  const second = await agent.handleInbound(inbound('Hi', '+15550000002'));
  assert.notEqual(first.conversationId, second.conversationId);
});

test('Arabic messages are understood end to end', async () => {
  const { agent } = await harness();
  const turn = await agent.handleInbound(inbound('أريد أن أشتري Ethiopia Yirgacheffe 250g'));
  assert.equal(turn.intent, 'order_intent');
  assert.equal(turn.orderIds.length, 1);
});

test('an order intent with no matching product asks rather than inventing one', async () => {
  const { agent } = await harness();
  const turn = await agent.handleInbound(inbound('أريد أن أشتري القهوة'));
  assert.equal(turn.intent, 'order_intent');
  assert.equal(turn.orderIds.length, 0);
  assert.ok(turn.reply.length > 0);
});

test('transcripts are persisted for the dashboard', async () => {
  const { agent, store } = await harness();
  const turn = await agent.handleInbound(inbound('Hello, what do you sell?'));
  const messages = await store.messages.list({ where: { conversationId: turn.conversationId }, orderBy: 'createdAt', order: 'asc' });
  assert.ok(messages.length >= 2);
  assert.equal(messages[0]!.role, 'customer');
  assert.equal(messages[messages.length - 1]!.role, 'agent');
});

test('parses a WhatsApp Cloud API webhook payload', () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '123' },
              contacts: [{ profile: { name: 'Sara' }, wa_id: '966500000000' }],
              messages: [
                { from: '966500000000', id: 'wamid.1', type: 'text', text: { body: 'كم السعر؟' } },
                { from: '966500000000', id: 'wamid.2', type: 'image', image: { id: 'x' } },
              ],
            },
          },
        ],
      },
    ],
  };
  const parsed = parseWhatsAppWebhook(payload);
  // Non-text media (the image) is intentionally skipped so the agent only ever
  // reasons over text it can actually answer.
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.text, 'كم السعر؟');
  assert.equal(parsed[0]!.name, 'Sara');

  const inbound = toInbound('t1', parsed[0]!);
  assert.equal(inbound.tenantId, 't1');
  assert.equal(inbound.channel, 'whatsapp');
  assert.equal(inbound.externalId, '966500000000');
});

test('malformed WhatsApp payloads do not throw', () => {
  assert.deepEqual(parseWhatsAppWebhook(null), []);
  assert.deepEqual(parseWhatsAppWebhook({}), []);
  assert.deepEqual(parseWhatsAppWebhook({ entry: [{}] }), []);
});

// Regression: the LLM path used to let provider errors propagate. A 429 from a
// rate limit or a 503 from an overloaded model became a failed webhook and a
// customer message with no reply at all — an LLM outage stopped the shop selling.
// Order capture, pricing and escalation are deterministic, so the turn must
// degrade to the local brain instead of failing.
test('a failing LLM provider degrades to the deterministic brain instead of failing the request', async () => {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);
  const ingestion = new IngestionService({ store, embedder: hashEmbedder, provider: null, config: loadConfig({}) });

  const tenant: Tenant = {
    id: 't1',
    name: 'Atlas Coffee',
    about: 'Specialty coffee roaster.',
    tone: 'warm',
    currency: 'USD',
    locale: 'en',
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.tenants.put(tenant);
  await catalog.create({ tenantId: 't1', name: 'Ethiopia Yirgacheffe 250g', price: 1800 });
  await ingestion.ingestText({ tenantId: 't1', title: 'Shipping', content: 'Delivery takes 3-5 days.' });

  let attempts = 0;
  const alwaysFails = {
    name: 'failing-provider',
    async complete() {
      attempts += 1;
      throw new Error('429 Too Many Requests: quota exceeded');
    },
    async embed() {
      return [];
    },
  };

  const agent = new DutyAgent({
    store,
    catalog,
    orders,
    upsell,
    provider: alwaysFails as never,
    embedder: hashEmbedder,
    config: loadConfig({}),
  });

  const turn = await agent.handleInbound(inbound('I want to order two bags of Ethiopian beans'));

  assert.ok(attempts > 0, 'the provider should have been called');
  assert.ok(turn.reply.length > 0, 'a failing provider must still produce a reply for the customer');
  assert.equal(turn.orderIds.length, 1, 'the deterministic brain must still capture the order');
  const order = await orders.get('t1', turn.orderIds[0]!);
  assert.ok(order, 'the captured order must be readable');
  assert.equal(order!.lines.length, 1);
});

test('a provider that fails mid-turn does not create a duplicate order', async () => {
  const store = new MemoryStore();
  await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const upsell = new UpsellEngine(catalog);
  const ingestion = new IngestionService({ store, embedder: hashEmbedder, provider: null, config: loadConfig({}) });

  const tenant: Tenant = {
    id: 't1',
    name: 'Atlas Coffee',
    about: 'Specialty coffee roaster.',
    tone: 'warm',
    currency: 'USD',
    locale: 'en',
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.tenants.put(tenant);
  await catalog.create({ tenantId: 't1', name: 'Ethiopia Yirgacheffe 250g', price: 1800 });
  await ingestion.ingestText({ tenantId: 't1', title: 'Shipping', content: 'Delivery takes 3-5 days.' });

  // First call creates an order through a tool, second call blows up. The fallback
  // must add to that order rather than open a second one for the same request.
  let call = 0;
  const failsAfterTool = {
    name: 'fails-after-tool',
    async complete() {
      call += 1;
      if (call === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'create_order',
              arguments: { sku: 'ETH-YIR-250' },
            },
          ],
        };
      }
      throw new Error('503 Service Unavailable: model overloaded');
    },
    async embed() {
      return [];
    },
  };

  const agent = new DutyAgent({
    store,
    catalog,
    orders,
    upsell,
    provider: failsAfterTool as never,
    embedder: hashEmbedder,
    config: loadConfig({}),
  });

  const turn = await agent.handleInbound(inbound('I want to order two bags of Ethiopian beans'));

  assert.ok(turn.reply.length > 0, 'the customer must still get a reply');
  assert.equal(turn.orderIds.length, 1, 'exactly one order id must be reported');

  const drafts = await store.orders.list({ where: { tenantId: 't1', customerId: turn.customerId } });
  assert.equal(drafts.length, 1, `expected 1 order, found ${drafts.length} — the fallback duplicated it`);
});
