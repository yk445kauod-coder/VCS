import { MemoryStore } from './src/storage/memory.js';
import { CatalogService } from './src/commerce/catalog.js';
import { OrderService } from './src/commerce/orders.js';

const T = 'ten_c';

async function main() {
  const store = new MemoryStore();
  await store.init();
  const cat = new CatalogService(store);
  const orders = new OrderService(store, cat);
  await cat.create({ tenantId: T, name: 'A', sku: 'A', price: 1000 });
  await cat.create({ tenantId: T, name: 'B', sku: 'B', price: 1000 });
  await cat.create({ tenantId: T, name: 'C', sku: 'C', price: 1000 });

  const order = await orders.create({ tenantId: T, customerId: 'c1', channel: 'api', items: [{ sku: 'A' }] });
  console.log('initial lines:', order.lines.map((l) => l.sku).join(','));

  // Two concurrent "add to cart" requests (e.g. two webhooks arriving together)
  await Promise.all([
    orders.addItem(T, order.id, { sku: 'B' }),
    orders.addItem(T, order.id, { sku: 'C' }),
  ]);

  const after = await orders.get(T, order.id);
  console.log('after 2 concurrent addItem(B), addItem(C):', after!.lines.map((l) => l.sku).join(','));
  console.log('EXPECTED A,B,C   ->', ['A', 'B', 'C'].every((s) => after!.lines.some((l) => l.sku === s)) ? 'ok' : 'LOST UPDATE');

  // order-number collision check
  const nums = new Set<string>();
  for (let i = 0; i < 3; i++) nums.add(order.number);
  console.log('sample order numbers:', [...nums]);
}
main().catch((e) => { console.error(e); process.exit(1); });
