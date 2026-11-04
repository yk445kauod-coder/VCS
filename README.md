<div align="center">

# Duty

**An agentic revenue system for small businesses.**
It answers customers on WhatsApp, chat, webhooks and MCP, captures the order,
upsells it, closes it, and reports the money — on your own infrastructure.

</div>

---

## What it actually does

A customer messages your business. Duty:

1. **Understands** the message — intent, sentiment, which product they mean — in
   English and Arabic, with a deterministic brain that works with **no AI key at all**.
2. **Answers** using your catalogue, your policies and a business profile it learns
   from your website or your own files.
3. **Creates the order** in your database and estimates how likely it is to close.
4. **Upsells** it — every product can carry rules (bundle, cross-sell, upgrade,
   quantity, renewal, win-back) and Duty pitches the one with the highest expected value.
5. **Confirms and closes** it when the customer says yes, and hands to a human when
   the message is a refund, a complaint, or simply too uncertain.
6. **Recovers** abandoned carts on a schedule.
7. **Reports** revenue, funnel, upsell lift and pipeline — as numbers and as prose.
8. **Mirrors** every outbound message to your own webhook if you want it in Zapier,
   n8n or your CRM.

It is one process, one database, and a dashboard. No vendor lock-in: bring your own
database, your own AI key, your own server.

## The five things that make it different

| | |
| --- | --- |
| **Works with zero AI keys** | The deterministic brain classifies intent, quotes prices, opens orders and upsells on its own. Add an AI key and the same flows get smarter — they never *require* one. |
| **Bring your own everything** | `sqlite` (default), `postgres` (Neon, RDS), `supabase`, `firebase`, or `memory`. OpenAI, Anthropic, Gemini, OpenRouter, Ollama, or any OpenAI-compatible endpoint. |
| **Channels are uniform** | WhatsApp, web chat widget, generic webhook, email and MCP all reduce to one `InboundMessage`. Adding a channel does not touch the agent. |
| **Revenue is the point** | Orders, upsell rules, purchase probability, abandoned-cart recovery and a daily brief. Not a chatbot — a system that closes. |
| **Self-hostable in one command** | `docker run` or `npm start`. Data never leaves your infrastructure unless you point it somewhere. |

## Quick start

```bash
git clone https://github.com/yk445kauod-coder/VCS.git duty && cd duty
npm install
cp .env.example .env          # set ADMIN_TOKEN to something real
npm run seed                  # a demo business, catalogue, knowledge and orders
npm run build                 # build the dashboard
npm start                     # http://localhost:8787/?token=<ADMIN_TOKEN>
```

That is a working system with a demo coffee roaster: five products with upsell
rules, three knowledge documents, customers, conversations, paid orders, and a
revenue report. Talk to the live agent from the **Playground** tab.

### Send it a message

```bash
curl -X POST http://localhost:8787/webhooks/inbound \
  -H 'content-type: application/json' \
  -d '{"channel":"whatsapp","externalId":"+15550001111","text":"I want to order the Ethiopia Yirgacheffe beans"}'
```

```jsonc
{
  "intent": "order_intent",
  "reply": "Great choice — Ethiopia Yirgacheffe 250g is $18.00. I've started an order for you. Reply *confirm* and I'll finalise it…\n\n💡 Subscribe and save 15% every month?",
  "orderIds": ["ord_..."],
  "actions": [
    { "kind": "create_order", "label": "Created draft order DTY-20261103-2DB9 for Ethiopia Yirgacheffe 250g" },
    { "kind": "offer_upsell", "label": "Offered Monthly Subscription (upgrade)" }
  ]
}
```

Reply `confirm` and the order moves to `pending`. Reply `yes` and the upsell is
added to the same order.

## Architecture

