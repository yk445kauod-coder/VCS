import type { AppConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Channel, OutboundMessage, SendResult } from './types.js';
import { splitMessage } from './types.js';
import { WhatsAppChannel } from './whatsapp.js';
import { WebChatChannel } from './webchat.js';
import { WebhookChannel } from './webhook.js';
import { EmailChannel } from './email.js';

const log = createLogger('channels');

export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>();

  constructor(config: AppConfig) {
    this.register(new WhatsAppChannel(config));
    this.register(new WebChatChannel());
    this.register(new WebhookChannel());
    this.register(new EmailChannel(config));
  }

  register(channel: Channel): void {
    this.channels.set(channel.kind, channel);
  }

  get(kind: string): Channel | undefined {
    return this.channels.get(kind);
  }

  status(): Array<{ kind: string; enabled: boolean }> {
    return [...this.channels.values()].map((channel) => ({
      kind: channel.kind,
      enabled: channel.enabled(),
    }));
  }

  async deliver(message: OutboundMessage): Promise<SendResult> {
    const channel = this.channels.get(message.channel);
    if (!channel) {
      log.warn(`no channel registered for "${message.channel}"`);
      return { ok: false, detail: `unknown channel ${message.channel}` };
    }
    if (!channel.enabled()) {
      // Web chat and MCP replies are read back from the API, so this is normal.
      return { ok: false, detail: `channel ${message.channel} not configured for outbound` };
    }
    const results: SendResult[] = [];
    for (const part of splitMessage(message.text)) {
      results.push(await channel.send({ ...message, text: part }));
    }
    return results.every((result) => result.ok)
      ? { ok: true, detail: `sent ${results.length} part(s)` }
      : results.find((result) => !result.ok)!;
  }
}
