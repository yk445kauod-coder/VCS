import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../../core/errors.js';
import { newId, nowIso, slugify } from '../../core/ids.js';
import { formatMoney } from '../../core/money.js';
import type { Runtime } from '../runtime.js';
import { renderReportMarkdown } from '../../commerce/analytics.js';
import { FollowUpService } from '../../commerce/followups.js';
import type { Product, Tenant } from '../../core/types.js';

const tenantSchema = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  about: z.string().optional(),
  tone: z.string().optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  price: z.number().nonnegative().describe('Price in minor units (cents)'),
  currency: z.string().length(3).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  stock: z.number().int().optional(),
  active: z.boolean().optional(),
  upsells: z
    .array(
      z.object({
        strategy: z.enum(['bundle', 'cross_sell', 'upgrade', 'quantity', 'renewal', 'win_back']),
        targetSku: z.string(),
        discountPercent: z.number().min(0).max(100).optional(),
        pitch: z.string().optional(),
        minSubtotal: z.number().optional(),
        priority: z.number().int().default(5),
        active: z.boolean().default(true),
      }),
    )
    .optional(),
});

export function registerAdminRoutes(app: FastifyInstance, runtime: Runtime): void {
  const { store, catalog, orders, analytics, ingestion, agent, upsell, channels, config } = runtime;
  const followUps = new FollowUpService(store, catalog, upsell);

  const requireTenant = async (tenantId: string): Promise<Tenant> => {
    const tenant = await store.tenants.get(tenantId);
    if (!tenant) throw notFound('Tenant');
    return tenant;
  };

  const resolveTenantId = async (tenantId?: string): Promise<string> => {
    if (tenantId) return (await requireTenant(tenantId)).id;
    const tenant = await agent.defaultTenant();
    if (!tenant) throw badRequest('No tenant yet — create one first');
    return tenant.id;
  };

  // ------------------------------------------------------------------ tenants
  app.get('/api/tenants', async () => ({ items: await store.tenants.list({ limit: 50 }) }));

  app.post('/api/tenants', async (request, reply) => {
    const body = tenantSchema.parse(request.body ?? {});
    const now = nowIso();
    const tenant: Tenant = {
      id: newId('ten'),
      name: body.name,
      domain: body.domain,
      websiteUrl: body.websiteUrl,
      about: body.about,
      tone: body.tone ?? 'friendly, concise, helpful',
      currency: body.currency ?? config.currency,
      locale: body.locale ?? 'en',
      settings: body.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await store.tenants.put(tenant);
    return reply.code(201).send(tenant);
  });

  app.get('/api/tenants/:id', async (request) => {
    const { id } = request.params as { id: string };
    return requireTenant(id);
  });

  app.patch('/api/tenants/:id', async (request) => {
    const { id } = request.params as { id: string };
    const tenant = await requireTenant(id);
    const body = tenantSchema.partial().parse(request.body ?? {});
    const updated: Tenant = {
      ...tenant,
      ...body,
      settings: { ...tenant.settings, ...(body.settings ?? {}) },
      updatedAt: nowIso(),
    };
    await store.tenants.put(updated);
    return updated;
  });

  // ----------------------------------------------------------------- overview
  app.get('/api/overview', async (request) => {
    const query = request.query as { tenantId?: string; days?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const days = Number(query.days) || 30;
    const metrics = await analytics.metrics(tenantId, { days });
    const [conversations, customers, products, allOrders] = await Promise.all([
      store.conversations.list({ where: { tenantId }, limit: 500 }),
      store.customers.list({ where: { tenantId }, limit: 1000 }),
      catalog.list(tenantId, { limit: 500 }),
      store.orders.list({ where: { tenantId }, limit: 1000 }),
    ]);

    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const series = buildSeries(
      allOrders.filter((order) => order.createdAt >= since),
      14,
    );

    return {
      tenantId,
      currency: (await requireTenant(tenantId)).currency,
      metrics,
      counts: {
        conversations: conversations.length,
        openConversations: conversations.filter((c) => c.status === 'open').length,
        escalated: conversations.filter((c) => c.status === 'escalated').length,
        customers: customers.length,
        products: products.length,
        knowledgeDocuments: (await store.knowledge.list({ where: { tenantId }, limit: 500 })).length,
        reports: (await store.reports.list({ where: { tenantId }, limit: 500 })).length,
      },
      series,
      recentOrders: allOrders.slice(0, 8),
      escalatedConversations: conversations.filter((c) => c.status === 'escalated').slice(0, 5),
      channels: channels.status(),
    };
  });

  // ----------------------------------------------------------------- customers
  app.get('/api/customers', async (request) => {
    const query = request.query as { tenantId?: string; search?: string; limit?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const items = await store.customers.list({
      where: { tenantId },
      search: query.search ? { fields: ['name', 'email', 'phone', 'externalId'], term: query.search } : undefined,
      limit: Number(query.limit) || 100,
      orderBy: 'createdAt',
      order: 'desc',
    });
    return { items };
  });

  app.get('/api/customers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const customer = await store.customers.get(id);
    if (!customer) throw notFound('Customer');
    const [conversations, customerOrders] = await Promise.all([
      store.conversations.list({ where: { customerId: id }, limit: 50, orderBy: 'createdAt', order: 'desc' }),
      orders.listForCustomer(customer.tenantId, id),
    ]);
    return { customer, conversations, orders: customerOrders };
  });

  // ------------------------------------------------------------- conversations
  app.get('/api/conversations', async (request) => {
    const query = request.query as { tenantId?: string; status?: string; search?: string; limit?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const items = await store.conversations.list({
      where: { tenantId, ...(query.status ? { status: query.status } : {}) },
      search: query.search ? { fields: ['subject', 'summary', 'intent'], term: query.search } : undefined,
      limit: Number(query.limit) || 100,
      orderBy: 'updatedAt',
      order: 'desc',
    });
    const enriched = await Promise.all(
      items.map(async (conversation) => {
        const customer = await store.customers.get(conversation.customerId);
        return {
          ...conversation,
          customerName: customer?.name ?? customer?.externalId ?? 'unknown',
          channel: conversation.channel,
        };
      }),
    );
    return { items: enriched };
  });

  app.get('/api/conversations/:id', async (request) => {
    const { id } = request.params as { id: string };
    const conversation = await store.conversations.get(id);
    if (!conversation) throw notFound('Conversation');
    const [messages, customer, conversationOrders] = await Promise.all([
      store.messages.list({ where: { conversationId: id }, limit: 300, orderBy: 'createdAt', order: 'asc' }),
      store.customers.get(conversation.customerId),
      store.orders.list({ where: { conversationId: id }, limit: 50 }),
    ]);
    return { conversation, messages, customer, orders: conversationOrders };
  });

  app.post('/api/conversations/:id/reply', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ text: z.string().min(1), agent: z.string().optional() }).parse(request.body ?? {});
    const conversation = await store.conversations.get(id);
    if (!conversation) throw notFound('Conversation');
    const message = {
      id: newId('msg'),
      tenantId: conversation.tenantId,
      conversationId: id,
      role: 'human' as const,
      content: body.text,
      metadata: { agent: body.agent ?? 'dashboard' },
      createdAt: nowIso(),
    };
    await store.messages.put(message);
    await store.conversations.patch(id, { status: 'open', assignedTo: body.agent, updatedAt: nowIso() });
    const customer = await store.customers.get(conversation.customerId);
    if (customer) {
      await channels.deliver({
        tenantId: conversation.tenantId,
        conversationId: id,
        externalId: customer.externalId,
        text: body.text,
        channel: conversation.channel,
      });
    }
    return message;
  });

  app.post('/api/conversations/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ status: z.enum(['open', 'escalated', 'closed']), assignedTo: z.string().optional() })
      .parse(request.body ?? {});
    const conversation = await store.conversations.get(id);
    if (!conversation) throw notFound('Conversation');
    return (await store.conversations.patch(id, { ...body, updatedAt: nowIso() })) ?? conversation;
  });

  // ------------------------------------------------------------------ products
  app.get('/api/products', async (request) => {
    const query = request.query as { tenantId?: string; search?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    return { items: await catalog.list(tenantId, { search: query.search }) };
  });

  app.post('/api/products', async (request, reply) => {
    const body = productSchema.parse(request.body ?? {});
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const product = await catalog.create({ tenantId, ...body });
    return reply.code(201).send(product);
  });

  app.patch('/api/products/:id', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const body = productSchema.partial().parse(request.body ?? {});
    const product = await catalog.update(tenantId, id, body);
    if (!product) throw notFound('Product');
    return product;
  });

  app.delete('/api/products/:id', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const removed = await catalog.remove(tenantId, id);
    return { removed };
  });

  app.post('/api/products/import', async (request) => {
    const body = z.object({ csv: z.string().min(1), tenantId: z.string().optional() }).parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const created = await catalog.importCsv(tenantId, body.csv);
    return { imported: created.length, items: created };
  });

  // -------------------------------------------------------------------- orders
  app.get('/api/orders', async (request) => {
    const query = request.query as { tenantId?: string; status?: string; limit?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    return {
      items: await orders.list(tenantId, {
        status: query.status as never,
        limit: Number(query.limit) || 200,
      }),
    };
  });

  app.get('/api/orders/:id', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const order = await orders.get(tenantId, id);
    if (!order) throw notFound('Order');
    const customer = await store.customers.get(order.customerId);
    return { order, customer };
  });

  app.post('/api/orders', async (request, reply) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        customerId: z.string(),
        conversationId: z.string().optional(),
        channel: z.enum(['whatsapp', 'webchat', 'webhook', 'email', 'mcp', 'api']).default('api'),
        items: z.array(z.object({ sku: z.string().optional(), productId: z.string().optional(), quantity: z.number().int().min(1).default(1) })).min(1),
        discount: z.number().optional(),
        shipping: z.number().optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const order = await orders.create({ ...body, tenantId });
    return reply.code(201).send(order);
  });

  app.post('/api/orders/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const body = z
      .object({
        status: z.enum(['draft', 'pending', 'confirmed', 'paid', 'fulfilled', 'cancelled', 'refunded']),
      })
      .parse(request.body ?? {});
    const order = await orders.setStatus(tenantId, id, body.status);
    return order;
  });

  app.post('/api/orders/:id/items', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const body = z.object({ sku: z.string(), quantity: z.number().int().min(1).default(1) }).parse(request.body ?? {});
    return orders.addItem(tenantId, id, body);
  });

  app.get('/api/orders/:id/upsell', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const order = await orders.get(tenantId, id);
    if (!order) throw notFound('Order');
    const cartProducts = (
      await Promise.all(order.lines.map((line) => catalog.findBySku(tenantId, line.sku)))
    ).filter((product): product is Product => Boolean(product));
    const opportunities = await upsell.findOpportunities({ tenantId, order, cartProducts });
    return {
      items: opportunities.map((opportunity) => ({
        sku: opportunity.product.sku,
        name: opportunity.product.name,
        price: formatMoney(opportunity.product.price, opportunity.product.currency),
        strategy: opportunity.rule.strategy,
        probability: opportunity.probability,
        expectedRevenue: formatMoney(opportunity.expectedRevenue, order.currency),
        reason: opportunity.reason,
      })),
    };
  });

  // ----------------------------------------------------------------- knowledge
  app.get('/api/knowledge', async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const documents = await ingestion.listDocuments(tenantId);
    return {
      items: documents.map((document) => ({
        id: document.id,
        title: document.title,
        source: document.source,
        url: document.url,
        chunks: document.chunks.length,
        characters: document.content.length,
        createdAt: document.createdAt,
      })),
    };
  });

  app.post('/api/knowledge/text', async (request, reply) => {
    const body = z
      .object({ tenantId: z.string().optional(), title: z.string().min(1), content: z.string().min(1) })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const result = await ingestion.ingestText({ tenantId, title: body.title, content: body.content });
    return reply.code(201).send({ id: result.document.id, chunks: result.chunks, characters: result.characters });
  });

  app.post('/api/knowledge/website', async (request) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        url: z.string().url(),
        maxPages: z.number().int().min(1).max(30).optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const result = await ingestion.ingestWebsite(tenantId, body.url, { maxPages: body.maxPages });
    return {
      pages: result.pages,
      documents: result.documents.length,
      profileApplied: result.profileApplied,
    };
  });

  app.post('/api/knowledge/faq', async (request, reply) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        entries: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const result = await ingestion.seedFaq(tenantId, body.entries);
    return reply.code(201).send({ id: result.document.id, chunks: result.chunks });
  });

  app.post('/api/knowledge/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) throw badRequest('No file uploaded');
    const buffer = await file.toBuffer();
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const result = await ingestion.ingestFile({
      tenantId,
      filename: file.filename,
      content: buffer.toString('utf8'),
      mimeType: file.mimetype,
    });
    return reply.code(201).send({ id: result.document.id, chunks: result.chunks, characters: result.characters });
  });

  app.delete('/api/knowledge/:id', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    return { removed: await ingestion.removeDocument(tenantId, id) };
  });

  app.post('/api/knowledge/profile/refresh', async (request) => {
    const body = z.object({ tenantId: z.string().optional() }).parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    return ingestion.refreshProfile(tenantId);
  });

  // ------------------------------------------------------------------- reports
  app.get('/api/reports', async (request) => {
    const query = request.query as { tenantId?: string; limit?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    return { items: await analytics.listReports(tenantId, Number(query.limit) || 25) };
  });

  app.post('/api/reports/generate', async (request) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        days: z.number().int().min(1).max(365).optional(),
        kind: z.enum(['daily', 'weekly', 'revenue', 'funnel', 'upsell']).optional(),
        format: z.enum(['json', 'markdown']).optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const tenant = await requireTenant(tenantId);
    const report = await analytics.generateReport(tenant, { days: body.days, kind: body.kind });
    if (body.format === 'markdown') {
      return { markdown: renderReportMarkdown(report, tenant.currency), report };
    }
    return report;
  });

  app.get('/api/reports/:id/markdown', async (request) => {
    const { id } = request.params as { id: string };
    const report = await store.reports.get(id);
    if (!report) throw notFound('Report');
    const tenant = await requireTenant(report.tenantId);
    return { markdown: renderReportMarkdown(report, tenant.currency) };
  });

  // ----------------------------------------------------------- agent playground
  app.post('/api/agent/message', async (request) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        channel: z.enum(['whatsapp', 'webchat', 'webhook', 'email', 'mcp', 'api']).default('api'),
        externalId: z.string().default('dashboard-tester'),
        text: z.string().min(1),
        name: z.string().optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const turn = await agent.handleInbound({
      tenantId,
      channel: body.channel,
      externalId: body.externalId,
      text: body.text,
      name: body.name,
      metadata: { via: 'dashboard' },
    });
    return turn;
  });

  // ------------------------------------------------------------- automations
  app.post('/api/automation/followups', async (request) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        olderThanMinutes: z.number().int().min(1).optional(),
        minProbability: z.number().min(0).max(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        dryRun: z.boolean().optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const results = await followUps.run({ ...body, tenantId });
    return { sent: results.length, results };
  });

  app.post('/api/automation/daily-report', async (request) => {
    const body = z
      .object({ tenantId: z.string().optional(), days: z.number().int().min(1).max(90).optional(), email: z.string().optional() })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const tenant = await requireTenant(tenantId);
    const report = await analytics.generateReport(tenant, { days: body.days ?? 1, kind: 'daily' });
    const markdown = renderReportMarkdown(report, tenant.currency);
    let delivered = false;
    if (body.email) {
      const result = await channels.deliver({
        tenantId,
        conversationId: 'report',
        externalId: body.email,
        text: markdown,
        channel: 'email',
        metadata: { subject: report.title },
      });
      delivered = result.ok;
    }
    return { report, markdown, delivered };
  });

  // ------------------------------------------------------------------ settings
  app.get('/api/settings', async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = await resolveTenantId(query.tenantId);
    const tenant = await requireTenant(tenantId);
    return {
      tenant,
      runtime: {
        db: store.kind,
        ai: runtime.provider ? { provider: runtime.provider.name, model: runtime.provider.model } : { provider: 'local-brain' },
        autoreply: config.autoreply,
        escalationThreshold: config.escalationThreshold,
        currency: config.currency,
        publicUrl: config.publicUrl,
        channels: channels.status(),
      },
    };
  });

  app.patch('/api/settings', async (request) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        autoReply: z.boolean().optional(),
        escalationThreshold: z.number().min(0).max(1).optional(),
        outboundWebhookUrl: z.string().url().optional(),
        outboundWebhookSecret: z.string().optional(),
        timezone: z.string().optional(),
        businessHours: z.string().optional(),
        goals: z.array(z.string()).optional(),
      })
      .parse(request.body ?? {});
    const tenantId = await resolveTenantId(body.tenantId);
    const tenant = await requireTenant(tenantId);
    const { tenantId: _ignored, ...settings } = body;
    const updated: Tenant = {
      ...tenant,
      settings: { ...tenant.settings, ...settings },
      updatedAt: nowIso(),
    };
    await store.tenants.put(updated);
    return updated;
  });

  // ------------------------------------------------------------- integrations
  app.get('/api/integrations', async () => ({
    channels: channels.status(),
    mcp: {
      transport: 'stdio',
      command: 'node --import tsx src/mcp/stdio.ts',
      httpEndpoint: `${config.publicUrl}/mcp`,
    },
    webhooks: {
      whatsapp: `${config.publicUrl}/webhooks/whatsapp`,
      inbound: `${config.publicUrl}/webhooks/inbound`,
      events: `${config.publicUrl}/api/events`,
    },
    embed: `<script src="${config.publicUrl}/widget/duty-widget.js" data-duty-key="YOUR_PUBLIC_KEY" async></script>`,
    storage: store.kind,
  }));

  // ------------------------------------------------------------- seed helpers
  app.post('/api/bootstrap', async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        websiteUrl: z.string().url().optional(),
        about: z.string().optional(),
        tone: z.string().optional(),
        currency: z.string().length(3).optional(),
        products: z
          .array(
            z.object({
              name: z.string(),
              price: z.number(),
              description: z.string().optional(),
              category: z.string().optional(),
              tags: z.array(z.string()).optional(),
            }),
          )
          .optional(),
      })
      .parse(request.body ?? {});

    const now = nowIso();
    const tenant: Tenant = {
      id: newId('ten'),
      name: body.name,
      websiteUrl: body.websiteUrl,
      about: body.about,
      tone: body.tone ?? 'friendly, concise, helpful',
      currency: body.currency ?? config.currency,
      locale: 'en',
      settings: {},
      createdAt: now,
      updatedAt: now,
    };
    await store.tenants.put(tenant);

    const created: Product[] = [];
    for (const product of body.products ?? []) {
      created.push(
        await catalog.create({
          tenantId: tenant.id,
          name: product.name,
          price: Math.round(product.price * 100),
          description: product.description,
          category: product.category,
          tags: product.tags,
          sku: slugify(product.name).toUpperCase().slice(0, 12),
        }),
      );
    }

    let ingestionResult: unknown = null;
    if (body.websiteUrl) {
      ingestionResult = await ingestion.ingestWebsite(tenant.id, body.websiteUrl, { maxPages: 8 });
    }

    return reply.code(201).send({ tenant, products: created, ingestion: ingestionResult });
  });
}

function buildSeries(orders: Array<{ createdAt: string; total: number; status: string }>, days: number) {
  const buckets = new Map<string, { date: string; orders: number; revenue: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(date, { date, orders: 0, revenue: 0 });
  }
  for (const order of orders) {
    const date = order.createdAt.slice(0, 10);
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.orders += 1;
    if (order.status === 'paid' || order.status === 'fulfilled') bucket.revenue += order.total;
  }
  return [...buckets.values()];
}
