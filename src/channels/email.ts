import type { AppConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Channel, OutboundMessage, SendResult } from './types.js';

const log = createLogger('email');

/**
 * Outbound email via an HTTP relay. Set `SMTP_URL` to a provider endpoint that
 * accepts `{ from, to, subject, text }` (Resend, Postmark, Mailgun, an internal
 * relay, ...) — no SMTP socket handling, which keeps the dependency tree small.
 */
export class EmailChannel implements Channel {
  readonly kind = 'email' as const;

  constructor(private readonly config: AppConfig) {}

  enabled(): boolean {
    return Boolean(this.config.smtpUrl);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.enabled()) return { ok: false, detail: 'SMTP_URL not configured' };
    const subject =
      typeof message.metadata?.subject === 'string' ? (message.metadata.subject as string) : 'Your Duty update';
    try {
      const response = await fetch(this.config.smtpUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.SMTP_TOKEN ? { authorization: `Bearer ${process.env.SMTP_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          from: this.config.emailFrom,
          to: message.externalId,
          subject,
          text: message.text,
        }),
      });
      return response.ok
        ? { ok: true, detail: `HTTP ${response.status}` }
        : { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      log.error('email send failed', String(error));
      return { ok: false, detail: String(error) };
    }
  }
}
