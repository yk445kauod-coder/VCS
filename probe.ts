import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteStore } from './src/storage/sqlite.js';
import { MemoryStore } from './src/storage/memory.js';
import type { Store } from './src/storage/types.js';

const prod = (id: string, sku: string, name: string, createdAt: string, updatedAt = createdAt) => ({
  id, tenantId: 't1', sku, name, price: 1000, currency: 'USD',
  tags: [], aliases: [], upsells: [], active: true, metadata: {},
  createdAt, updatedAt,
});

async function seed(store: Store) {
  await store.products.put(prod('old', 'AAA', 'Alpha beans', '2026-01-01T00:00:00.000Z') as never);
  await store.products.put(prod('mid', 'BBB', 'Beta grinder', '2026-02-01T00:00:00.000Z') as never);
  await store.products.put(prod('new', 'CCC', 'Gamma kettle', '2026-03-01T00:00:00.000Z') as never);
}

async function run(label: string, store: Store) {
  await store.init();
  await seed(store);
  const show = async (title: string, f: any) =>
    console.log(`[${label}] ${title} =>`, (await store.products.list(f)).map((p: any) => p.id));

  await show('all (no filter)', { where: { tenantId: 't1' } });
  await show('search beans limit1 desc', { where: { tenantId: 't1' }, search: { fields: ['name'], term: 'beans' }, limit: 1, orderBy: 'createdAt', order: 'desc' });
  await show('search kettle limit1 desc', { where: { tenantId: 't1' }, search: { fields: ['name'], term: 'kettle' }, limit: 1, orderBy: 'createdAt', order: 'desc' });
  await show('orderBy updatedAt asc limit1', { where: { tenantId: 't1' }, limit: 1, orderBy: 'updatedAt', order: 'asc' });
  await show('offset1 limit1 asc', { where: { tenantId: 't1' }, limit: 1, offset: 1, orderBy: 'createdAt', order: 'asc' });
  await show('offset2 limit1 asc', { where: { tenantId: 't1' }, limit: 1, offset: 2, orderBy: 'createdAt', order: 'asc' });
  await show('offset1 limit2 asc', { where: { tenantId: 't1' }, limit: 2, offset: 1, orderBy: 'createdAt', order: 'asc' });
}

await run('memory', new MemoryStore());
const dir = mkdtempSync(path.join(tmpdir(), 'duty-probe-'));
const sqlite = new SqliteStore(path.join(dir, 'r.sqlite'));
try { await run('sqlite', sqlite); } finally { await sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
