import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import type { Store } from './src/storage/types.js';
import { CatalogService } from './src/commerce/catalog.js';
import { OrderService } from './src/commerce/orders.js';
import { AnalyticsService } from './src/commerce/analytics.js';

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId: 't1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

async function withStores<T>(fn: (s: Store, label: string) => Promise<T>) {
  const mem = new MemoryStore();
  await mem.init();
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
  const sq = new SqliteStore(path.join(dir, 'a.sqlite'));
  await sq.init();
  try {
    const m = await fn(mem, 'memory');
    const s = await fn(sq, 'sqlite');
    return { m, s };
  } finally {
    await sq.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('=== FINDING 1: orderBy ignored by SQL adapters ===');
{
  // createdAt ascending c1<c2<c3, but updatedAt reversed: c1 newest-updated.
  const seed = async (store: Store) => {
    await store.conversations.put(doc('c1', { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }) as never);
    await store.conversations.put(doc('c2', { createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }) as never);
    await store.conversations.put(doc('c3', { createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }) as never);
  };
  const run = async (store: Store, label: string) => {
    await seed(store);
    const r = await store.conversations.list({ where: { tenantId: 't1' }, limit: 2, orderBy: 'updatedAt', order: 'desc' });
    console.log(label, 'orderBy=updatedAt desc limit=2 =>', r.map((x) => x.id));
    return r.map((x) => x.id);
  };
  const mem = new MemoryStore(); await mem.init();
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
  const sq = new SqliteStore(path.join(dir, 'a.sqlite')); await sq.init();
  const m = await run(mem, 'memory');
  const s = await run(sq, 'sqlite');
  console.log('DIVERGE?', JSON.stringify(m) !== JSON.stringify(s));
  await sq.close(); rmSync(dir, { recursive: true, force: true });
}

console.log('\n=== FINDING 2: offset double-applied in SQL adapters (no residual) ===');
{
  const seed = async (store: Store) => {
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5']) {
      await store.products.put(doc(id, { sku: id, name: id }) as never);
    }
  };
  const run = async (store: Store, label: string) => {
    await seed(store);
    const r = await store.products.list({ where: { tenantId: 't1' }, limit: 2, offset: 3, orderBy: 'createdAt', order: 'asc' });
    console.log(label, 'limit=2 offset=3 =>', r.map((x) => x.id));
    return r.map((x) => x.id);
  };
  const mem = new MemoryStore(); await mem.init();
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
  const sq = new SqliteStore(path.join(dir, 'a.sqlite')); await sq.init();
  const m = await run(mem, 'memory');
  const s = await run(sq, 'sqlite');
  console.log('DIVERGE?', JSON.stringify(m) !== JSON.stringify(s), 'expected page =', ['i4', 'i5']);
  await sq.close(); rmSync(dir, { recursive: true, force: true });
}

console.log('\n=== FINDING 3: analytics.metrics capped at MAX_LIMIT=500 in SQL ===');
{
  const run = async (store: Store, label: string) => {
    const catalog = new CatalogService(store, 'USD');
    const orders = new OrderService(store, catalog, 'USD');
    const analytics = new AnalyticsService(store, null);
    const p = await catalog.create({ tenantId: 't1', name: 'Thing', price: 1000 });
    for (let i = 0; i < 600; i++) {
      const o = await orders.create({ tenantId: 't1', customerId: 'c1', channel: 'api', items: [{ sku: p.sku }] });
      await orders.setStatus('t1', o.id, 'paid');
    }
    const metrics = await analytics.metrics('t1', { days: 3650 });
    console.log(label, 'paidOrders=', metrics.paidOrders, 'grossRevenue=', metrics.grossRevenue);
    return metrics.paidOrders;
  };
  const mem = new MemoryStore(); await mem.init();
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
  const sq = new SqliteStore(path.join(dir, 'a.sqlite')); await sq.init();
  const m = await run(mem, 'memory');
  const s = await run(sq, 'sqlite');
  console.log('DIVERGE?', m !== s, 'expected 600');
  await sq.close(); rmSync(dir, { recursive: true, force: true });
}

console.log('\n=== FINDING 4: concurrent addItem loses an update (read-modify-write) ===');
{
  const store = new MemoryStore(); await store.init();
  const catalog = new CatalogService(store, 'USD');
  const orders = new OrderService(store, catalog, 'USD');
  const p1 = await catalog.create({ tenantId: 't1', name: 'One', price: 100 });
  const p2 = await catalog.create({ tenantId: 't1', name: 'Two', price: 200 });
  const o = await orders.create({ tenantId: 't1', customerId: 'c1', channel: 'api', items: [{ sku: p1.sku }] });
  await Promise.all([
    orders.addItem('t1', o.id, { sku: p2.sku }),
    orders.addItem('t1', o.id, { sku: p2.sku }),
  ]);
  const after = await orders.get('t1', o.id);
  console.log('lines after two concurrent addItem of same sku =>', after?.lines.map((l) => `${l.sku}x${l.quantity}`), 'expected p2 qty 2');
}

console.log('\n=== FINDING 5: orderNumber entropy / collisions ===');
{
  const { orderNumber } = await import('./src/core/ids.js');
  const seen = new Map<string, number>();
  let firstDup = '';
  for (let i = 0; i < 4000; i++) {
    const n = orderNumber(new Date('2026-11-04T00:00:00Z'));
    if (seen.has(n) && !firstDup) firstDup = n;
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const dups = [...seen.values()].filter((v) => v > 1).length;
  console.log('4000 generated, distinct=', seen.size, 'colliding numbers=', dups, 'example=', firstDup);
}
