import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, pickProduct, draft } from '../src/ai/local-brain.js';
import type { Product, Tenant } from '../src/core/types.js';

const tenant: Tenant = {
  id: 't1',
  name: 'Atlas Coffee',
  tone: 'warm',
  currency: 'USD',
  locale: 'en',
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const products: Product[] = [
  {
    id: 'p1',
    tenantId: 't1',
    sku: 'BEANS-ETH',
    name: 'Ethiopia Yirgacheffe 250g',
    price: 1800,
    currency: 'USD',
    tags: ['single-origin'],
    aliases: ['ethiopian'],
    upsells: [],
    active: true,
    metadata: {},
    createdAt: '',
    updatedAt: '',
  },
];

test('classifies English intents', () => {
  assert.equal(classify('Hi there!').intent, 'greeting');
  assert.equal(classify('How much is the grinder?').intent, 'price_inquiry');
  assert.equal(classify('I want to buy two bags please').intent, 'order_intent');
  assert.equal(classify('confirm').intent, 'confirm_order');
  assert.equal(classify('yes go ahead').intent, 'upsell_accept');
  assert.equal(classify('no thanks').intent, 'upsell_decline');
  assert.equal(classify('where is my order?').intent, 'order_status');
  assert.equal(classify('I want a refund').intent, 'refund');
  assert.equal(classify('this is terrible and late').intent, 'complaint');
  assert.equal(classify('let me talk to a human').intent, 'human_request');
});

test('classifies Arabic intents (word boundaries do not apply to Arabic script)', () => {
  assert.equal(classify('مرحبا').intent, 'greeting');
  assert.equal(classify('كم سعر الطاحونة؟').intent, 'price_inquiry');
  assert.equal(classify('أريد أن أشتري القهوة').intent, 'order_intent');
  assert.equal(classify('نعم أضف ذلك').intent, 'upsell_accept');
  assert.equal(classify('أريد التحدث مع موظف').intent, 'human_request');
  assert.equal(classify('أين طلبي؟').intent, 'order_status');
});

test('sentiment moves with the message', () => {
  assert.ok(classify('this is awful and broken').sentiment < 0.5);
  assert.ok(classify('thank you, excellent service!').sentiment > 0.5);
});

test('confidence is bounded and non-zero', () => {
  for (const text of ['hi', 'asdfgh', 'I want to buy', 'refund now']) {
    const signal = classify(text);
    assert.ok(signal.confidence > 0 && signal.confidence <= 1);
  }
});

test('pickProduct matches by name, sku, tag and alias', () => {
  assert.equal(pickProduct('I want the Ethiopia Yirgacheffe 250g', products)?.sku, 'BEANS-ETH');
  assert.equal(pickProduct('BEANS-ETH please', products)?.sku, 'BEANS-ETH');
  assert.equal(pickProduct('do you have ethiopian beans?', products)?.sku, 'BEANS-ETH');
  assert.equal(pickProduct('something unrelated', products), null);
});

test('pickProduct matches a product through a non-English alias', () => {
  const grinder = {
    ...products[0]!,
    id: 'p2',
    sku: 'GEAR-GRINDER',
    name: 'Hand Grinder Pro',
    tags: [],
    aliases: ['grinder', 'طاحونة'],
  };
  assert.equal(pickProduct('كم سعر الطاحونة؟', [grinder])?.sku, 'GEAR-GRINDER');
  assert.equal(pickProduct('how much is the grinder?', [grinder])?.sku, 'GEAR-GRINDER');
});

test('draft always returns an actionable reply', () => {
  const result = draft({
    tenant,
    intent: classify('I want to buy the beans'),
    text: 'I want to buy the beans',
    products,
    openOrder: null,
    lastOrder: null,
    knowledge: [],
    currency: 'USD',
  });
  assert.ok(result.reply.length > 10);
  assert.ok(result.confidence > 0);
});

test('draft escalates refunds to a human', () => {
  const result = draft({
    tenant,
    intent: classify('I want a refund'),
    text: 'I want a refund',
    products,
    openOrder: null,
    lastOrder: null,
    knowledge: [],
    currency: 'USD',
  });
  assert.equal(result.needsHuman, true);
});
