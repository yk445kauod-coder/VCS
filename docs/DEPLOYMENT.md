# Deployment

Duty is a single Node.js process plus a static dashboard. There is no queue, no
worker, and no managed service it depends on.

## Requirements

- Node.js **20.10+** (24 recommended — the SQLite adapter uses built-in `node:sqlite`)
- ~150 MB disk, ~100 MB memory at idle

## Local / single VPS

```bash
npm ci --omit=dev          # or: npm install
cp .env.example .env       # set ADMIN_TOKEN
npm run build              # builds web-dist
npm start
```

Run it under a supervisor:

```ini
# /etc/systemd/system/duty.service
[Unit]
Description=Duty
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/duty
EnvironmentFile=/opt/duty/.env
ExecStart=/usr/bin/node --import tsx src/server/index.ts
Restart=always
User=duty

[Install]
WantedBy=multi-user.target
```

Put Nginx or Caddy in front for TLS. Set `PUBLIC_URL` to the public origin — Duty
uses it for the WhatsApp webhook URL, the widget snippet and absolute links.

## Cloudflare + Neon (managed, production)

This is the fully-managed path: Neon for Postgres, Cloudflare for the edge and
TLS. No server to patch, and the free tiers are enough to run a real shop.

**What runs where**

| Piece | Where | Why |
| --- | --- | --- |
| Duty app (API, agent, channels) | Any container host — Fly, Render, Railway, a VPS, Docker | It is a long-lived Node server: it opens a Postgres pool, keeps an event stream, and receives webhooks |
| Dashboard + public catalogue | Same process, or Cloudflare cache | The edge caches the catalogue and widget |
| Database | Neon Postgres | Serverless, branches, point-in-time restore |
| TLS, hostname, rate limiting, security headers | Cloudflare Worker | Cheap, global, no origin exposed |

**Cloudflare Workers cannot host the app itself.** A Worker is V8 isolates, not
Node: no `node:sqlite`, no long-lived TCP to Postgres, 128 MB memory and a CPU
limit per request. Duty is a server, so it runs on a host and Cloudflare fronts
it. (Workers *can* reach Neon through `@neondatabase/serverless` over HTTP, which
is the right move if you later want the public catalogue served entirely at the
edge — but the agent, channels and webhooks still need the server.)

### 1. Provision Neon

```bash
NEON_API_KEY=napi_xxx NEON_PROJECT_ID=your-project \
  npx tsx scripts/provision-neon.mjs
```

Idempotent: creates the database if missing, applies the schema through the real
`PostgresStore`, prints row counts, and reports the `DATABASE_URL` to set. Add
`NEON_SEED=1` to seed the demo tenant. It needs `tsx` because it imports the
TypeScript adapter directly.

Then set on your app host:

```bash
DUTY_DB=postgres
DATABASE_URL=postgresql://…@ep-….neon.tech/duty?sslmode=require
ADMIN_TOKEN=<a long random string>
SESSION_SECRET=<another long random string>
PUBLIC_URL=https://duty.yourdomain.com
```

The adapter enables TLS automatically for `neon.tech` and `supabase.co` hosts.
Use the **pooled** connection string (the `-pooler` host) on serverless hosts so
short-lived instances do not exhaust Neon's connection limit.

### 2. Deploy the edge

```bash
cd deploy/cloudflare
# set ORIGIN in wrangler.toml to your app host
npx wrangler deploy
```

That publishes `https://<worker>.<subdomain>.workers.dev`. Point a custom domain
at it under Workers → your worker → Settings → Domains & Routes.

The worker adds security headers, caches `/api/public/*` and the widget at the
edge, rate-limits the unauthenticated `POST` endpoints (`/webhooks/*`,
`/api/public/chat`) at 60 requests/minute per IP per colo, and serves an
explanatory status page if the origin is down instead of a bare 502.

### 3. Verify

```bash
curl https://duty.yourdomain.com/api/health          # {"status":"ok","store":{"kind":"postgres"}}
curl -X POST https://duty.yourdomain.com/webhooks/inbound \
  -H 'content-type: application/json' \
  -d '{"channel":"whatsapp","externalId":"+1555…","text":"How much is the grinder?"}'
```

A correct reply means the whole path works: edge → app → Neon → agent → back.

### Notes and limits

- **Edge rate limiting is per-colo and in-memory.** The counter lives in the
  Cache API, so the real limit is 60 × number-of-colos and it resets on eviction.
  Fine for abuse control; move it to a Durable Object or KV if you need a global
  limit.
- **The worker fails open.** If the counter errors, requests pass through rather
  than 5xx — a broken limiter must not take down the shop.
- **R2 is not required.** It is off on this account; Duty stores documents in the
  database and needs no object storage. Turn R2 on later if you want to keep
  large ingested files (PDFs, product images) out of Postgres.
