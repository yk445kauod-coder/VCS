import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from './src/storage/memory.js';
import { SqliteStore } from './src/storage/sqlite.js';
import type { Store } from './src/storage/types.js';

const iso = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();

// Mirror the /api/conversations route: limit 100, orderBy 'updatedAt', order 'desc'.
async function run(store: Store, label: string) {
  for (let i = 0; i < 150; i++) {
    const recentActivity = i < 10; // 10 oldest-created but most-recently-updated
    await store.conversations.put({
      id: `c${String(i).padStart(3, '0')}`,
      tenantId: 't1',
      status: 'open',
      createdAt: iso(i),
      updatedAt: recentActivity ? iso(10_000 + i) : iso(i),
    } as never);
  }
  const page = await store.conversations.list({ where: { tenantId: 't1' }, limit: 100, orderBy: 'updatedAt', order: 'desc' });
  const ids = page.map((c) => c.id);
  const top = ids.slice(0, 3);
  console.log(label, 'first 3 ids of the "most recently updated" page =>', top);
  return ids;
}

const mem = new MemoryStore(); await mem.init();
const m = await run(mem, 'memory');
const dir = mkdtempSync(path.join(tmpdir(), 'duty-audit-'));
const sq = new SqliteStore(path.join(dir, 'a.sqlite')); await sq.init();
const s = await run(sq, 'sqlite');
await sq.close(); rmSync(dir, { recursive: true, force: true });

console.log('DIVERGE?', JSON.stringify(m) !== JSON.stringify(s));
console.log('The 10 most-recently-updated conversations are c000..c009.');
console.log('memory page contains c000..c009?', m.slice(0, 10).join(','));
console.log('sqlite page contains c000..c009?', s.slice(0, 10).join(','));
console.log('sqlite page size:', s.length, '(expected 100)');
