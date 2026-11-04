import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import { CatalogService } from './src/commerce/catalog.js';
import { OrderService } from './src/commerce/orders.js';
import { AnalyticsService } from './src/commerce/analytics.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const doc = (id: string, name: string, createdAt: string) => ({
  id, tenantId: 't1', sku: id.toUpperCase(), name, price: 1000, currency: 'USD',
  tags: [], aliases: [], upsells: [], active: true, metadata: {}, createdAt, updatedAt: createdAt,
});

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-final-'));
  const mk = () => [
    { name: 'memory', store: new MemoryStore() as any },
    { name: 'sqlite', store: new SqliteStore(path.join(dir, 'a.sqlite')) as any },
  ];
  let stores = mk();
  for (const { store } of stores) await store.init();

  console.log('### FINDING A: search is applied in JS *after* the SQL LIMIT (search is never pushed down)');
  const rows = [
    doc('r1', 'Apple', '2026-03-05T00:00:00.000Z'),
    doc('r2', 'Banana', '2026-03-04T00:00:00.000Z'),
    doc('r3', 'Cherry', '2026-03-03T00:00:00.000Z'),
    doc('r4', 'Dragonfruit', '2026-03-02T00:00:00.000Z'),
    doc('r5', 'Elderberry', '2026-03-01T00:00:00.000Z'),
    doc('r6', 'Fennel tea', '2026-02-28T00:00:00.000Z'),
  ];
  for (const { store } of stores) for (const r of rows) await store.products.put(r);
  console.log("query: products.list({ where:{tenantId}, search:{fields:[name],term:'tea'}, limit:2, orderBy createdAt desc })");
  console.log('expected (memory semantics): [Fennel tea]');
  for (const { name, store } of stores) {
    const res = await store.products.list({
      where: { tenantId: 't1' }, search: { fields: ['name'], term: 'tea' }, limit: 2, orderBy: 'createdAt', order: 'desc',
    });
    console.log(`  ${name.padEnd(7)} =>`, res.map((d: any) => d.name).join(',') || '(empty)');
  }

  console.log("\n### FINDING A2: same query through CatalogService.list (used by the agent's search_catalog tool)");
  const memCat = new CatalogService(stores[0].store);
  const sqlCat = new CatalogService(stores[1].store);
  console.log('  memory =>', (await memCat.list('t1', { search: 'tea', limit: 6 })).map((p) => p.name).join(',') || '(empty)');
  console.log('  sqlite =>', (await sqlCat.list('t1', { search: 'tea', limit: 6 })).map((p) => p.name).join(',') || '(empty)');

  console.log('\n### FINDING B: offset is applied TWICE (pushed to SQL and again in applyFilter) when no residual keys');
  console.log('query: products.list({ where:{tenantId}, offset:2, limit:3, orderBy createdAt asc })');
  console.log('expected page: P3,P4,P5');
  for (const { name, store } of stores) {
    const res = await store.products.list({ where: { tenantId: 't1' }, offset: 2, limit: 3, orderBy: 'createdAt', order: 'asc' });
    console.log(`  ${name.padEnd(7)} =>`, res.map((d: any) => d.name).join(',') || '(empty)');
  }

  console.log('\n### FINDING C: MAX_LIMIT=500 silently truncates analytics (asks for 5000) on SQL stores');
  for (const { store } of stores) await store.close();
  stores = mk();
  for (const { store } of stores) await store.init();
  const storesC = mk();
  for (const { store } of storesC) await store.init();
  // 600 paid orders
  for (const { store } of storesC) {
    const cat = new CatalogService(store, 'USD');
    const orders = new OrderService(store, cat, 'USD');
    await cat.create({ tenantId: 't1', name: 'Widget', price: 1000, sku: 'WID' });
    for (let i = 0; i < 600; i += 1) {
      const o = await orders.create({ tenantId: 't1', customerId: 'c1', channel: 'webchat', items: [{ sku: 'WID' }] });
      await orders.setStatus('t1', o.id, 'paid');
    }
  }
  for (const { name, store } of storesC) {
    const analytics = new AnalyticsService(store);
    const m = await analytics.metrics('t1', { days: 3650 });
    console.log(`  ${name.padEnd(7)} => orders=${m.orders} paidOrders=${m.paidOrders} grossRevenue=${m.grossRevenue}`);
  }
  console.log('  expected: orders=600 paidOrders=600 grossRevenue=600000');

  for (const { store } of stores) await store.close();
  for (const { store } of storesC) await store.close();
  rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
