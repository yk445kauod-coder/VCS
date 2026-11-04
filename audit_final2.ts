import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'duty-final2-'));

const conv = (id: string, createdAt: string, updatedAt: string) => ({
  id, tenantId: 't1', customerId: 'c1', channel: 'webchat', status: 'open',
  metadata: {}, createdAt, updatedAt,
});

async function main() {
  const stores = [
    { name: 'memory', store: new MemoryStore() as any },
    { name: 'sqlite', store: new SqliteStore(path.join(dir, 'b.sqlite')) as any },
  ];
  for (const { store } of stores) await store.init();

  // created order and updated order deliberately disagree
  const rows = [
    conv('c1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), // oldest updated
    conv('c2', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'), // most recently updated
    conv('c3', '2026-03-01T00:00:00.000Z', '2026-02-15T00:00:00.000Z'),
  ];
  for (const { store } of stores) for (const r of rows) await store.conversations.put(r);

  console.log('### FINDING D: orderBy:"updatedAt" is honored by memory but IGNORED by sqlite (always orders created_at)');
  console.log('  (this is exactly the query /api/conversations issues: admin.ts:179)');
  for (const { name, store } of stores) {
    const res = await store.conversations.list({ where: { tenantId: 't1' }, limit: 50, orderBy: 'updatedAt', order: 'desc' });
    console.log(`  ${name.padEnd(7)} =>`, res.map((d: any) => d.id).join(', '));
  }
  console.log('  expected (updatedAt desc): c2, c3, c1');

  console.log('\n### FINDING B (isolated): offset pushed to SQL AND re-applied by applyFilter');
  const items = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'].map((id, i) => ({
    id, tenantId: 't1', sku: id, name: id, price: 100, currency: 'USD', tags: [], aliases: [], upsells: [],
    active: true, metadata: {}, createdAt: `2026-01-0${i + 1}T00:00:00.000Z`, updatedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
  }));
  for (const { store } of stores) for (const r of items) await store.products.put(r);
  for (const { name, store } of stores) {
    const res = await store.products.list({ where: { tenantId: 't1' }, offset: 3, limit: 2, orderBy: 'createdAt', order: 'asc' });
    console.log(`  ${name.padEnd(7)} =>`, res.map((d: any) => d.id).join(',') || '(empty)');
  }
  console.log('  expected page (offset 3, limit 2, asc): i3,i4');

  for (const { store } of stores) await store.close();
  rmSync(dir, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
