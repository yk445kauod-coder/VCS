import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import type { Store } from './src/storage/index.js';

const T = 'ten_p';
async function seed(s: Store) {
  await s.init();
  for (let i = 0; i < 10; i++) {
    await s.products.put({ id: `p${i}`, tenantId: T, sku: `S${i}`, name: `P${i}`, price: 100,
      createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, updatedAt: '2026-01-01T00:00:00.000Z' } as any);
  }
}

async function main() {
  const mem = new MemoryStore(); await seed(mem);
  const sql = new SqliteStore(':memory:'); await seed(sql);
  // No residual keys (only tenantId) -> offset should be pushed down cleanly.
  const q = { where: { tenantId: T }, limit: 3, offset: 2, orderBy: 'createdAt' as const, order: 'asc' as const };
  const m = await mem.products.list(q);
  const s = await sql.products.list(q);
  console.log('offset=2 limit=3 orderBy createdAt ASC');
  console.log('  expected page:  P2,P3,P4');
  console.log('  memory:', m.map((p: any) => p.name).join(','));
  console.log('  sqlite:', s.map((p: any) => p.name).join(','));
  console.log('  DIVERGENT:', m.map((p:any)=>p.name).join(',') !== s.map((p:any)=>p.name).join(','));
}
main().catch((e) => { console.error(e); process.exit(1); });
