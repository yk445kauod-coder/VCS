import type {
  AgentAction,
  AgentTurn,
  Conversation,
  Customer,
  InboundMessage,
  Message,
  Order,
  Product,
  Tenant,
  UpsellRule,
} from '../core/types.js';
import type { Store } from '../storage/index.js';
import { newId, nowIso, truncate } from '../core/ids.js';
import { formatMoney } from '../core/money.js';
import { createLogger } from '../core/logger.js';
import { bus } from '../core/events.js';
import type { AppConfig } from '../core/config.js';
import type { ChatMessage, LLMProvider, ToolSpec } from './provider.js';
import { classify, draft, pickProduct, type IntentSignal } from './local-brain.js';
import { retrieve } from './knowledge.js';
import type { Embedder } from './embeddings.js';
import type { CatalogService } from '../commerce/catalog.js';
import { estimatePurchaseProbability, type OrderService } from '../commerce/orders.js';
import type { UpsellEngine } from '../commerce/upsell.js';

const log = createLogger('agent');

export interface AgentDeps {
  store: Store;
  catalog: CatalogService;
  orders: OrderService;
  upsell: UpsellEngine;
  provider: LLMProvider | null;
  embedder: Embedder;
  config: AppConfig;
}

const TOOLS: ToolSpec[] = [
  {
    name: 'search_catalog',
    description: 'Search the product catalogue by keywords. Use this before quoting prices or suggesting products.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'lookup_knowledge',
    description: 'Look up facts about the business (policies, shipping, FAQs, product details) from the knowledge base.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'create_order',
    description: 'Create a draft order for the current customer. Use when the customer clearly wants to buy.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
            },
            required: ['sku'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'add_to_order',
    description: 'Add a product to an existing draft order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        sku: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
      },
      required: ['orderId', 'sku'],
    },
  },
  {
    name: 'get_order_status',
    description: 'Look up the status of an order by its number (DTY-…) or id.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string' } },
      required: ['reference'],
    },
  },
  {
    name: 'offer_upsell',
    description:
      'Present a relevant add-on offer on an order. Only call when it genuinely helps the customer; the system computes the expected revenue.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        sku: { type: 'string' },
        discountPercent: { type: 'number' },
        pitch: { type: 'string' },
      },
      required: ['orderId', 'sku'],
    },
  },
  {
    name: 'remember',
    description: 'Save a durable fact about this customer for future conversations.',
    parameters: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Hand the conversation to a human teammate. Use for refunds, complaints, legal, or explicit requests.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
];

export class DutyAgent {
  constructor(private readonly deps: AgentDeps) {}

  async handleInbound(input: InboundMessage): Promise<AgentTurn> {
    const { store } = this.deps;
    const tenant = await this.requireTenant(input.tenantId);
    const customer = await this.resolveCustomer(tenant.id, input);
    const conversation = await this.resolveConversation(tenant.id, customer, input);

    const inbound: Message = {
      id: newId('msg'),
      tenantId: tenant.id,
      conversationId: conversation.id,
      role: 'customer',
      content: input.text,
      attachments: input.attachments,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };
    await store.messages.put(inbound);
    bus.emit('message.inbound', {
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: input.channel,
      text: input.text,
    });

    const history = await this.history(conversation.id);
    const products = await this.deps.catalog.list(tenant.id, { limit: 100 });
    const knowledge = await this.knowledgeFor(tenant.id, input.text);
    const intent = classify(input.text);
    const openOrder = await this.openOrderFor(tenant.id, customer.id, conversation.id);
    const lastOrder = openOrder ?? (await this.deps.orders.lastForCustomer(tenant.id, customer.id));

    const ctx: TurnContext = { tenant, customer, conversation, input, history, products, knowledge, intent, openOrder, lastOrder };
    const turn = await this.runTurn(ctx);

    await this.persistTurn(tenant, customer, conversation, turn, intent);
    return turn;
  }