```
                     ┌──────────────────────────────────────────────┐
 WhatsApp ──┐        │                  Duty                        │
 Web widget ┼────────▶  channels ─▶ agent (tools) ─▶ commerce       │
 Webhook  ──┤        │      │            │              │            │
 Email    ──┤        │      │            ▼              ▼            │
 MCP      ──┘        │      │        knowledge       orders/upsell   │
                     │      │        + embeddings    + analytics     │
                     │      ▼                                        │
                     │   storage adapter (sqlite/postgres/supabase/  │
                     │                    firebase/memory)           │
                     └───────────────────┬──────────────────────────┘
                                         ▼
                          dashboard · REST API · SSE · reports
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Bring your own infrastructure

Everything is configuration. Nothing is hard-coded.

```bash
# Your database
DUTY_DB=postgres
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/duty

# Or Supabase, Firebase, or a local file
DUTY_DB=supabase      # + SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
DUTY_DB=firebase      # + FIREBASE_DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON
DUTY_DB=sqlite        # + SQLITE_PATH (the default)

# Your model
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5

# Or run fully offline
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
```

Duty reads these at boot and picks the matching adapter. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Dashboard

Ten screens, one design language: a warm graphite "revenue ledger" with an ember
accent, editorial display type and tabular data.

- **Overview** — revenue, pipeline, upsell lift, conversion, what needs a human
- **Analytics** — funnel, 30-day report generation, emailable daily brief
- **Orders** — every cart with its win probability and upsell outcome
- **Conversations** — full transcripts, live updates, reply as a human
- **Customers** — lifetime value, tags, per-customer order history
- **Catalogue** — products and the upsell rules attached to each
- **Automations** — cart recovery and the daily brief, run on demand
- **Knowledge** — crawl a website, upload files, paste policies and FAQs
- **Playground** — talk to the live agent and watch its decisions
- **Settings** — business profile, runtime, webhooks, widget, MCP

## Channels

| Channel | How |
| --- | --- |
| **WhatsApp** | Point the Meta Cloud API webhook at `POST /webhooks/whatsapp` (verification handled). Any bridge that posts the same shape works. |
| **Web chat** | Add one line to any site: `<script src="https://your-duty/widget/duty-widget.js" async></script>` |
| **Webhook** | `POST /webhooks/inbound` with an optional HMAC signature. Use it for anything. |
| **Email** | Set `SMTP_URL`; replies go back out on the same thread. |
| **MCP** | `node --import tsx src/mcp/stdio.ts` — Claude Desktop, Cursor or any MCP client can read the catalogue, create orders and generate reports. |
| **REST** | The whole dashboard is built on the public API; see `/api/*` in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). |

## Automations

`plugins/duty-revenue-ops` is an [OpenHands automation](https://docs.openhands.dev)
plugin that runs the money-making jobs on a cron — abandoned-cart recovery and the
daily revenue brief. It is **deterministic**: two HTTP calls, no LLM, so hourly
runs cost nothing but compute.

```bash
curl -X POST "${OPENHANDS_HOST}/api/automation/v1/plugin-spec" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Duty revenue ops",
    "plugin": { "source": "github:yk445kauod-coder/VCS", "repo_path": "plugins/duty-revenue-ops" },
    "config": { "duty_url": "https://duty.your-company.com", "mode": "both" }
  }'
```

## Testing

```bash
npm test        # 34 tests: storage, intents (EN + AR), agent flows, upsell, analytics
npm run typecheck
```

The suite exercises real code paths — real stores, real services, real agent turns —
with no mocks.

## Project layout

```
src/
  core/         config, types, ids, logger, errors, money, event bus
  storage/      Store contract + sqlite · postgres · supabase · firebase · memory
  ai/           providers, embeddings, knowledge, deterministic brain, agent loop
  commerce/     catalog, orders, upsell engine, analytics, follow-ups
  channels/     whatsapp · webchat · webhook · email + registry
  integrations/ website/file ingestion ("learn the business")
  mcp/          MCP server (stdio)
  server/       Fastify app, runtime wiring, routes, seed script
web/            React + Vite dashboard
plugins/        OpenHands automation plugin
test/           node:test suites
```

## License

MIT.
