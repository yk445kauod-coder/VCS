import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import { CatalogService } from './src/commerce/catalog.js';
import { UpsellEngine } from './src/commerce/upsell.js';
import { OrderService } from './src/commerce/orders.js';
import type { Store } from './src/storage/index.js';

const T = 'ten_test';
const SAME = '2026-01-01T00:00:00.000Z'; // every doc shares one timestamp

async function seed(store: Store) {
  await store.init();
  await store.tenants.put({ id: T, name: 'T', currency: 'USD', locale: 'en', settings: {}, createdAt: SAME, updatedAt: SAME } as any);
  // 6 customers, identical createdAt -> ordering is decided purely by tie-break
  for (let i = 0; i < 6; i++) {
    await store.customers.put({
      id: `cus_${i}`, tenantId: T, channel: 'whatsapp', externalId: `e${i}`,
      name: `Cust ${i}`, tags: [], ltv: 0, metadata: {}, createdAt: SAME, updatedAt: SAME,
    } as any);
  }
  // products; names chosen so ordering by name is NOT the insertion order
  const prods = [
    { id: 'p1', name: 'Zebra beans' },
    { id: 'p2', name: 'Ethiopian beans' },
    { id: 'p3', name: 'Apple beans' },
    { id: 'p4', name: 'Mango beans' },
  ];
  for (const p of prods) {
    await store.products.put({
      id: p.id, tenantId: T, sku: p.id.toUpperCase(), name: p.name, price: 1000,
      currency: 'USD', tags: [], aliases: [], upsells: [], active: true, metadata: {},
      createdAt: SAME, updatedAt: SAME,
    } as any);
  }
  return store;
}

async function main() {
  const mem = await seed(new MemoryStore());
  const sql = await seed(new SqliteStore(':memory:'));

  console.log('=== TEST 1: orderBy created_at DESC, limit 3 (all createdAt identical) ===');
  for (const [label, s] of [['memory', mem], ['sqlite', sql]] as const) {
    const rows = await s.customers.list({ where: { tenantId: T }, limit: 3, orderBy: 'createdAt', order: 'desc' });
    console.log(label.padEnd(7), rows.map((r: any) => r.id).join(', '));
  }

  console.log('\n=== TEST 2: search "beans" across all 4 products, orderBy createdAt DESC, limit 5 ===');
  for (const [label, s] of [['memory', mem], ['sqlite', sql]] as const) {
    const rows = await s.products.list({
      where: { tenantId: T }, search: { fields: ['name'], term: 'beans' }, limit: 5, orderBy: 'createdAt', order: 'desc',
    });
    console.log(label.padEnd(7), rows.map((r: any) => r.name).join(' | '));
  }

  console.log('\n=== TEST 3: same query through CatalogService.list ===');
  const memCat = new CatalogService(mem);
  const sqlCat = new CatalogService(sql);
  console.log('memory', (await memCat.list(T, {})).map((p) => p.name).join(' | '));
  console.log('sqlite', (await sqlCat.list(T, {})).map((p) => p.name).join(' | '));

  console.log('\n=== TEST 4: out-of-stock item still offered by the LLM/tool upsell path ===');
  // cart product p1 has an upsell rule targeting p2; p2 is out of stock
  await mem.products.patch('p1', { upsells: [{ strategy: 'cross_sell', targetSku: 'P2', priority: 1, active: true }] } as any);
  await mem.products.patch('p2', { stock: 0 } as any);
  const cat = new CatalogService(mem);
  const upsell = new UpsellEngine(cat);
  const orders = new OrderService(mem, cat);
  const order = await orders.create({ tenantId: T, customerId: 'cus_0', channel: 'api', items: [{ sku: 'P1' }] });
  const cartProducts = [await cat.findBySku(T, 'P1')] as any[];
  const opps = await upsell.findOpportunities({ tenantId: T, order, cartProducts });
  console.log('engine offers for OOS target P2:', opps.map((o) => o.product.sku).join(',') || '(none)');
  // The LLM tool path 'offer_upsell' / agent upsell-accept path adds the SKU directly with no stock check:
  const after = await orders.addItem(T, order.id, { sku: 'P2' });
  console.log('after addItem(P2) on stock=0 ->', after.lines.map((l: any) => l.sku).join(','), 'total', after.total);
}

main().catch((e) => { console.error(e); process.exit(1); });
