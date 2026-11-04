import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import type { Store } from './src/storage/index.js';

const T = 'ten_x';
const EARLY = '2026-01-01T00:00:00.000Z';
const LATE = '2026-06-01T00:00:00.000Z';
const NEWEST = '2026-12-01T00:00:00.000Z';

async function seed(s: Store) {
  await s.init();
  // c1: created EARLY, but updated NEWEST (recently active)
  await s.conversations.put({ id: 'c1', tenantId: T, customerId: 'k', channel: 'api', status: 'open',
    subject: 'old but active', createdAt: EARLY, updatedAt: NEWEST } as any);
  // c2: created LATE, updated EARLY (stale)
  await s.conversations.put({ id: 'c2', tenantId: T, customerId: 'k', channel: 'api', status: 'open',
    subject: 'new but stale', createdAt: LATE, updatedAt: EARLY } as any);
}

async function main() {
  const mem = new MemoryStore(); await seed(mem);
  const sql = new SqliteStore(':memory:'); await seed(sql);

  // This is exactly what GET /api/conversations does (admin.ts:177-180)
  const q = { where: { tenantId: T }, limit: 100, orderBy: 'updatedAt' as const, order: 'desc' as const };
  const m = await mem.conversations.list(q);
  const s = await sql.conversations.list(q);
  console.log('orderBy updatedAt DESC (recently-active first expected):');
  console.log('  memory:', m.map((c: any) => `${c.id}(${c.updatedAt})`).join(', '));
  console.log('  sqlite:', s.map((c: any) => `${c.id}(${c.updatedAt})`).join(', '));
  console.log('  DIVERGENT:', m[0].id !== s[0].id);

  // listAll-style: products by updatedAt
  const mem2 = new MemoryStore(); await seed(mem2);
  const sql2 = new SqliteStore(':memory:'); await seed(sql2);
  const pq = { where: { tenantId: T }, limit: 10, orderBy: 'createdAt' as const, order: 'desc' as const };
  console.log('\ncontrol (orderBy createdAt DESC):');
  console.log('  memory:', (await mem2.conversations.list(pq)).map((c: any) => c.id).join(', '));
  console.log('  sqlite:', (await sql2.conversations.list(pq)).map((c: any) => c.id).join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
