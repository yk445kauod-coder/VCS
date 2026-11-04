# Project memory — Duty (`/workspace/project/VCS`)

**Duty** is an agentic revenue system: customers arrive on WhatsApp / web widget /
webhook / email / MCP; Duty answers, opens an order, upsells, closes, recovers carts
and reports revenue. Self-hosted, BYOK, bring-your-own-DB. Rebuilt from an unrelated
Next.js repo in commit `20461bb` (see `2026-11-04.md`).

## Commands
- `npm test` — `node --import tsx --test 'test/**/*.test.ts'` (50 tests). **The glob is
  required**; passing the `test/` directory throws `ERR_UNSUPPORTED_DIR_IMPORT`.
- `npm run typecheck` · `npm run build:web` · `npm run seed` · `npm start`
- App listens on **:8787**, exposed externally as **:12000**.

## Non-obvious invariants (violating these breaks things silently)
- **`count()` must never delegate to `list()`.** `list()` windows its SQL at 1000
  rows on purpose (so residual filters can run in JS). `count()` inheriting that
  window made every analytics figure freeze at 1000 with no error. Count in SQL
  when the filter is fully pushed down. Fixed in postgres/sqlite/supabase; memory
  and firebase read the whole set and were already correct.
- **An LLM outage must not stop a sale.** `runTurn()` degrades to the deterministic
  brain on any provider error. Rate limits and quota exhaustion are routine; before
  the fix a 429 became a 5xx with no reply and no order. Partial LLM work is
  preserved so a mid-turn failure does not duplicate an order.
- **Money is minor units** (cents) everywhere; format only at the edge.
- **Arabic + `\b` never matches.** JS `\b` is ASCII-only. Use boundary-free groups:
  `/(نعم|تمام)/u`. This has been "fixed" wrongly once already — always assert a patch
  actually landed instead of assuming.
- **SQL `LIMIT` only when every `where` key was pushed down.** Otherwise the row is
  truncated before the residual JS filter and lookups return nothing. Guarded by
  `hasResidual` in sqlite/postgres/supabase.
- **Orders are always priced from the catalogue**, never from caller input.
- **Everything is tenant-scoped**; never trust a tenant id from a request body.
- **The system must work with no AI key** — `src/ai/local-brain.ts` runs the full
  purchase flow. New intents need: `classify()`, `draft()`, and a test.
- **`pickProduct` matches via `aliases`** (synonyms + other languages), so the
  catalogue does not need translating.
- **Upsell engine uses the `cartProducts` it is given** — it does not re-fetch.
- **Any URL a tenant supplies must go through `src/core/net.ts`.** `fetchPublicHttp`
  re-validates every redirect hop; plain `fetch` follows redirects into the private
  network. Guard is tested against parser-canonicalised IPv6, not the human form.
- **Admin token is header-only** except `/api/events` (EventSource cannot set headers).
- **Public agent endpoints are rate-limited** in `src/core/rate-limit.ts` — the limiter
  is per-process, so a multi-instance deploy needs it at the ingress instead.

## Layout
`src/core` → `src/storage` (5 adapters) → `src/ai` · `src/commerce` · `src/channels`
· `src/integrations` → `src/server`. Dependencies point downward only.
Dashboard in `web/` builds to `web-dist/`, served by the API process.
Automation plugin: `plugins/duty-revenue-ops` (deterministic `script` runner, no LLM).

## Restarting the dev server
Always `pkill -f "tsx src/server/index.ts"` before restarting. A stale process serves
the old hashed asset against a freshly built `index.html` and the dashboard renders
blank with a ~660-byte asset response. Reset demo data with
`rm -f data/duty.sqlite* && npm run seed` — there is no tenant DELETE route.

## Production deployment (Cloudflare + Neon)
- **Live:** app `https://duty.yk445kauod.workers.dev` (Cloudflare Worker) → origin
  (this sandbox, `:12000`, `PUBLIC_URL` set to the worker host) → **Neon Postgres**
  (`duty` db on project `IGNIS`, `solitary-water-80875290`, us-east-1).
- Deploy the edge with `cd deploy/cloudflare && npx wrangler deploy`.
- Provision Neon with `NEON_API_KEY=… NEON_PROJECT_ID=… npx tsx scripts/provision-neon.mjs`
  (needs `tsx`: Node's type stripping rejects the adapters' parameter properties).
- **Cloudflare Workers cannot host this app.** V8 isolates, not Node: no
  `node:sqlite`, no long-lived TCP to Postgres, 128 MB, per-request CPU cap. Duty is
  a server → it runs on a host and Cloudflare fronts it.
- **R2 is disabled on this account** (API 10042; the S3 endpoint fails TLS). Duty
  needs no object storage, so this blocks nothing.
- **Cloudflare Containers need a paid Workers plan** (API 401 on this account).
- The edge worker fails open on rate-limit errors, and adds no CORS policy — the app
  owns CORS and two policies on one response is a debugging trap.