  /**
   * Runs the LLM path, and falls back to the deterministic brain if the provider
   * fails.
   *
   * An LLM outage must not stop the shop from selling. Rate limits, quota
   * exhaustion and provider 5xxs are all routine, and the previous behaviour was
   * to let the exception propagate: the customer's message got no reply at all
   * and the webhook returned a 5xx. Order capture, pricing and escalation are all
   * deterministic, so the fallback still takes the order and answers.
   *
   * Partial LLM work is preserved. If the model created an order and then a later
   * step failed, the fallback runs with that order already in context — otherwise
   * it would see no open order and create a second one for the same request.
   */
  private async runTurn(ctx: TurnContext): Promise<AgentTurn> {
    if (!this.deps.provider) return this.runLocalTurn(ctx);

    let partial: AgentTurn | undefined;
    try {
      return await this.runLlmTurn(ctx, (snapshot) => {
        partial = snapshot;
      });
    } catch (error) {
      log.warn('LLM turn failed, falling back to the deterministic brain', {
        tenantId: ctx.tenant.id,
        conversationId: ctx.conversation.id,
        error: String(error),
      });

      // Re-read any draft the partial turn created, so the fallback adds to it
      // rather than opening a duplicate.
      let openOrder = ctx.openOrder;
      if (partial?.orderIds.length) {
        const latest = await this.openOrderFor(ctx.tenant.id, ctx.customer.id, ctx.conversation.id);
        if (latest) openOrder = latest;
      }

      const local = await this.runLocalTurn({ ...ctx, openOrder });
      return {
        ...local,
        // Keep whatever the model already did; the local turn re-derives its own.
        actions: [...(partial?.actions ?? []), ...local.actions],
        orderIds: [...new Set([...(partial?.orderIds ?? []), ...local.orderIds])],
        escalated: local.escalated || (partial?.escalated ?? false),
      };
    }
  }

  // ---------------------------------------------------------------- LLM path

