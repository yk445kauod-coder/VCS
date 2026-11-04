import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import type { Store } from './src/storage/index.js';

const T = 'ten_x';
// 5 conversations. c5 is the MOST RECENTLY UPDATED but has the OLDEST createdAt.
async function seed(s: Store) {
  await s.init();
  const rows = [
    ['c1', '2026-12-05', '2026-01-01'],
    ['c2', '2026-12-04', '2026-01-02'],
    ['c3', '2026-12-03', '2026-01-03'],
    ['c4', '2026-12-02', '2026-01-04'],
    ['c5', '2026-12-30', '2026-01-05'], // newest update, oldest created
  ];
  for (const [id, upd, cre] of rows) {
    await s.conversations.put({ id, tenantId: T, customerId: 'k', channel: 'api', status: 'open',
      subject: id, createdAt: `${cre}T00:00:00.000Z`, updatedAt: `${upd}T00:00:00.000Z` } as any);
  }
}

async function main() {
  const mem = new MemoryStore(); await seed(mem);
  const sql = new SqliteStore(':memory:'); await seed(sql);

  // Exactly the dashboard query: orderBy 'updatedAt' DESC, limit 2 (admin.ts:177)
  const q = { where: { tenantId: T }, limit: 2, orderBy: 'updatedAt' as const, order: 'desc' as const };
  const m = await mem.conversations.list(q);
  const s = await sql.conversations.list(q);
  console.log('query: orderBy updatedAt DESC, limit 2');
  console.log('  memory:', m.map((c: any) => `${c.id}(upd=${c.updatedAt.slice(0,10)})`).join(', '));
  console.log('  sqlite:', s.map((c: any) => `${c.id}(upd=${c.updatedAt.slice(0,10)})`).join(', '));
  console.log('  DIVERGENT:', JSON.stringify(m.map((c:any)=>c.id)) !== JSON.stringify(s.map((c:any)=>c.id)));
}
main().catch((e) => { console.error(e); process.exit(1); });
