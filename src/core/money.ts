/** Money helpers. All amounts are minor units (cents) to avoid float drift. */

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: '﷼',
  AED: 'د.إ',
  EGP: 'ج.م',
  KWD: 'د.ك',
  QAR: 'ر.ق',
};

export const toMinor = (major: number): number => Math.round(major * 100);
export const toMajor = (minor: number): number => Math.round(minor) / 100;

export function formatMoney(minor: number, currency = 'USD', locale = 'en-US'): string {
  const value = toMajor(minor);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${SYMBOLS[currency] ?? ''}${value.toFixed(2)}`;
  }
}

export const percent = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : Math.round((numerator / denominator) * 10000) / 10000;

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