  private async runLlmTurn(ctx: TurnContext, onProgress?: (snapshot: AgentTurn) => void): Promise<AgentTurn> {
    const { tenant, customer, conversation, input, history, products, knowledge, intent, openOrder } = ctx;
    const actions: AgentAction[] = [];
    const orderIds: string[] = [];
    let escalated = false;
    let upsell: (UpsellRule & { product?: Product }) | undefined;
    let currentOrder = openOrder;

    const messages: ChatMessage[] = [
      ...history.slice(-8).map<ChatMessage>((message) => ({
        role: message.role === 'customer' ? 'user' : message.role === 'agent' ? 'assistant' : 'user',
        content: `${message.role === 'customer' ? 'Customer' : message.role === 'agent' ? 'Duty' : message.role}: ${truncate(message.content, 600)}`,
      })),
      { role: 'user', content: input.text },
    ];

    let finalText = '';
    let confidence = 0.6;

    for (let step = 0; step < 4; step += 1) {
      const completion = await this.deps.provider!.complete({
        system: this.systemPrompt(tenant, customer, products, knowledge, currentOrder),
        messages,
        tools: TOOLS,
        temperature: 0.4,
        maxTokens: 800,
      });

      if (!completion.toolCalls.length) {
        finalText = completion.text.trim();
        break;
      }

      messages.push({ role: 'assistant', content: completion.text || '(working…)' });
      for (const call of completion.toolCalls) {
        const outcome = await this.executeTool(call.name, call.arguments, {
          tenant,
          customer,
          conversation,
          currentOrder,
          products,
        });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(outcome.result).slice(0, 2000),
        });
        if (outcome.action) actions.push(outcome.action);
        if (outcome.order) {
          currentOrder = outcome.order;
          if (!orderIds.includes(outcome.order.id)) orderIds.push(outcome.order.id);
        }
        if (outcome.escalate) escalated = true;
        if (outcome.upsell) upsell = outcome.upsell;
        if (outcome.confidence) confidence = outcome.confidence;
      }
      onProgress?.({
        conversationId: conversation.id,
        customerId: customer.id,
        reply: finalText,
        actions,
        intent: intent.intent,
        sentiment: intent.sentiment,
        confidence,
        escalated,
        orderIds,
        upsell,
      });
      if (!finalText && completion.text.trim()) finalText = completion.text.trim();
    }

    if (!finalText) {
      const fallback = draft({
        tenant,
        intent,
        text: input.text,
        products,
        openOrder: currentOrder,
        lastOrder: ctx.lastOrder,
        knowledge,
        currency: tenant.currency || this.deps.config.currency,
      });
      finalText = fallback.reply;
      confidence = Math.min(confidence, fallback.confidence);
    }

    const needsHuman =
      escalated ||
      intent.intent === 'human_request' ||
      intent.intent === 'refund' ||
      (intent.intent === 'complaint' && intent.sentiment < 0.4) ||
      confidence < this.deps.config.escalationThreshold;

    return {
      conversationId: conversation.id,
      customerId: customer.id,
      reply: finalText,
      actions,
      intent: intent.intent,
      sentiment: intent.sentiment,
      confidence,
      escalated: needsHuman,
      orderIds,
      upsell,
    };
  }

  // ------------------------------------------------------------- local path

  private async runLocalTurn(ctx: TurnContext): Promise<AgentTurn> {
    const { tenant, customer, conversation, input, products, knowledge, intent } = ctx;
    const actions: AgentAction[] = [];
    const orderIds: string[] = [];
    let currentOrder = ctx.openOrder;
    let upsell: (UpsellRule & { product?: Product }) | undefined;

    // Deterministic order capture.
    if (intent.intent === 'order_intent') {
      const product = pickProduct(input.text, products);
      if (product) {
        if (currentOrder) {
          currentOrder = await this.deps.orders.addItem(tenant.id, currentOrder.id, { sku: product.sku });
          actions.push({
            kind: 'update_order',
            label: `Added ${product.name} to ${currentOrder.number}`,
            payload: { orderId: currentOrder.id, sku: product.sku },
            confidence: 0.8,
          });
        } else {
          currentOrder = await this.deps.orders.create({
            tenantId: tenant.id,
            customerId: customer.id,
            conversationId: conversation.id,
            channel: input.channel,
            items: [{ sku: product.sku }],
            currency: tenant.currency,
          });
          orderIds.push(currentOrder.id);
          actions.push({
            kind: 'create_order',
            label: `Created draft order ${currentOrder.number} for ${product.name}`,
            payload: { orderId: currentOrder.id, sku: product.sku },
            confidence: 0.8,
          });
          bus.emit('order.created', { tenantId: tenant.id, orderId: currentOrder.id, total: currentOrder.total });
        }
        currentOrder = await this.deps.orders.setProbability(
          tenant.id,
          currentOrder.id,
          estimatePurchaseProbability({
            intentConfidence: intent.confidence,
            intent: intent.intent,
            messageCount: ctx.history.length,
            customerLtv: customer.ltv,
            hasMatchingProduct: true,
            sentiment: intent.sentiment,
          }),
        );
      }
    }

    // Upsell recommendation on any live cart.
    if (currentOrder && currentOrder.lines.length) {
      const cartProducts = (
        await Promise.all(currentOrder.lines.map((line) => this.deps.catalog.findBySku(tenant.id, line.sku)))
      ).filter((product): product is Product => Boolean(product));
      const best = await this.deps.upsell.best({
        tenantId: tenant.id,
        order: currentOrder,
        cartProducts,
        customerLtv: customer.ltv,
      });
      if (best) {
        upsell = { ...best.rule, product: best.product };
        await this.deps.orders.markUpsell(tenant.id, currentOrder.id, best.product.sku, false);
        actions.push({
          kind: 'offer_upsell',
          label: `Offered ${best.product.name} (${best.rule.strategy})`,
          payload: { orderId: currentOrder.id, sku: best.product.sku, expectedRevenue: best.expectedRevenue },
          confidence: best.probability,
        });
        bus.emit('upsell.offered', {
          tenantId: tenant.id,
          orderId: currentOrder.id,
          sku: best.product.sku,
          strategy: best.rule.strategy,
        });
      }
    }

    // Explicit confirmation finalises the draft so it enters the pipeline.
    if (intent.intent === 'confirm_order' && currentOrder && currentOrder.status === 'draft') {
      currentOrder = await this.deps.orders.setStatus(tenant.id, currentOrder.id, 'pending');
      actions.push({
        kind: 'update_order',
        label: `Confirmed order ${currentOrder.number} (pending payment)`,
        payload: { orderId: currentOrder.id, status: currentOrder.status },
        confidence: 0.9,
      });
      bus.emit('order.updated', {
        tenantId: tenant.id,
        orderId: currentOrder.id,
        status: currentOrder.status,
      });
    }

    // Upsell acceptance.
    if (intent.intent === 'upsell_accept' && currentOrder && upsell?.product) {
      currentOrder = await this.deps.orders.addItem(tenant.id, currentOrder.id, { sku: upsell.product.sku });
      currentOrder = await this.deps.orders.markUpsell(tenant.id, currentOrder.id, upsell.product.sku, true);
      bus.emit('upsell.accepted', {
        tenantId: tenant.id,
        orderId: currentOrder.id,
        sku: upsell.product.sku,
        revenue: currentOrder.total,
      });
      actions.push({
        kind: 'update_order',
        label: `Upsell accepted: ${upsell.product.name}`,
        payload: { orderId: currentOrder.id, sku: upsell.product.sku },
        confidence: 0.9,
      });
    }

    const drafted = draft({
      tenant,
      intent,
      text: input.text,
      products,
      openOrder: currentOrder,
      lastOrder: ctx.lastOrder,
      knowledge,
      currency: tenant.currency || this.deps.config.currency,
      upsell: upsell?.product ? { product: upsell.product, pitch: upsell.pitch, discountPercent: upsell.discountPercent } : null,
    });

    let reply = drafted.reply;
    const alreadyCommitted = ['confirm_order', 'upsell_accept'].includes(intent.intent);
    if (
      upsell?.product &&
      currentOrder?.status === 'draft' &&
      !alreadyCommitted &&
      !actions.some((action) => action.kind === 'update_order' && /Upsell accepted/.test(action.label))
    ) {
      const price = upsell.discountPercent
        ? Math.round(upsell.product.price * (1 - upsell.discountPercent / 100))
        : upsell.product.price;
      reply += `\n\n💡 ${upsell.pitch ?? `Add ${upsell.product.name} for ${formatMoney(price, upsell.product.currency)}?`}`;
    }

    const escalated =
      drafted.needsHuman ||
      intent.intent === 'human_request' ||
      drafted.confidence < this.deps.config.escalationThreshold;

    if (escalated) {
      actions.push({ kind: 'escalate', label: 'Escalated to a human teammate', confidence: 0.9 });
    }

    return {
      conversationId: conversation.id,
      customerId: customer.id,
      reply,
      actions,
      intent: intent.intent,
      sentiment: intent.sentiment,
      confidence: drafted.confidence,
      escalated,
      orderIds,
      upsell,
    };
  }

  // ------------------------------------------------------------------ tools

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolOutcome> {
    const { tenant, customer, conversation } = ctx;
    try {
      switch (name) {
        case 'search_catalog': {
          const results = await this.deps.catalog.list(tenant.id, { search: String(args.query ?? ''), limit: 6 });
          return {
            result: results.map((product) => ({
              sku: product.sku,
              name: product.name,
              price: formatMoney(product.price, product.currency),
              priceMinor: product.price,
              description: product.description,
            })),
          };
        }
        case 'lookup_knowledge': {
          const chunks = await this.knowledgeFor(tenant.id, String(args.query ?? ''));
          return { result: chunks.map((chunk) => ({ source: chunk.documentTitle, text: chunk.text })) };
        }
        case 'create_order': {
          const items = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
          if (!items.length) return { result: { error: 'no items provided' } };
          const order = await this.deps.orders.create({
            tenantId: tenant.id,
            customerId: customer.id,
            conversationId: conversation.id,
            channel: conversation.channel,
            items: items.map((item) => ({
              sku: item.sku ? String(item.sku) : undefined,
              quantity: item.quantity ? Number(item.quantity) : 1,
            })),
            currency: tenant.currency,
          });
          bus.emit('order.created', { tenantId: tenant.id, orderId: order.id, total: order.total });
          return {
            result: { orderId: order.id, number: order.number, total: formatMoney(order.total, order.currency) },
            order,
            action: {
              kind: 'create_order',
              label: `Created draft order ${order.number}`,
              payload: { orderId: order.id },
              confidence: 0.85,
            },
          };
        }
        case 'add_to_order': {
          const order = await this.deps.orders.addItem(tenant.id, String(args.orderId), {
            sku: String(args.sku),
            quantity: args.quantity ? Number(args.quantity) : 1,
          });
          return {
            result: { orderId: order.id, total: formatMoney(order.total, order.currency) },
            order,
            action: {
              kind: 'update_order',
              label: `Added ${String(args.sku)} to ${order.number}`,
              payload: { orderId: order.id, sku: String(args.sku) },
              confidence: 0.85,
            },
          };
        }
        case 'get_order_status': {
          const reference = String(args.reference ?? '');
          const found = await this.findOrder(tenant.id, reference);
          return {
            result: found
              ? {
                  number: found.number,
                  status: found.status,
                  total: formatMoney(found.total, found.currency),
                  lines: found.lines.map((line) => `${line.quantity}x ${line.name}`),
                }
              : { error: 'order not found' },
          };
        }
        case 'offer_upsell': {
          const order = await this.deps.orders.get(tenant.id, String(args.orderId));
          if (!order) return { result: { error: 'order not found' } };
          const product = await this.deps.catalog.findBySku(tenant.id, String(args.sku));
          if (!product) return { result: { error: 'product not found' } };
          const rule: UpsellRule = {
            strategy: 'cross_sell',
            targetSku: product.sku,
            discountPercent: args.discountPercent ? Number(args.discountPercent) : undefined,
            pitch: args.pitch ? String(args.pitch) : undefined,
            priority: 1,
            active: true,
          };
          await this.deps.orders.markUpsell(tenant.id, order.id, product.sku, false);
          bus.emit('upsell.offered', {
            tenantId: tenant.id,
            orderId: order.id,
            sku: product.sku,
            strategy: rule.strategy,
          });
          return {
            result: { offered: product.name, price: formatMoney(product.price, product.currency) },
            order,
            upsell: { ...rule, product },
            action: {
              kind: 'offer_upsell',
              label: `Offered ${product.name}`,
              payload: { orderId: order.id, sku: product.sku },
              confidence: 0.6,
            },
          };
        }
        case 'remember': {
          const note = String(args.note ?? '').slice(0, 500);
          if (note) {
            const notes = Array.isArray(customer.metadata.notes) ? (customer.metadata.notes as string[]) : [];
            await this.deps.store.customers.patch(customer.id, {
              metadata: { ...customer.metadata, notes: [...notes, note].slice(-20) },
              updatedAt: nowIso(),
            });
          }
          return { result: { saved: true } };
        }
        case 'escalate_to_human': {
          return {
            result: { escalated: true },
            escalate: true,
            action: {
              kind: 'escalate',
              label: `Escalated: ${String(args.reason ?? 'customer request')}`,
              payload: { reason: args.reason },
              confidence: 0.95,
            },
          };
        }
        default:
          return { result: { error: `unknown tool ${name}` } };
      }
    } catch (error) {
      log.warn(`tool ${name} failed`, String(error));
      return { result: { error: String(error) } };
    }
  }

  // ------------------------------------------------------------- persistence

  private async persistTurn(
    tenant: Tenant,
    customer: Customer,
    conversation: Conversation,
    turn: AgentTurn,
    intent: IntentSignal,
  ): Promise<void> {
    const outbound: Message = {
      id: newId('msg'),
      tenantId: tenant.id,
      conversationId: conversation.id,
      role: 'agent',
      content: turn.reply,
      actions: turn.actions,
      metadata: { intent: turn.intent, confidence: turn.confidence },
      createdAt: nowIso(),
    };
    await this.deps.store.messages.put(outbound);
    bus.emit('message.outbound', {
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: conversation.channel,
      text: turn.reply,
    });

    const history = await this.history(conversation.id);
    const summary = buildSummary(history, conversation.summary);
    await this.deps.store.conversations.patch(conversation.id, {
      status: turn.escalated ? 'escalated' : conversation.status,
      intent: turn.intent,
      sentiment: turn.sentiment,
      summary,
      escalationReason: turn.escalated ? `intent=${intent.intent} confidence=${turn.confidence}` : undefined,
      updatedAt: nowIso(),
    });
    if (turn.escalated) {
      bus.emit('conversation.escalated', {
        tenantId: tenant.id,
        conversationId: conversation.id,
        reason: `intent=${intent.intent}`,
      });
    }
    await this.deps.store.customers.patch(customer.id, {
      updatedAt: nowIso(),
      tags: intent.intent === 'order_intent' && !customer.tags.includes('buyer') ? [...customer.tags, 'buyer'] : customer.tags,
    });
  }

  // ----------------------------------------------------------------- helpers

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.deps.store.tenants.get(tenantId);
    if (tenant) return tenant;
    const fallback = await this.defaultTenant();
    if (fallback) return fallback;
    throw new Error(`No tenant ${tenantId} and no default tenant configured`);
  }

  async defaultTenant(): Promise<Tenant | null> {
    const tenants = await this.deps.store.tenants.list({ limit: 1, orderBy: 'createdAt', order: 'asc' });
    return tenants[0] ?? null;
  }

  private async resolveCustomer(tenantId: string, input: InboundMessage): Promise<Customer> {
    const existing = await this.deps.store.customers.list({
      where: { tenantId, channel: input.channel, externalId: input.externalId },
      limit: 1,
    });
    if (existing[0]) {
      const customer = existing[0];
      if (input.name && input.name !== customer.name) {
        return (await this.deps.store.customers.patch(customer.id, { name: input.name, updatedAt: nowIso() })) ?? customer;
      }
      return customer;
    }
    const now = nowIso();
    const customer: Customer = {
      id: newId('cus'),
      tenantId,
      channel: input.channel,
      externalId: input.externalId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      locale: input.locale,
      tags: [],
      ltv: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    return this.deps.store.customers.put(customer);
  }

  private async resolveConversation(
    tenantId: string,
    customer: Customer,
    input: InboundMessage,
  ): Promise<Conversation> {
    const open = await this.deps.store.conversations.list({
      where: { tenantId, customerId: customer.id, status: 'open' },
      limit: 1,
      orderBy: 'createdAt',
      order: 'desc',
    });
    if (open[0]) return open[0];
    const now = nowIso();
    const conversation: Conversation = {
      id: newId('cnv'),
      tenantId,
      customerId: customer.id,
      channel: input.channel,
      status: 'open',
      subject: truncate(input.text, 80),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    return this.deps.store.conversations.put(conversation);
  }

  private async history(conversationId: string): Promise<Message[]> {
    const messages = await this.deps.store.messages.list({
      where: { conversationId },
      limit: 200,
      orderBy: 'createdAt',
      order: 'asc',
    });
    return messages;
  }

  private async openOrderFor(tenantId: string, customerId: string, conversationId: string): Promise<Order | null> {
    const drafts = await this.deps.store.orders.list({
      where: { tenantId, customerId, status: 'draft' },
      limit: 10,
      orderBy: 'createdAt',
      order: 'desc',
    });
    return drafts.find((order) => order.conversationId === conversationId) ?? null;
  }

  private async knowledgeFor(tenantId: string, query: string): Promise<Array<{ documentTitle: string; text: string; url?: string; score: number; documentId: string }>> {
    const documents = await this.deps.store.knowledge.list({ where: { tenantId }, limit: 200 });
    if (!documents.length) return [];
    return retrieve(documents, query, this.deps.embedder, 4);
  }

  private async findOrder(tenantId: string, reference: string): Promise<Order | null> {
    const byId = await this.deps.orders.get(tenantId, reference);
    if (byId) return byId;
    const matches = await this.deps.store.orders.list({ where: { tenantId, number: reference }, limit: 1 });
    return matches[0] ?? null;
  }

  private systemPrompt(
    tenant: Tenant,
    customer: Customer,
    products: Product[],
    knowledge: Array<{ documentTitle: string; text: string }>,
    order: Order | null,
  ): string {
    const currency = tenant.currency || this.deps.config.currency;
    const catalogue = products
      .slice(0, 25)
      .map((product) => `${product.sku} | ${product.name} | ${formatMoney(product.price, product.currency)}${product.description ? ` | ${truncate(product.description, 90)}` : ''}`)
      .join('\n');
    const facts = knowledge.length
      ? knowledge.map((chunk) => `- (${chunk.documentTitle}) ${chunk.text}`).join('\n')
      : '- (no knowledge base loaded yet)';

    return [
      `You are Duty, the always-on revenue agent for ${tenant.name}.`,
      tenant.about ? `About the business: ${tenant.about}` : '',
      `Tone: ${tenant.tone || 'friendly, concise, helpful'}. Currency: ${currency}.`,
      tenant.settings.goals?.length ? `Commercial goals: ${(tenant.settings.goals as string[]).join('; ')}` : '',
      '',
      'RULES',
      '- Answer in the customer\'s language.',
      '- Be brief: 1-3 short paragraphs, WhatsApp-friendly. No markdown headings.',
      '- Only state prices/policies you verified with a tool. Never invent them.',
      '- If the customer wants to buy, call create_order (or add_to_order), then confirm the order number and total.',
      '- If a relevant add-on exists, call offer_upsell once with a short, specific pitch.',
      '- Escalate refunds, legal, angry complaints and explicit human requests with escalate_to_human.',
      '- Never promise refunds, delivery dates or discounts that are not in the knowledge base.',
      '',
      `Customer: ${customer.name ?? 'unknown'} (channel ${customer.channel}, LTV ${formatMoney(customer.ltv, currency)}).`,
      customer.tags.length ? `Tags: ${customer.tags.join(', ')}` : '',
      order ? `Live cart: ${order.number}, ${order.lines.map((l) => `${l.quantity}x ${l.name}`).join(', ')} = ${formatMoney(order.total, order.currency)}` : 'No live cart.',
      '',
      'CATALOGUE (sku | name | price | description)',
      catalogue || '(empty)',
      '',
      'BUSINESS KNOWLEDGE (retrieved for this message)',
      facts,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

interface TurnContext {
  tenant: Tenant;
  customer: Customer;
  conversation: Conversation;
  input: InboundMessage;
  history: Message[];
  products: Product[];
  knowledge: Array<{ documentTitle: string; text: string; url?: string; score: number; documentId: string }>;
  intent: IntentSignal;
  openOrder: Order | null;
  lastOrder: Order | null;
}

interface ToolContext {
  tenant: Tenant;
  customer: Customer;
  conversation: Conversation;
  currentOrder: Order | null;
  products: Product[];
}

interface ToolOutcome {
  result: unknown;
  order?: Order;
  action?: AgentAction;
  escalate?: boolean;
  upsell?: UpsellRule & { product?: Product };
  confidence?: number;
}

function buildSummary(history: Message[], previous?: string): string {
  const lines = history.slice(-6).map((message) => `${message.role}: ${truncate(message.content, 160)}`);
  return truncate([previous, ...lines].filter(Boolean).join(' | '), 900);
}
