import { loadConfig, type AppConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { bus } from '../core/events.js';
import { createStore, initStore } from '../storage/index.js';
import type { Store } from '../storage/index.js';
import { CatalogService } from '../commerce/catalog.js';
import { OrderService } from '../commerce/orders.js';
import { UpsellEngine } from '../commerce/upsell.js';
import { AnalyticsService } from '../commerce/analytics.js';
import { createProvider, type LLMProvider } from '../ai/provider.js';
import { createEmbedder, type Embedder } from '../ai/embeddings.js';
import { DutyAgent } from '../ai/agent.js';
import { IngestionService } from '../integrations/ingest.js';
import { ChannelRegistry } from '../channels/registry.js';

const log = createLogger('runtime');

export interface Runtime {
  config: AppConfig;
  store: Store;
  catalog: CatalogService;
  orders: OrderService;
  upsell: UpsellEngine;
  analytics: AnalyticsService;
  provider: LLMProvider | null;
  embedder: Embedder;
  agent: DutyAgent;
  ingestion: IngestionService;
  channels: ChannelRegistry;
  close(): Promise<void>;
}

export async function createRuntime(overrides: Partial<AppConfig> = {}): Promise<Runtime> {
  const config = { ...loadConfig(), ...overrides };
  const store = await initStore(createStore(config));

  const catalog = new CatalogService(store, config.currency);
  const orders = new OrderService(store, catalog, config.currency);
  const upsell = new UpsellEngine(catalog);
  const provider = createProvider(config);
  const analytics = new AnalyticsService(store, provider);
  const embedder = createEmbedder(provider, config.ai.embeddings);
  const agent = new DutyAgent({ store, catalog, orders, upsell, provider, embedder, config });
  const ingestion = new IngestionService({ store, embedder, provider, config });
  const channels = new ChannelRegistry(config);

  wireOutboundDelivery(channels, store);

  log.info(`Duty runtime ready — db=${store.kind}, ai=${provider ? provider.name : 'local-brain'}`);
  return {
    config,
    store,
    catalog,
    orders,
    upsell,
    analytics,
    provider,
    embedder,
    agent,
    ingestion,
    channels,
    close: async () => {
      await store.close();
    },
  };
}

/**
 * Every agent reply is pushed back through the channel that produced it. The
 * outbound-webhook URL is resolved per tenant so a merchant can mirror traffic
 * into their own stack without a custom adapter.
 */
function wireOutboundDelivery(channels: ChannelRegistry, store: Store): void {
  bus.on('message.outbound', async (event) => {
    const conversation = await store.conversations.get(event.conversationId);
    if (!conversation) return;
    const customer = await store.customers.get(conversation.customerId);
    if (!customer) return;
    const tenant = await store.tenants.get(event.tenantId);
    const outboundWebhookUrl = tenant?.settings?.outboundWebhookUrl;

    const results = [
      await channels.deliver({
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        externalId: customer.externalId,
        text: event.text,
        channel: conversation.channel,
        metadata: {
          outboundWebhookUrl,
          outboundWebhookSecret: tenant?.settings?.outboundWebhookSecret,
        },
      }),
    ];

    if (outboundWebhookUrl && conversation.channel !== 'webhook') {
      results.push(
        await channels.deliver({
          tenantId: event.tenantId,
          conversationId: event.conversationId,
          externalId: customer.externalId,
          text: event.text,
          channel: 'webhook',
          metadata: { outboundWebhookUrl, outboundWebhookSecret: tenant?.settings?.outboundWebhookSecret },
        }),
      );
    }

    for (const result of results) {
      if (!result.ok && result.detail && !/not configured|no outboundWebhookUrl/.test(result.detail)) {
        log.warn(`delivery issue: ${result.detail}`);
      }
    }
  });

  bus.on('order.paid', (event) => log.info(`order paid`, { orderId: event.orderId, total: event.total }));
  bus.on('upsell.accepted', (event) =>
    log.info(`upsell accepted (+${event.revenue})`, { orderId: event.orderId, sku: event.sku }),
  );
}
