import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/storage/sqlite.js';
import { MemoryStore } from '../src/storage/memory.js';
import type { Store } from '../src/storage/types.js';

const product = (id: string, tenantId: string, sku: string, name: string) => ({
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

async function exercise(store: Store): Promise<void> {
  await store.products.put(product('p1', 't1', 'AAA', 'Alpha beans') as never);
  await store.products.put(product('p2', 't1', 'BBB', 'Beta grinder') as never);
  await store.products.put(product('p3', 't2', 'AAA', 'Other tenant item') as never);

  // Tenant isolation
  const tenantOne = await store.products.list({ where: { tenantId: 't1' } });
  assert.equal(tenantOne.length, 2);

  // Non-indexed key filtering must not be truncated by the SQL window.
  // Regression: LIMIT used to be applied before the residual JS filter.
  const bySku = await store.products.list({ where: { tenantId: 't1', sku: 'BBB' } });
  assert.equal(bySku.length, 1, 'filtering by a non-pushdown key must work with a small limit');
  assert.equal(bySku[0]!.name, 'Beta grinder');

  // Search across named fields
  const searched = await store.products.list({
    where: { tenantId: 't1' },
    search: { fields: ['name'], term: 'grinder' },
  });
  assert.equal(searched.length, 1);

  // Patch merges and preserves identity
  const patched = await store.products.patch('p1', { price: 2222 } as never);
  assert.equal(patched?.price, 2222);
  assert.equal(patched?.sku, 'AAA');

  // Count ignores limit
  assert.equal(await store.products.count({ where: { tenantId: 't1' } }), 2);

  // Delete
  assert.equal(await store.products.delete('p3'), true);
  assert.equal(await store.products.get('p3'), null);
}

test('memory store satisfies the repository contract', async () => {
  const store = new MemoryStore();
  await store.init();
  await exercise(store);
  await store.close();
});

test('sqlite store satisfies the repository contract', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-store-'));
  const store = new SqliteStore(path.join(dir, 'test.sqlite'));
  try {
    await store.init();
    await exercise(store);
    const health = await store.health();
    assert.equal(health.ok, true);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store persists across reconnects (sqlite)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'duty-persist-'));
  const file = path.join(dir, 'persist.sqlite');
  const first = new SqliteStore(file);
  await first.init();
  await first.products.put(product('keep', 't1', 'KEEP', 'Kept item') as never);
  await first.close();

  const second = new SqliteStore(file);
  await second.init();
  const found = await second.products.get('keep');
  assert.equal(found?.name, 'Kept item');
  await second.close();
  rmSync(dir, { recursive: true, force: true });
});
