import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { badRequest, notFound, unauthorized } from '../../core/errors.js';
import { newId, nowIso, hashId } from '../../core/ids.js';
import { createLogger } from '../../core/logger.js';
import type { Runtime } from '../runtime.js';
import { parseWhatsAppWebhook, toInbound } from '../../channels/whatsapp.js';
import type { InboundMessage } from '../../core/types.js';

const log = createLogger('public-api');

const webchatStartSchema = z.object({
  tenantId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  sessionId: z.string().optional(),
});

const webchatMessageSchema = z.object({
  sessionId: z.string().min(4),
  text: z.string().min(1).max(4000),
  name: z.string().optional(),
});

const inboundSchema = z.object({
  tenantId: z.string().optional(),
  channel: z.enum(['whatsapp', 'webchat', 'webhook', 'email', 'mcp', 'api']).default('webhook'),
  externalId: z.string().min(1),
  text: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function verifyHmac(secret: string, raw: string, signature: string | undefined): boolean {
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const provided = signature.replace(/^sha256=/, '');
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerPublicRoutes(app: FastifyInstance, runtime: Runtime): void {
  const { store, agent, analytics, catalog, ingestion, config } = runtime;

  const resolveTenant = async (tenantId?: string): Promise<string> => {
    if (tenantId) {
      const tenant = await store.tenants.get(tenantId);
      if (!tenant) throw notFound('Tenant');
      return tenant.id;
    }
    const tenant = await agent.defaultTenant();
    if (!tenant) throw badRequest('No tenant exists yet. Create one first.');
    return tenant.id;
  };

  // ------------------------------------------------------------------ health
  app.get('/api/health', async () => {
    const health = await store.health();
    return {
      status: health.ok ? 'ok' : 'degraded',
      version: '1.0.0',
      store: { kind: store.kind, ...health },
      ai: runtime.provider ? { provider: runtime.provider.name, model: runtime.provider.model } : { provider: 'local-brain' },
      channels: runtime.channels.status(),
      at: nowIso(),
    };
  });

  app.get('/api/public/config', async () => {
    const tenant = await agent.defaultTenant();
    return {
      name: tenant?.name ?? 'Duty',
      about: tenant?.about ?? null,
      currency: tenant?.currency ?? config.currency,
      locale: tenant?.locale ?? 'en',
      widget: { enabled: true, greeting: `Hi! I'm the ${tenant?.name ?? 'Duty'} assistant. How can I help?` },
    };
  });

  app.get('/api/public/catalog', async (request) => {
    const query = request.query as { tenantId?: string; search?: string };
    const tenantId = await resolveTenant(query.tenantId);
    const products = await catalog.list(tenantId, { search: query.search, limit: 60 });
    return {
      items: products
        .filter((product) => product.active)
        .map((product) => ({
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          category: product.category,
        })),
    };
  });

  // ---------------------------------------------------------------- web chat
  app.post('/api/webchat/session', async (request) => {
    const body = webchatStartSchema.parse(request.body ?? {});
    const tenantId = await resolveTenant(body.tenantId);
    const sessionId = body.sessionId || newId('wcs');
    const customer = await store.customers.put({
      id: `cus_${hashId(`webchat:${tenantId}:${sessionId}`)}`,
      tenantId,
      channel: 'webchat',
      externalId: sessionId,
      name: body.name,
      email: body.email,
      tags: [],
      ltv: 0,
      metadata: { userAgent: request.headers['user-agent'] },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return { sessionId, customerId: customer.id, tenantId };
  });

  app.post('/api/webchat/message', async (request) => {
    const body = webchatMessageSchema.parse(request.body ?? {});
    const tenantId = await resolveTenant();
    const turn = await agent.handleInbound({
      tenantId,
      channel: 'webchat',
      externalId: body.sessionId,
      text: body.text,
      name: body.name,
      metadata: { via: 'widget' },
    });
    return {
      reply: turn.reply,
      intent: turn.intent,
      escalated: turn.escalated,
      actions: turn.actions.map((action) => ({ kind: action.kind, label: action.label })),
      orderIds: turn.orderIds,
    };
  });

  app.get('/api/webchat/history', async (request) => {
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) throw badRequest('sessionId is required');
    const customers = await store.customers.list({
      where: { channel: 'webchat', externalId: query.sessionId },
      limit: 1,
    });
    const customer = customers[0];
    if (!customer) return { messages: [] };
    const conversations = await store.conversations.list({
      where: { customerId: customer.id },
      limit: 5,
      orderBy: 'createdAt',
      order: 'desc',
    });
    const conversation = conversations[0];
    if (!conversation) return { messages: [] };
    const messages = await store.messages.list({
      where: { conversationId: conversation.id },
      limit: 100,
      orderBy: 'createdAt',
      order: 'asc',
    });
    return {
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        at: message.createdAt,
        actions: message.actions?.map((action) => action.label) ?? [],
      })),
    };
  });

  // ------------------------------------------------------------- whatsapp
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      return reply.type('text/plain').send(challenge ?? 'ok');
    }
    return reply.code(403).send('verification failed');
  });

  app.post('/webhooks/whatsapp', async (request, reply) => {
    const raw = JSON.stringify(request.body ?? {});
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (config.whatsapp.webhookSecret && !verifyHmac(config.whatsapp.webhookSecret, raw, signature)) {
      return reply.code(401).send({ error: 'bad signature' });
    }
    const tenantId = await resolveTenant();
    const parsed = parseWhatsAppWebhook(request.body);
    const results = [];
    for (const message of parsed) {
      const turn = await agent.handleInbound(toInbound(tenantId, message));
      results.push({ conversationId: turn.conversationId, intent: turn.intent, escalated: turn.escalated });
    }
    log.info(`whatsapp webhook processed ${parsed.length} message(s)`);
    return reply.send({ received: true, processed: results.length, results });
  });

  // ------------------------------------------------------- generic inbound
  app.post('/webhooks/inbound', async (request, reply) => {
    const raw = JSON.stringify(request.body ?? {});
    const signature = request.headers['x-duty-signature'] as string | undefined;
    const secret = process.env.INBOUND_WEBHOOK_SECRET ?? '';
    if (secret && !verifyHmac(secret, raw, signature)) {
      return reply.code(401).send({ error: 'bad signature' });
    }
    const body = inboundSchema.parse(request.body ?? {});
    const tenantId = await resolveTenant(body.tenantId);
    const inbound: InboundMessage = {
      tenantId,
      channel: body.channel,
      externalId: body.externalId,
      text: body.text,
      name: body.name,
      email: body.email,
      phone: body.phone,
      locale: body.locale,
      metadata: body.metadata,
    };
    const turn = await agent.handleInbound(inbound);
    return reply.send({
      conversationId: turn.conversationId,
      reply: turn.reply,
      intent: turn.intent,
      confidence: turn.confidence,
      escalated: turn.escalated,
      actions: turn.actions,
      orderIds: turn.orderIds,
    });
  });

  // ------------------------------------------------ report + catalogue feed
  app.get('/api/public/report', async (request) => {
    const query = request.query as { token?: string; days?: string };
    if (query.token !== config.adminToken) throw unauthorized();
    const tenant = await agent.defaultTenant();
    if (!tenant) throw notFound('Tenant');
    const report = await analytics.generateReport(tenant, {
      days: Number(query.days) || 7,
      kind: 'revenue',
    });
    return report;
  });

  app.get('/api/public/products.csv', async (request, reply) => {
    const query = request.query as { token?: string };
    if (query.token !== config.adminToken) throw unauthorized();
    const tenant = await agent.defaultTenant();
    if (!tenant) throw notFound('Tenant');
    const products = await catalog.list(tenant.id, { limit: 500 });
    const csv = [
      'sku,name,price,category,active',
      ...products.map(
        (product) =>
          `${product.sku},"${product.name.replace(/"/g, '""')}",${(product.price / 100).toFixed(2)},${product.category ?? ''},${product.active}`,
      ),
    ].join('\n');
    return reply.type('text/csv').send(csv);
  });
}
