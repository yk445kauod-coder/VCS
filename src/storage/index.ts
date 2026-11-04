import type { AppConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Store } from './types.js';
import { memoryStore } from './memory.js';
import { sqliteStore } from './sqlite.js';
import { postgresStore } from './postgres.js';
import { supabaseStore } from './supabase.js';
import { firebaseStore } from './firebase.js';

const log = createLogger('storage');

export function createStore(config: AppConfig): Store {
  switch (config.db) {
    case 'postgres':
      if (!config.databaseUrl) {
        log.warn('DUTY_DB=postgres but DATABASE_URL is empty — falling back to sqlite');
        return sqliteStore(config.sqlitePath);
      }
      return postgresStore(config.databaseUrl);
    case 'supabase':
      if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
        log.warn('DUTY_DB=supabase but SUPABASE_URL/SERVICE_ROLE_KEY missing — falling back to sqlite');
        return sqliteStore(config.sqlitePath);
      }
      return supabaseStore(config.supabaseUrl, config.supabaseServiceRoleKey);
    case 'firebase':
      if (!config.firebaseDatabaseUrl) {
        log.warn('DUTY_DB=firebase but FIREBASE_DATABASE_URL missing — falling back to sqlite');
        return sqliteStore(config.sqlitePath);
      }
      return firebaseStore(config.firebaseDatabaseUrl, config.firebaseServiceAccountJson);
    case 'memory':
      return memoryStore();
    case 'sqlite':
    default:
      return sqliteStore(config.sqlitePath);
  }
}

export async function initStore(store: Store): Promise<Store> {
  await store.init();
  const health = await store.health();
  log.info(`store ready (${store.kind})`, health.detail);
  return store;
}

export type { Store };
export * from './types.js';
