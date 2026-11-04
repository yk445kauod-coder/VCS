import type { BaseDoc, Filter, SortOrder } from './types.js';

const getPath = (doc: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, doc);

export function matchesWhere<T extends BaseDoc>(
  doc: T,
  where?: Filter<T>['where'],
): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    const actual = getPath(doc, key);
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || !expected.every((v) => (actual as unknown[]).includes(v))) {
        return false;
      }
    } else if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

export function matchesSearch<T extends BaseDoc>(doc: T, search?: Filter<T>['search']): boolean {
  if (!search || !search.term) return true;
  const term = search.term.toLowerCase();
  return search.fields.some((field) => {
    const value = getPath(doc, String(field));
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.toLowerCase().includes(term);
    if (Array.isArray(value)) {
      return value.some((v) => String(v).toLowerCase().includes(term));
    }
    return String(value).toLowerCase().includes(term);
  });
}

const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

export function applyFilter<T extends BaseDoc>(docs: T[], filter?: Filter<T>): T[] {
  let result = docs.filter((doc) => matchesWhere(doc, filter?.where) && matchesSearch(doc, filter?.search));
  const orderBy = filter?.orderBy ? String(filter.orderBy) : undefined;
  if (orderBy) {
    const direction: SortOrder = filter?.order === 'asc' ? 'asc' : 'desc';
    result = [...result].sort((a, b) => {
      const cmp = compare(getPath(a, orderBy), getPath(b, orderBy));
      return direction === 'asc' ? cmp : -cmp;
    });
  }
  const offset = filter?.offset ?? 0;
  const limit = filter?.limit ?? 0;
  if (offset) result = result.slice(offset);
  if (limit > 0) result = result.slice(0, limit);
  return result;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;
