# AGENTS.md

Instructions for any agent working in this repository.

## What this is

**Duty** — an agentic revenue system. Customers arrive over WhatsApp, a web widget,
a generic webhook, email or MCP; Duty answers them, captures the order, upsells it,
closes it, recovers abandoned carts, and reports the money. It is self-hosted, BYOK,
and bring-your-own-database.

The repository was previously an unrelated Next.js project. Its files were removed;
ignore any historical references you may find in old commits.

## Commands

```bash
npm install
npm run typecheck      # tsc --noEmit — must pass before you commit
npm test               # node:test, 34 tests
npm run build          # vite build → web-dist (served by the API)
npm run dev            # API + dashboard with HMR
npm start              # production API + dashboard
npm run seed           # demo tenant: catalogue, knowledge, customers, orders
```

`npm test` and `npm run typecheck` must both pass. Do not commit if either fails.

## Non-negotiable conventions

**Money is in minor units.** Every price, total and metric is an integer number of
cents. Format only at the edge, with `formatMoney` (`src/core/money.ts`) or `money`
(`web/src/lib/format.ts`). Never introduce a float into a domain type.

**Storage goes through `Store`.** Never reach into a database client from a service.
Add a method to `Repository<T>` and implement it in *every* adapter
(`memory`, `sqlite`, `postgres`, `supabase`, `firebase`) plus the shared semantics in
`filter.ts`.

> ⚠️ **Adapter invariant.** A SQL `LIMIT` may only be pushed into the query when
> every `where` key was also pushed down. If any key is applied afterwards in
> JavaScript, the SQL window must stay wide (`1000`) and `offset` must be `0`,
> otherwise rows are silently dropped. See the `hasResidual` guards in
> `src/storage/sqlite.ts`, `postgres.ts` and `supabase.ts`. There is a regression
> test for this in `test/storage.test.ts`.

**Everything is tenant-scoped.** Every query filters on `tenantId`. Never trust a
tenant id from a request body — go through `resolveTenantId()` in
`src/server/routes/admin.ts`.

**Orders are priced from the catalogue.** `OrderService.create` looks up each SKU
and uses the catalogue price. Never accept a price from a caller.

**The system must work with no AI key.** `src/ai/local-brain.ts` is the deterministic
fallback and must keep handling the full purchase flow: greeting, price enquiry,
order intent, confirmation, upsell accept/decline, order status, escalation. When you
add an intent, add it in `classify()`, handle it in `draft()`, and cover it in
`test/intent.test.ts`.

**Arabic needs different regexes.** JavaScript `\b` is defined against ASCII `\w`, so
a pattern like `/\b(نعم)\b/` **never matches**. Put Arabic alternatives in a
boundary-free group: `/(نعم|تمام)/u`. There is a test for this — keep it passing.

**ESM with `.js` extensions.** The project is `"type": "module"` and compiled with
`tsx`. Import local files with an explicit `.js` suffix
(`import { Store } from '../storage/index.js'`).

**No `require()`.** ESM only. Use top-level imports.

## Layout

```
src/core          types, config, ids, logger, errors, money, events
src/storage       Store contract + 5 adapters
src/ai            providers, embeddings, knowledge, local-brain, agent
src/commerce      catalog, orders, upsell, analytics, followups
src/channels      whatsapp, webchat, webhook, email, registry
src/integrations  website/file ingestion
src/mcp           MCP server (stdio)
src/server        runtime, fastify app, routes, seed script
web/src           React dashboard (views/, components/, lib/)
plugins/          OpenHands automation plugins
test/             node:test suites
```

Dependencies point downward: `core` → `storage` → `ai`/`commerce`/`channels` →
`server`. Nothing in `core` may import from `server`.

## Adding things

**A channel** — implement the `Channel` interface in `src/channels/`, register it in
`registry.ts`, reduce the payload to an `InboundMessage`, and call
`agent.handleInbound()`. Do not add channel-specific logic to the agent.

**An upsell strategy** — add it to `UpsellStrategy` in `src/core/types.ts`, give it a
base probability in `STRATEGY_BASE` (`src/commerce/upsell.ts`) and a reason in
`explain()`. Add a case to `test/upsell.test.ts`.

**A storage adapter** — implement `Store`, reuse `filter.ts` for `where`/`search`
semantics, respect the `LIMIT` invariant above, and add the new kind to
`DbKind` and `createStore()`.

**A dashboard view** — add it to `NAV` and `TITLES` in `web/src/App.tsx`, build it
from the primitives in `web/src/components/ui.tsx`, and use the design tokens in
`web/src/styles.css`. Do not hard-code colours or fonts; add a token.

**An automation** — put it under `plugins/<name>/` with a `.plugin/plugin.json`
manifest. Prefer `entrypoint.runner: "script"` for deterministic work; only use an
LLM-driven runner when the task genuinely needs judgement.

## Style

- TypeScript strict. No `any` in new code — use `unknown` and narrow.
- Keep comments for non-obvious invariants and trade-offs. Do not narrate the code
  or the change history.
- Functions do one thing; if a service file passes ~400 lines, split it.
- Errors: throw the helpers in `src/core/errors.ts` (`badRequest`, `notFound`,
  `unauthorized`); the Fastify error handler turns them into the API envelope.
- Prefer composition over configuration flags threaded through many layers.

## Testing

`node:test` via `tsx`, run with `npm test`. Tests use **real** stores and services —
`MemoryStore` or a temporary `SqliteStore` — not mocks. A test that only asserts a
mock was called is not acceptable. Cover the behaviour a customer would notice.
