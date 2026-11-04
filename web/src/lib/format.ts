export const toMajor = (minor: number): number => Math.round(minor) / 100;

export function money(minor: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: toMajor(minor) % 1 === 0 ? 0 : 2,
    }).format(toMajor(minor));
  } catch {
    return `${(toMajor(minor)).toFixed(2)} ${currency}`;
  }
}

export const pct = (value: number, digits = 0): string => `${(value * 100).toFixed(digits)}%`;

export function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const dateShort = (iso: string): string =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

export const statusTone = (
  status: string,
): 'ember' | 'moss' | 'sky' | 'danger' | 'brass' | '' => {
  switch (status) {
    case 'paid':
    case 'fulfilled':
    case 'open':
      return 'moss';
    case 'pending':
    case 'confirmed':
      return 'sky';
    case 'draft':
      return 'brass';
    case 'escalated':
    case 'cancelled':
    case 'refunded':
      return 'danger';
    default:
      return '';
  }
};

export const channelTone = (channel: string): 'ember' | 'moss' | 'sky' | 'brass' | '' => {
  switch (channel) {
    case 'whatsapp':
      return 'moss';
    case 'webchat':
      return 'sky';
    case 'mcp':
      return 'ember';
    case 'webhook':
      return 'brass';
    default:
      return '';
  }
};

export const initials = (name?: string): string =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
