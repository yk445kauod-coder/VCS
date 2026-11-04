import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteStore } from './src/storage/sqlite.js';
import { MemoryStore } from './src/storage/memory.js';
import type { Store } from './src/storage/types.js';

const prod = (id: string, name: string, createdAt: string, updatedAt = createdAt) => ({
  id, tenantId: 't1', sku: id.toUpperCase(), name, price: 1000, currency: 'USD',
  tags: [], aliases: [], upsells: [], active: true, metadata: {},
  createdAt, updatedAt,
});

async function seed(store: Store) {
  // "Wanted" is the OLDEST product. 8 newer products follow.
  await store.products.put(prod('wanted', 'Wanted kettle', '2026-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z') as never);
  for (let i = 1; i <= 8; i += 1) {
    await store.products.put(prod(`p${i}`, `Filler ${i}`, `2026-0${i}-01T00:00:00.000Z`, `2026-0${i}-01T00:00:00.000Z`) as never);
  }
}

async function run(label: string, store: Store) {
  await store.init();
  await seed(store);
  const names = (ps: any[]) => ps.map((p) => p.name);

  // A) catalog.list search with the agent's limit (6) — the match is older than the window.
  const a = await store.products.list({
    where: { tenantId: 't1' },
    search: { fields: ['name', 'description', 'sku', 'category', 'tags'], term: 'kettle' },
    limit: 6,
    orderBy: 'createdAt',
    order: 'desc',
  });
  console.log(`[${label}] A search('kettle', limit6) =>`, names(a));

  // B) orderBy updatedAt with a small limit (SQL adapters hardcode created_at).
  const b = await store.products.list({
    where: { tenantId: 't1' }, limit: 1, orderBy: 'updatedAt', order: 'asc',
  });
  console.log(`[${label}] B orderBy updatedAt asc limit1 =>`, names(b));

  // C) offset + residual where key (status-like) — sqlite forces offset 0.
  await store.products.put({ ...prod('x1', 'X1', '2026-05-01T00:00:00.000Z'), active: false } as never);
  const c = await store.products.list({
    where: { tenantId: 't1', active: false }, limit: 5, offset: 1,
    orderBy: 'createdAt', order: 'asc',
  });
  console.log(`[${label}] C where{active:false} offset1 limit5 =>`, names(c));
}

await run('memory', new MemoryStore());
const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
const sqlite = new SqliteStore(path.join(dir, 'r.sqlite'));
try { await run('sqlite', sqlite); } finally { await sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
