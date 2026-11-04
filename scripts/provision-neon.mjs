#!/usr/bin/env node
/**
 * Provision a Neon database for Duty.
 *
 *   NEON_API_KEY=napi_xxx NEON_PROJECT_ID=xxx npx tsx scripts/provision-neon.mjs
 *
 * Needs tsx because it imports the TypeScript storage adapter directly (Node's
 * built-in type stripping rejects parameter properties, which the adapters use).
 *
 * Idempotent: creates the database only if it is missing, then applies the schema
 * by initialising the real PostgresStore, and optionally seeds the demo tenant.
 *
 * Env:
 *   NEON_API_KEY      required — Neon API key
 *   NEON_PROJECT_ID   required — target project
 *   NEON_DATABASE     default "duty"
 *   NEON_ROLE         default the project's default role
 *   NEON_SEED         "1" to seed the demo tenant after provisioning
 *   DATABASE_URL      if set, skips the API and provisions against this URL directly
 */
import pg from 'pg';

const api = 'https://console.neon.tech/api/v2';
const key = process.env.NEON_API_KEY;
const projectId = process.env.NEON_PROJECT_ID;
const database = process.env.NEON_DATABASE ?? 'duty';
const seed = process.env.NEON_SEED === '1';

async function neon(path, init) {
  const res = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Neon ${path} failed (${res.status}): ${body?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

function requireEnv() {
  const missing = ['NEON_API_KEY', 'NEON_PROJECT_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    console.error('Set them, or pass DATABASE_URL to provision against an existing database.');
    process.exit(1);
  }
}

async function resolveConnectionString() {
  if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL from the environment.');
    return process.env.DATABASE_URL;
  }
  requireEnv();

  const project = await neon(`/projects/${projectId}`);
  const role = process.env.NEON_ROLE ?? project.roles?.[0]?.name;
  if (!role) throw new Error('Could not determine a Neon role for the project.');

  const existing = await neon(`/projects/${projectId}/databases`);
  const names = (existing.databases ?? []).map((d) => d.name);
  if (names.includes(database)) {
    console.log(`Database "${database}" already exists.`);
  } else {
    await neon(`/projects/${projectId}/databases`, {
      method: 'POST',
      body: JSON.stringify({ database: { name: database, owner_name: role } }),
    });
    console.log(`Created database "${database}".`);
  }

  const { uri } = await neon(
    `/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(database)}&role_name=${encodeURIComponent(role)}`,
  );
  // pg v8 treats sslmode=require as verify-full and rejects Neon's chain; the
  // adapter already enables TLS for neon.tech hosts, so normalise the mode here.
  return uri.replace('channel_binding=require&', '').replace('sslmode=require', 'sslmode=no-verify');
}

const url = await resolveConnectionString();
const target = url.replace(/:\/\/[^@]*@/, '://***@');
console.log(`Target: ${target}`);

// Initialise the schema through the real adapter, so the schema matches what the
// app creates at boot rather than a hand-maintained copy.
process.env.DUTY_DB = 'postgres';
process.env.DATABASE_URL = url;
const { postgresStore } = await import('../src/storage/postgres.ts');
const store = postgresStore(url);
await store.init();
const health = await store.health();
if (!health.ok) {
  console.error(`Schema applied but health check failed: ${health.detail}`);
  process.exit(1);
}
console.log('Schema applied. Connection healthy.');

const counts = {};
for (const table of ['tenants', 'products', 'orders', 'knowledge']) {
  counts[table] = await store[table].count();
}
console.log('Row counts:', counts);
await store.close();

if (seed) {
  console.log('Seeding the demo tenant…');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npx', ['tsx', 'src/server/scripts/seed.ts'], {
    stdio: 'inherit',
    env: { ...process.env, DUTY_DB: 'postgres', DATABASE_URL: url },
  });
  process.exit(result.status ?? 1);
}

console.log('\nDone. Set these on your host:');
console.log(`  DUTY_DB=postgres`);
console.log(`  DATABASE_URL=${target}`);
