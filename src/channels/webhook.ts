import { createLogger } from '../core/logger.js';
import type { Channel, OutboundMessage, SendResult } from './types.js';

const log = createLogger('webhook');

/**
 * Generic outbound webhook. A tenant registers `settings.outboundWebhookUrl`
 * (optionally with `settings.outboundWebhookSecret`) and every agent reply is
 * POSTed there — this is how Duty integrates with Zapier, n8n, Make, a custom
 * site, or an internal CRM without writing a channel adapter.
 */
export class WebhookChannel implements Channel {
  readonly kind = 'webhook' as const;

  enabled(): boolean {
    return true;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const url = message.metadata?.outboundWebhookUrl;
    if (typeof url !== 'string' || !url) {
      return { ok: false, detail: 'no outboundWebhookUrl configured for this tenant' };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(typeof message.metadata?.outboundWebhookSecret === 'string'
            ? { 'x-duty-secret': message.metadata.outboundWebhookSecret as string }
            : {}),
        },
        body: JSON.stringify({
          event: 'message.outbound',
          tenantId: message.tenantId,
          conversationId: message.conversationId,
          channel: message.channel,
          to: message.externalId,
          text: message.text,
          attachments: message.attachments ?? [],
          sentAt: new Date().toISOString(),
        }),
      });
      return response.ok
        ? { ok: true, detail: `HTTP ${response.status}` }
        : { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      log.error('outbound webhook failed', String(error));
      return { ok: false, detail: String(error) };
    }
  }
}