- **Back up Neon** with its point-in-time restore, or `pg_dump` on a schedule.

## Docker

```bash
docker build -t duty .
docker run -d --name duty -p 8787:8787 \
  -v duty-data:/app/data \
  --env-file .env duty
```

SQLite data lives in `/app/data`, so the volume keeps it across upgrades.

## Database choices

| `DUTY_DB` | Extra variables | Notes |
| --- | --- | --- |
| `sqlite` *(default)* | `SQLITE_PATH` | Zero dependencies, file-backed, perfect up to a busy single shop |
| `postgres` | `DATABASE_URL` | Neon, Supabase Postgres, RDS, Railway, self-hosted |
| `supabase` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Uses PostgREST with the service-role key |
| `firebase` | `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Realtime Database |
| `memory` | — | Tests and ephemeral demos; everything is lost on restart |

To move between them, point `DUTY_DB` at the new backend and re-run your import
(`POST /api/products/import` for the catalogue; the rest is operational data).

## AI providers

| `AI_PROVIDER` | `AI_BASE_URL` default | Notes |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | `AI_API_KEY` required |
| `anthropic` | `https://api.anthropic.com/v1` | Messages API |
| `gemini` | Google Generative Language API | |
| `openrouter` | `https://openrouter.ai/api/v1` | Any model behind one key |
| `ollama` | `http://localhost:11434/v1` | Fully local, no key |
| `custom` | `AI_BASE_URL` | vLLM, LM Studio, Azure, a proxy |

**Duty runs without any of this.** With no `AI_API_KEY` it logs a warning and uses
the deterministic brain, which still classifies intent, quotes the catalogue, opens
orders, offers upsells and escalates. Add a key and the same flows gain reasoning.

`EMBEDDINGS_PROVIDER=auto|openai|gemini|hash` controls retrieval; `hash` needs no
network and is the fallback.

## Channels

### WhatsApp (Meta Cloud API)

1. Create a Meta app with the WhatsApp product and get a permanent token.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.
3. Set the callback URL to `https://your-domain/webhooks/whatsapp` and subscribe to
   `messages`. Duty answers the `hub.challenge` verification automatically.
4. Set `WHATSAPP_WEBHOOK_SECRET` to the app secret to enforce HMAC verification —
   leave it empty only if a gateway in front already authenticates callers.

Other gateways (Twilio, 360dialog, a Baileys bridge) can post the same envelope, or
use the generic webhook.

### Web chat widget

```html
<script src="https://your-domain/widget/duty-widget.js" data-greeting="Hi!" async></script>
```

### Generic webhook

```bash
curl -X POST https://your-domain/webhooks/inbound \
  -H 'content-type: application/json' \
  -H 'x-duty-signature: <hmac-sha256-hex-of-body>' \
  -d '{"channel":"webhook","externalId":"crm-42","text":"Do you ship to Spain?","name":"Ana"}'
```

Set `INBOUND_WEBHOOK_SECRET` to require the signature.

### Email

Set `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) and `EMAIL_FROM`.
Outbound messages on the `email` channel are then delivered; inbound requires your
provider to POST parsed mail to `/webhooks/inbound` with `channel: "email"`.

## Automations

`plugins/duty-revenue-ops` runs cart recovery and the daily brief on a cron via
[OpenHands automations](https://docs.openhands.dev). Store the Duty admin token as a
secret, then create the automation from the plugin manifest:

```bash
curl -X PUT "${OPENHANDS_HOST}/api/settings/secrets/DUTY_ADMIN_TOKEN" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" -d '{"value":"<ADMIN_TOKEN>"}'

curl -X POST "${OPENHANDS_HOST}/api/automation/v1/plugin-spec" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Duty revenue ops",
    "plugin": { "source": "github:yk445kauod-coder/VCS", "repo_path": "plugins/duty-revenue-ops" },
    "config": { "duty_url": "https://duty.your-company.com", "mode": "both" }
  }'
```

The manifest suggests hourly. It is deterministic — no LLM, so a run costs only a
little compute.

## Security checklist

- [ ] `ADMIN_TOKEN` is long, random and **not** the default
- [ ] `SESSION_SECRET` is set to a random value
- [ ] `WHATSAPP_WEBHOOK_SECRET` and/or `INBOUND_WEBHOOK_SECRET` set if the endpoints are public
- [ ] `CORS_ORIGIN` narrowed from `*` to your dashboard origin in production
- [ ] TLS terminated in front (Nginx, Caddy, or your platform's ingress)
- [ ] Database credentials scoped to a single database, not an account-wide key
- [ ] Backups scheduled for whichever database you chose

## Backups

- **SQLite** — back up the file in `SQLITE_PATH` (or snapshot the `/app/data` volume).
- **Postgres / Supabase** — use the provider's PITR or `pg_dump`.
- **Firebase** — enable automated backups on the Realtime Database.
