import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from '../core/logger.js';
import type { Runtime } from '../server/runtime.js';
import { formatMoney } from '../core/money.js';
import { renderReportMarkdown } from '../commerce/analytics.js';

const log = createLogger('mcp');

const asText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

/**
 * Duty's MCP server. Any MCP-capable client (Claude Desktop, Cursor, an
 * internal agent) can drive the same brain that answers WhatsApp: take orders,
 * quote the catalogue, pull revenue reports, and hand off conversations.
 *
 *   node --import tsx src/mcp/server.ts        # stdio transport
 */
export function buildMcpServer(runtime: Runtime): McpServer {
  const { store, catalog, orders, agent, analytics, ingestion } = runtime;

  const resolveTenantId = async (tenantId?: string): Promise<string> => {
    if (tenantId) return tenantId;
    const tenant = await agent.defaultTenant();
    if (!tenant) throw new Error('No tenant exists yet. Create one via POST /api/tenants first.');
    return tenant.id;
  };

  const server = new McpServer({ name: 'duty', version: '1.0.0' });

  server.registerTool(
    'duty_handle_message',
    {
      title: 'Handle a customer message',
      description:
        'Run an inbound customer message through Duty. Creates or updates the customer, answers, captures orders, and returns the reply plus the actions taken.',
      inputSchema: {
        text: z.string().describe('The customer message'),
        channel: z
          .enum(['whatsapp', 'webchat', 'webhook', 'email', 'mcp', 'api'])
          .default('mcp')
          .describe('Which channel the message came from'),
        externalId: z.string().describe('Channel-scoped customer id (phone number, session id, email)'),
        name: z.string().optional().describe('Customer display name'),
        tenantId: z.string().optional().describe('Tenant id; defaults to the first tenant'),
      },
    },
    async ({ text, channel, externalId, name, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const turn = await agent.handleInbound({
        tenantId: resolvedTenant,
        channel,
        externalId,
        text,
        name,
        metadata: { via: 'mcp' },
      });
      return asText({
        reply: turn.reply,
        intent: turn.intent,
        confidence: turn.confidence,
        escalated: turn.escalated,
        orderIds: turn.orderIds,
        actions: turn.actions,
      });
    },
  );

  server.registerTool(
    'duty_search_catalog',
    {
      title: 'Search the catalogue',
      description: 'Search products by keyword and return SKUs, names and prices.',
      inputSchema: {
        query: z.string().default('').describe('Search terms; empty returns everything'),
        tenantId: z.string().optional(),
      },
    },
    async ({ query, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const products = await catalog.list(resolvedTenant, { search: query, limit: 25 });
      return asText(
        products.map((product) => ({
          sku: product.sku,
          name: product.name,
          price: formatMoney(product.price, product.currency),
          category: product.category,
          active: product.active,
        })),
      );
    },
  );

  server.registerTool(
    'duty_create_order',
    {
      title: 'Create an order',
      description: 'Create a draft order from SKUs. Returns the order number, total and id.',
      inputSchema: {
        items: z
          .array(z.object({ sku: z.string(), quantity: z.number().int().min(1).default(1) }))
          .min(1)
          .describe('Order lines'),
        customerId: z.string().optional().describe('Existing customer id; a walk-in customer is created if omitted'),
        tenantId: z.string().optional(),
      },
    },
    async ({ items, customerId, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      let resolvedCustomer = customerId;
      if (!resolvedCustomer) {
        const created = await store.customers.put({
          id: `cus_mcp_${Date.now().toString(36)}`,
          tenantId: resolvedTenant,
          channel: 'mcp',
          externalId: `mcp:${Date.now().toString(36)}`,
          name: 'MCP caller',
          tags: [],
          ltv: 0,
          metadata: { via: 'mcp' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        resolvedCustomer = created.id;
      }
      const order = await orders.create({
        tenantId: resolvedTenant,
        customerId: resolvedCustomer,
        channel: 'mcp',
        items,
      });
      return asText({
        orderId: order.id,
        number: order.number,
        total: formatMoney(order.total, order.currency),
        lines: order.lines,
      });
    },
  );

  server.registerTool(
    'duty_get_order',
    {
      title: 'Look up an order',
      description: 'Fetch an order by its number (DTY-…) or id.',
      inputSchema: {
        reference: z.string().describe('Order number or id'),
        tenantId: z.string().optional(),
      },
    },
    async ({ reference, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const byId = await orders.get(resolvedTenant, reference);
      const order =
        byId ?? (await store.orders.list({ where: { tenantId: resolvedTenant, number: reference }, limit: 1 }))[0];
      if (!order) return asText({ error: 'order not found' });
      return asText({
        number: order.number,
        status: order.status,
        total: formatMoney(order.total, order.currency),
        probability: order.purchaseProbability,
        lines: order.lines.map((line) => `${line.quantity}x ${line.name}`),
      });
    },
  );

  server.registerTool(
    'duty_revenue_report',
    {
      title: 'Revenue report',
      description: 'Return revenue metrics and a written briefing for the last N days.',
      inputSchema: {
        days: z.number().int().min(1).max(365).default(7),
        tenantId: z.string().optional(),
      },
    },
    async ({ days, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const tenant = await store.tenants.get(resolvedTenant);
      if (!tenant) return asText({ error: 'tenant not found' });
      const report = await analytics.generateReport(tenant, { days, kind: 'revenue' });
      return asText(renderReportMarkdown(report, tenant.currency));
    },
  );

  server.registerTool(
    'duty_lookup_knowledge',
    {
      title: 'Look up business knowledge',
      description: 'Search the ingested business knowledge base (website, files, FAQs).',
      inputSchema: {
        query: z.string().describe('What to look up'),
        tenantId: z.string().optional(),
      },
    },
    async ({ query, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const documents = await store.knowledge.list({ where: { tenantId: resolvedTenant }, limit: 200 });
      const { retrieve } = await import('../ai/knowledge.js');
      const chunks = await retrieve(documents, query, runtime.embedder, 5);
      return asText(chunks.map((chunk) => ({ source: chunk.documentTitle, url: chunk.url, text: chunk.text })));
    },
  );

  server.registerTool(
    'duty_ingest_website',
    {
      title: 'Teach Duty a website',
      description: 'Crawl a website and store it as business knowledge, then refresh the business profile.',
      inputSchema: {
        url: z.string().url(),
        maxPages: z.number().int().min(1).max(30).default(8),
        tenantId: z.string().optional(),
      },
    },
    async ({ url, maxPages, tenantId }) => {
      const resolvedTenant = await resolveTenantId(tenantId);
      const result = await ingestion.ingestWebsite(resolvedTenant, url, { maxPages, deriveProfile: true });
      return asText({ pages: result.pages, documents: result.documents.length, profileApplied: result.profileApplied });
    },
  );

  server.registerResource(
    'catalogue',
    'duty://catalogue',
    { title: 'Product catalogue', description: 'All active products with prices', mimeType: 'application/json' },
    async () => {
      const tenantId = await resolveTenantId();
      const products = await catalog.list(tenantId, { limit: 200 });
      return {
        contents: [
          { uri: 'duty://catalogue', mimeType: 'application/json', text: JSON.stringify(products, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    'latest-report',
    'duty://reports/latest',
    { title: 'Latest revenue report', description: 'The most recent generated report', mimeType: 'text/markdown' },
    async () => {
      const tenantId = await resolveTenantId();
      const reports = await analytics.listReports(tenantId, 1);
      return {
        contents: [
          {
            uri: 'duty://reports/latest',
            mimeType: 'text/markdown',
            text: reports[0]?.narrative ?? 'No reports yet.',
          },
        ],
      };
    },
  );

  return server;
}

export async function startMcpStdio(runtime: Runtime): Promise<void> {
  const server = buildMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('Duty MCP server listening on stdio');
}
