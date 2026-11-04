import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteStore } from './src/storage/sqlite.js';
import { MemoryStore } from './src/storage/memory.js';
import type { Store } from './src/storage/types.js';

const prod = (id: string, tenantId: string, sku: string, name: string, createdAt: string, updatedAt: string) => ({
  id,
  tenantId,
  sku,
  name,
  price: 1000,
  currency: 'USD',
  tags: [],
  aliases: [],
  upsells: [],
  active: true,
  metadata: {},
  createdAt,
  updatedAt,
});

async function seed(store: Store) {
  // 3 products: the one we search for is the OLDEST (lowest createdAt),
  // so a created_at DESC LIMIT will never include it.
  await store.products.put(prod('old', 't1', 'AAA', 'Alpha beans', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z') as never);
  await store.products.put(prod('mid', 't1', 'BBB', 'Beta grinder', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z') as never);
  await store.products.put(prod('new', 't1', 'CCC', 'Gamma kettle', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z') as never);
}

async function run(label: string, store: Store) {
  await store.init();
  await seed(store);
  // 1) search + limit: find "Alpha beans" but only the newest 1 row is fetched by SQL
  const searched = await store.products.list({
    where: { tenantId: 't1' },
    search: { fields: ['name'], term: 'beans' },
    limit: 1,
    orderBy: 'createdAt',
    order: 'desc',
  });
  // 2) orderBy updatedAt with a limit
  const byUpdated = await store.products.list({
    where: { tenantId: 't1' },
    limit: 1,
    orderBy: 'updatedAt',
    order: 'asc',
  });
  // 3) offset with no residual where
  const page = await store.products.list({
    where: { tenantId: 't1' },
    limit: 1,
    offset: 1,
    orderBy: 'createdAt',
    order: 'asc',
  });
  console.log(`[${label}] search(name~beans,limit1) =>`, searched.map((p: any) => p.name));
  console.log(`[${label}] orderBy updatedAt asc limit1 =>`, byUpdated.map((p: any) => p.name));
  console.log(`[${label}] orderBy createdAt asc offset1 limit1 =>`, page.map((p: any) => p.name));
}

await run('memory', new MemoryStore());

const dir = mkdtempSync(path.join(tmpdir(), 'duty-repro-'));
const sqlite = new SqliteStore(path.join(dir, 'r.sqlite'));
try {
  await run('sqlite', sqlite);
} finally {
  await sqlite.close();
  rmSync(dir, { recursive: true, force: true });
}
