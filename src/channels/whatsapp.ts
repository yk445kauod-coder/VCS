import type { AppConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Channel, OutboundMessage, SendResult } from './types.js';
import type { InboundMessage } from '../core/types.js';

const log = createLogger('whatsapp');

export interface ParsedWhatsAppMessage {
  externalId: string;
  text: string;
  name?: string;
  phoneNumberId?: string;
  providerMessageId?: string;
  timestamp?: string;
  attachments?: Array<{ name: string; url: string; mimeType?: string }>;
}

/** WhatsApp Cloud API channel (Meta Graph API). */
export class WhatsAppChannel implements Channel {
  readonly kind = 'whatsapp' as const;

  constructor(private readonly config: AppConfig) {}

  enabled(): boolean {
    return Boolean(this.config.whatsapp.token && this.config.whatsapp.phoneNumberId);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.enabled()) return { ok: false, detail: 'WhatsApp credentials not configured' };
    const url = `https://graph.facebook.com/v20.0/${this.config.whatsapp.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.whatsapp.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.externalId,
          type: 'text',
          text: { preview_url: true, body: message.text },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        return { ok: false, detail: payload.error?.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, providerId: payload.messages?.[0]?.id };
    } catch (error) {
      log.error('send failed', String(error));
      return { ok: false, detail: String(error) };
    }
  }
}

/**
 * Parse an inbound WhatsApp webhook body. Handles the official Cloud API
 * envelope *and* the flat shapes used by common bridges (Twilio, 360dialog,
 * Baileys wrappers) so any gateway can be pointed at Duty.
 */
export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppMessage[] {
  const results: ParsedWhatsAppMessage[] = [];
  if (!body || typeof body !== 'object') return results;
  const payload = body as Record<string, any>;

  // --- Official Cloud API envelope -----------------------------------------
  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const contacts: Array<{ profile?: { name?: string }; wa_id?: string }> = value.contacts ?? [];
        for (const message of value.messages ?? []) {
          if (message.type && message.type !== 'text' && message.type !== 'interactive' && message.type !== 'button') {
            continue;
          }
          const text =
            message.text?.body ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            message.button?.text ??
            '';
          if (!text) continue;
          const from = String(message.from ?? '');
          const contact = contacts.find((c) => c.wa_id === from);
          results.push({
            externalId: from,
            text: String(text),
            name: contact?.profile?.name,
            phoneNumberId: value.metadata?.phone_number_id,
            providerMessageId: message.id,
            timestamp: message.timestamp,
          });
        }
      }
    }
    return results;
  }

  // --- Generic bridge shapes ----------------------------------------------
  const candidates: unknown[] = Array.isArray(payload.messages) ? payload.messages : [payload];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const message = candidate as Record<string, any>;
    const from = message.from ?? message.wa_id ?? message.sender ?? message.phone;
    const text = message.text ?? message.body ?? message.message ?? message.text?.body;
    if (!from || typeof text !== 'string') continue;
    results.push({
      externalId: String(from),
      text,
      name: message.name ?? message.profile?.name,
      providerMessageId: message.id ?? message.messageId,
      timestamp: message.timestamp,
    });
  }
  return results;
}

export function toInbound(tenantId: string, parsed: ParsedWhatsAppMessage): InboundMessage {
  return {
    tenantId,
    channel: 'whatsapp',
    externalId: parsed.externalId,
    text: parsed.text,
    name: parsed.name,
    phone: parsed.externalId,
    attachments: parsed.attachments,
    metadata: {
      provider: 'whatsapp',
      providerMessageId: parsed.providerMessageId,
      timestamp: parsed.timestamp,
      phoneNumberId: parsed.phoneNumberId,
    },
  };
}
