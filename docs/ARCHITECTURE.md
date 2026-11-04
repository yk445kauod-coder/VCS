# Architecture

Duty is deliberately small in its number of moving parts and strict about the
direction of dependencies. This document explains the shape and why it is that way.

## Design principles

1. **One process, one database.** No queue, no worker fleet, no microservices.
   A shop owner can run this on a cheap VPS and understand it.
2. **Ports, not vendors.** Storage, AI and channels are interfaces with swappable
   adapters. Nothing outside `src/storage/*` knows whether the data lives in SQLite
   or Postgres.
3. **Degrade, never fail.** No AI key? The deterministic brain handles the full
   purchase flow. No SMTP? The report is generated and returned instead of mailed.
   No Postgres? SQLite is the default.
4. **Revenue is a first-class concept.** `Order`, `UpsellRule` and
   `purchaseProbability` are domain types, not prompt strings.
5. **Untrusted input is data, never instructions.** Customer text reaches the agent
   as data. Tools are an explicit allow-list; nothing is shelled out.

## Layers

Dependencies point downward. Nothing in `core` imports from `server`.

```
core          types · config · ids · logger · errors · money · events
  ▲
storage       Store contract + adapters
  ▲
ai            providers · embeddings · knowledge · local-brain · agent
commerce      catalog · orders · upsell · analytics · followups
channels      whatsapp · webchat · webhook · email · registry
integrations  website + file ingestion
  ▲
server        runtime wiring · fastify app · routes · seed
```

### `core`

The vocabulary. `types.ts` defines `Tenant`, `Customer`, `Conversation`, `Message`,
`Product`, `Order`, `UpsellRule`, `KnowledgeDocument`, `Report`. `money.ts` keeps
every amount in **minor units** (cents) so no rounding error can reach a customer.
`events.ts` is a typed event bus that decouples channels from commerce from analytics:

```ts
bus.emit('upsell.accepted', { tenantId, orderId, sku, revenue });
```

### `storage`

One contract, five adapters:

```ts
interface Repository<T> {
  get(id): Promise<T | null>;
  list(filter?): Promise<T[]>;
  count(filter?): Promise<number>;
  put(entity): Promise<T>;
  patch(id, partial): Promise<T | null>;
  delete(id): Promise<boolean>;
}
```

`filter.ts` holds the semantics — equality `where`, substring `search`, ordering,
limits — and every adapter must satisfy them identically. Adapters that can push a
filter into the database do so and apply the rest in JavaScript. **The critical
invariant:** a SQL `LIMIT` may only be applied when *every* `where` key was pushed
down. Otherwise rows are truncated before the residual filter runs, and a query for
one product returns nothing. This is enforced in `sqlite.ts`, `postgres.ts` and
`supabase.ts` and is covered by a regression test.

The `sqlite` adapter uses Node's built-in `node:sqlite`, so the default deployment
has **zero native dependencies**.

### `ai`

- `provider.ts` — one `LLMProvider` interface over OpenAI-compatible chat
  completions. OpenAI, Anthropic, Gemini, OpenRouter, Ollama and any custom base URL
  all reduce to the same call.
- `embeddings.ts` — a `hashEmbedder` that needs no network, and real embedding
  providers when a key exists.
- `knowledge.ts` — chunking, embedding, cosine-similarity retrieval.
- `local-brain.ts` — **the deterministic core.** `classify()` scores intent patterns
  and sentiment; `draft()` turns a classified intent plus catalogue and knowledge into
  a reply. This is what makes Duty work with no API key.
- `agent.ts` — the orchestrator. `handleInbound()` is the single entry point for every
  channel:

  ```
  resolve tenant → resolve customer → resolve conversation
    → persist inbound → load history/products/knowledge
    → classify → run LLM turn (tools) or local turn
    → execute actions (create order, add upsell, escalate)
    → persist outbound → emit events → return turn
  ```

  The LLM path exposes tools (`search_catalog`, `search_knowledge`, `create_order`,
  `add_upsell`, `escalate`, …) and the same actions are produced deterministically
  when no provider is configured.

### `commerce`

- `catalog.ts` — products, SKU generation, CSV import, upsell rules per product.
- `orders.ts` — orders are **always priced from the catalogue**, never from caller
  input. `estimatePurchaseProbability()` is an explainable weighted model over intent
  confidence, intent type, conversation length, customer LTV, product match and
  sentiment.
- `upsell.ts` — evaluates every rule, skips inactive rules, items already in the cart,
  subtotal gates and out-of-stock targets, then ranks by expected revenue
  (`price × probability`).
- `analytics.ts` — revenue, AOV, conversion, pipeline value, upsell lift, per-channel
  breakdown, top products, and a written narrative with one recommended next action.
- `followups.ts` — abandoned-cart recovery: finds idle drafts above a probability
  threshold and emits an outbound message with the best add-on attached.

### `channels`

Every channel reduces to one type:

```ts
interface InboundMessage {
  tenantId: string;
  channel: 'whatsapp' | 'webchat' | 'webhook' | 'email' | 'mcp' | 'api';
  externalId: string;
  text: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}
```

`registry.ts` decides which channel can deliver a given outbound message, so a human
replying from the dashboard goes out on the same channel the customer used.

## HTTP surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, storage kind, AI provider, channel status |
| `GET` | `/api/overview` | Dashboard headline metrics |
| `GET`/`POST`/`PATCH` | `/api/tenants` | Tenants |
| `GET` | `/api/conversations`, `/api/conversations/:id` | Threads and transcripts |
| `POST` | `/api/conversations/:id/reply`, `/status` | Human takeover |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/products` | Catalogue |
| `POST` | `/api/products/import` | CSV import |
| `GET`/`POST` | `/api/orders`, `/api/orders/:id/status`, `/items`, `/upsell` | Orders |
| `GET`/`POST`/`DELETE` | `/api/knowledge`, `/text`, `/website`, `/faq`, `/upload` | Learn the business |
| `GET`/`POST` | `/api/reports`, `/api/reports/generate` | Reports |
| `POST` | `/api/agent/message` | Playground |
| `POST` | `/api/automation/followups`, `/daily-report` | Scheduled revenue ops |
| `GET`/`PATCH` | `/api/settings` | Business profile + runtime |
| `GET` | `/api/events` | Server-sent events for the live dashboard |
| `GET`/`POST` | `/webhooks/whatsapp` | Meta Cloud API (verification + messages) |
| `POST` | `/webhooks/inbound` | Generic inbound with optional HMAC |
| `GET` | `/api/public/config`, `/catalog` | Public widget bootstrap |
| `POST` | `/api/webchat/session`, `/message` | Embeddable widget |

Auth: `x-admin-token` header (or `?token=`) matching `ADMIN_TOKEN`. Public routes are
namespaced under `/api/public/*` and `/api/webchat/*`.

## Multi-tenancy

Every row carries `tenantId`, and every repository call filters on it. The service
layer never trusts a caller-supplied tenant: `resolveTenantId()` falls back to the
single existing tenant when none is given, so a single-shop deployment needs no
tenant management at all while a multi-shop one is isolated by construction.

## The dashboard

React + Vite, served by the same Fastify process from `web-dist`. It talks to the
REST API with the admin token and subscribes to `/api/events` (SSE) so conversations
and orders update live. Design tokens live in `web/src/styles.css`; the whole product
can be re-skinned by editing one `:root` block.
