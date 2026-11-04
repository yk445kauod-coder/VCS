import type { ChannelKind } from '../core/types.js';

export interface OutboundMessage {
  tenantId: string;
  conversationId: string;
  /** Channel-scoped identity of the recipient (phone number, session id, email). */
  externalId: string;
  text: string;
  channel: ChannelKind;
  attachments?: Array<{ name: string; url: string; mimeType?: string }>;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  detail?: string;
  /** Provider message id when available. */
  providerId?: string;
}

export interface Channel {
  readonly kind: ChannelKind;
  /** Whether the channel has enough configuration to deliver messages. */
  enabled(): boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** WhatsApp limits a single text message to 4096 characters. */
export function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
