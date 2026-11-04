import { randomUUID, createHash } from 'node:crypto';

export const newId = (prefix?: string): string =>
  prefix ? `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}` : randomUUID();

export const nowIso = (): string => new Date().toISOString();

/** Stable, human-friendly order numbers: DTY-20261103-4F2A */
export function orderNumber(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `DTY-${stamp}-${suffix}`;
}

export const hashId = (input: string): string =>
  createHash('sha256').update(input).digest('hex').slice(0, 24);

export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';

export function truncate(input: string, max = 280): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}
