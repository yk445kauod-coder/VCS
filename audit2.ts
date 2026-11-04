import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import { FirebaseStore } from './src/storage/firebase.js';
import type { Store } from './src/storage/types.js';
import { CatalogService } from './src/commerce/catalog.js';
import { OrderService } from './src/commerce/orders.js';

const iso = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

async function withSqlite<T>(fn: (s: Store) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
  const sq = new SqliteStore(path.join(dir, 'a.sqlite'));
  await sq.init();
  try { return await fn(sq); } finally { await sq.close(); rmSync(dir, { recursive: true, force: true }); }
}

console.log('=== FINDING A: search+limit truncated before the JS search filter (SQL adapters) ===');
{
  const run = async (store: Store, label: string) => {
    const catalog = new CatalogService(store, 'USD');
    // 12 products; the ONLY one matching "grinder" is the OLDEST (created first).
    const grinder = await catalog.create({ tenantId: 't1', name: 'Beta grinder', price: 5000 });
    for (let i = 0; i < 11; i++) {
      await catalog.create({ tenantId: 't1', name: `Newer filler ${i}`, price: 1000 });
    }
    // Force deterministic ordering by createdAt (memory sorts by createdAt desc).
    const all = await store.products.list({ where: { tenantId: 't1' } });
    for (const p of all) {
      await store.products.patch(p.id, { createdAt: p.id === grinder.id ? iso(1) : iso(100) } as never);
    }
    const hits = await catalog.list('t1', { search: 'grinder', limit: 6 });
    console.log(label, 'search "grinder" limit 6 =>', hits.map((h) => h.name));
    return hits.length;
  };
  const mem = new MemoryStore(); await mem.init();
  const m = await run(mem, 'memory');
  const s = await withSqlite((store) => run(store, 'sqlite'));
  console.log('DIVERGE?', m !== s, '(memory should find 1, sqlite should find 1)');
}

console.log('\n=== FINDING B: orderBy != createdAt selects the wrong page in SQL adapters ===');
{
  const doc = (id: string, extra: Record<string, unknown>) => ({ id, tenantId: 't1', ...extra });
  const run = async (store: Store, label: string) => {
    // c1 has the newest updatedAt but oldest createdAt.
    await store.conversations.put(doc('c1', { createdAt: iso(1), updatedAt: iso(300), status: 'open' }) as never);
    await store.conversations.put(doc('c2', { createdAt: iso(2), updatedAt: iso(200), status: 'open' }) as never);
    await store.conversations.put(doc('c3', { createdAt: iso(3), updatedAt: iso(100), status: 'open' }) as never);
    const r = await store.conversations.list({ where: { tenantId: 't1' }, limit: 1, orderBy: 'updatedAt', order: 'desc' });
    console.log(label, 'most-recently-updated conversation =>', r.map((x) => x.id));
    return r.map((x) => x.id);
  };
  const mem = new MemoryStore(); await mem.init();
  const m = await run(mem, 'memory');
  const s = await withSqlite((store) => run(store, 'sqlite'));
  console.log('DIVERGE?', JSON.stringify(m) !== JSON.stringify(s), '(correct answer: c1)');
}

console.log('\n=== FINDING C: offset double-applied when where has no residual (SQL adapters) ===');
{
  const run = async (store: Store, label: string) => {
    const catalog = new CatalogService(store, 'USD');
    const orders = new OrderService(store, catalog, 'USD');
    const p = await catalog.create({ tenantId: 't1', name: 'Thing', price: 1000 });
    for (let i = 0; i < 30; i++) {
      const o = await orders.create({ tenantId: 't1', customerId: 'c1', channel: 'api', items: [{ sku: p.sku }] });
      await store.orders.patch(o.id, { createdAt: iso(100 + i) } as never);
    }
    // where = { tenantId } only  => no residual => SQL applies OFFSET, then applyFilter applies it again.
    const page = await orders.list('t1', { limit: 5, offset: 10 });
    const nums = page.map((o) => o.createdAt);
    console.log(label, 'page(limit 5, offset 10) count =>', page.length, 'first createdAt =>', nums[0]);
    return nums[0];
  };
  const mem = new MemoryStore(); await mem.init();
  const m = await run(mem, 'memory');
  const s = await withSqlite((store) => run(store, 'sqlite'));
  console.log('DIVERGE?', m !== s, '(correct first row = 20th-newest, createdAt', iso(100 + 30 - 1 - 10), ')');
}
