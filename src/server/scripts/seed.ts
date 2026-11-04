import { createRuntime } from '../runtime.js';
import { newId, nowIso } from '../../core/ids.js';
import { createLogger } from '../../core/logger.js';
import { bus } from '../../core/events.js';
import type { Tenant } from '../../core/types.js';

const log = createLogger('seed');

/**
 * Seed a realistic demo tenant so `npm run seed` gives you a working system
 * immediately: a business profile, a catalogue with upsell rules, knowledge
 * documents, customers, conversations and orders with upsell outcomes.
 */
async function seed(): Promise<void> {
  const runtime = await createRuntime();
  const { store, catalog, orders, ingestion, analytics } = runtime;

  const tenant: Tenant = {
    id: newId('ten'),
    name: 'Atlas Coffee Roasters',
    websiteUrl: 'https://example.com',
    about:
      'Atlas Coffee Roasters is a specialty coffee roaster selling single-origin beans, monthly subscriptions and brewing gear. ' +
      'They ship worldwide, roast to order, and offer a subscription that saves 15%.',
    tone: 'warm, expert, never pushy',
    currency: 'USD',
    locale: 'en',
    settings: {
      goals: ['grow subscription revenue', 'raise average order value', 'recover abandoned carts'],
      timezone: 'UTC',
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await store.tenants.put(tenant);

  const beans = await catalog.create({
    tenantId: tenant.id,
    sku: 'BEANS-ETH',
    name: 'Ethiopia Yirgacheffe 250g',
    description: 'Floral, citrus-forward single origin. Roasted to order and shipped within 24h.',
    price: 1800,
    category: 'Beans',
    tags: ['single-origin', 'filter', 'bestseller'],
    aliases: ['ethiopian', 'ethiopia', 'yirgacheffe', 'قهوة', 'بن', 'حبوب'],
  });
  const subscription = await catalog.create({
    tenantId: tenant.id,
    sku: 'SUB-MONTHLY',
    name: 'Monthly Subscription',
    description: 'Two bags a month, 15% cheaper than one-off, cancel anytime.',
    price: 3200,
    category: 'Subscription',
    tags: ['recurring', 'value'],
    aliases: ['subscription', 'subscribe', 'اشتراك', 'شهري'],
  });
  const grinder = await catalog.create({
    tenantId: tenant.id,
    sku: 'GEAR-GRINDER',
    name: 'Hand Grinder Pro',
    description: 'Stainless conical burrs, 40 clicks, fits in a backpack.',
    price: 6900,
    category: 'Gear',
    tags: ['gear', 'travel'],
    aliases: ['grinder', 'mill', 'طاحونة', 'مطحنة', 'طاحونه'],
  });
  const filterPack = await catalog.create({
    tenantId: tenant.id,
    sku: 'FILTER-100',
    name: 'Paper Filters (100 pack)',
    description: 'Compostable filters sized for the V60.',
    price: 900,
    category: 'Accessories',
    tags: ['consumable'],
    aliases: ['filters', 'paper', 'فلتر', 'فلاتر', 'ورق'],
  });
  await catalog.create({
    tenantId: tenant.id,
    sku: 'BEANS-COL',
    name: 'Colombia Huila 250g',
    description: 'Caramel and red apple. The everyday crowd-pleaser.',
    price: 1650,
    category: 'Beans',
    tags: ['single-origin', 'filter'],
    aliases: ['colombian', 'colombia', 'قهوة', 'بن'],
  });

  // Upsell rules turn the catalogue into a revenue engine.
  await catalog.update(tenant.id, beans.id, {
    upsells: [
      { strategy: 'cross_sell', targetSku: 'FILTER-100', pitch: 'Add filters so you can brew straight away?', priority: 2, active: true },
      { strategy: 'upgrade', targetSku: 'SUB-MONTHLY', discountPercent: 10, pitch: 'Subscribe and save 15% every month?', priority: 1, active: true },
    ],
  });
  await catalog.update(tenant.id, grinder.id, {
    upsells: [
      { strategy: 'cross_sell', targetSku: 'BEANS-ETH', pitch: 'Fresh beans to go with the grinder?', priority: 1, active: true },
      { strategy: 'bundle', targetSku: 'FILTER-100', pitch: 'Filters to complete the kit?', priority: 3, active: true },
    ],
  });
  await catalog.update(tenant.id, subscription.id, {
    upsells: [
      { strategy: 'quantity', targetSku: 'FILTER-100', pitch: 'Filters every month keeps you brewing.', priority: 2, active: true },
    ],
  });

  await ingestion.ingestText({
    tenantId: tenant.id,
    title: 'Shipping & returns policy',
    content:
      'Shipping: orders ship within 24 hours of roasting. Standard delivery is 3-5 business days in the US, 5-10 days international.\n\n' +
      'Returns: unopened bags can be returned within 30 days for a full refund. Opened coffee cannot be returned for hygiene reasons, but we will replace any bag that arrives damaged or stale.\n\n' +
      'Subscription: the Monthly Subscription is billed on the 1st, saves 15%, and can be paused or cancelled at any time from the customer account.',
  });
  await ingestion.ingestText({
    tenantId: tenant.id,
    title: 'Brewing guide (V60)',
    content:
      'V60 recipe: 15g coffee, 250g water at 94°C. Bloom with 50g for 30 seconds, then pour in three stages finishing at 2:45.\n\n' +
      'Grind: medium-fine, about 18 clicks on the Hand Grinder Pro. If the brew drains faster than 2:30, grind finer.',
  });
  await ingestion.seedFaq(tenant.id, [
    { question: 'Do you ship internationally?', answer: 'Yes, worldwide. International delivery takes 5-10 business days.' },
    { question: 'Can I cancel my subscription?', answer: 'Yes, pause or cancel any time from your account — no fees.' },
    { question: 'Is the coffee ground?', answer: 'Beans ship whole by default. Add a note at checkout and we will grind them free of charge.' },
  ]);

  // ------------------------------------------------------------- demo traffic
  const conversations = [
    {
      name: 'Maya Hassan',
      externalId: '+15550001111',
      channel: 'whatsapp' as const,
      turns: [
        'Hi, do you have Ethiopian beans in stock?',
        'Great — I want to order one bag',
      ],
    },
    {
      name: 'Tom Becker',
      externalId: '+15550002222',
      channel: 'whatsapp' as const,
      turns: ['How much is the Hand Grinder Pro?', 'I want to buy the grinder'],
    },
    {
      name: 'Lina Ortiz',
      externalId: 'web-3f91',
      channel: 'webchat' as const,
      turns: ['where is my order DTY-20260101-AB12', 'this is unacceptable, it is late'],
    },
    {
      name: 'Sam Whitfield',
      externalId: '+15550003333',
      channel: 'whatsapp' as const,
      turns: ['I would like the monthly subscription', 'yes'],
    },
  ];

  const createdOrders = [];
  for (const conversation of conversations) {
    for (const text of conversation.turns) {
      await runtime.agent.handleInbound({
        tenantId: tenant.id,
        channel: conversation.channel,
        externalId: conversation.externalId,
        text,
        name: conversation.name,
      });
    }
    const customers = await store.customers.list({
      where: { tenantId: tenant.id, externalId: conversation.externalId },
      limit: 1,
    });
    if (customers[0]) {
      const customerOrders = await orders.listForCustomer(tenant.id, customers[0].id);
      createdOrders.push(...customerOrders);
    }
  }

  // Close the loop: mark some orders paid so analytics has real numbers.
  for (const order of createdOrders.slice(0, 2)) {
    const paid = await orders.setStatus(tenant.id, order.id, 'paid');
    bus.emit('order.paid', { tenantId: tenant.id, orderId: paid.id, total: paid.total });
    await store.customers.patch(paid.customerId, {
      ltv: paid.total,
      tags: ['buyer'],
      updatedAt: nowIso(),
    });
  }

  await analytics.generateReport(tenant, { days: 7, kind: 'revenue' });

  log.info('seed complete', {
    tenant: tenant.name,
    products: 5,
    knowledgeDocuments: 3,
    orders: createdOrders.length,
  });
  log.info('dashboard: http://localhost:8787/?token=<ADMIN_TOKEN>');
  await runtime.close();
}

seed().catch((error) => {
  log.error('seed failed', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
