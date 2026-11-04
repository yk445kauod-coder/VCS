import { createLogger } from '../core/logger.js';
import type { Channel, OutboundMessage, SendResult } from './types.js';

const log = createLogger('webchat');

/**
 * Web chat is pull-based: the visitor's browser polls (or subscribes to SSE)
 * for new agent messages, so there is nothing to push here. The class exists so
 * the registry has a uniform interface and the dashboard can report status.
 */
export class WebChatChannel implements Channel {
  readonly kind = 'webchat' as const;

  enabled(): boolean {
    return true;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    log.debug(`queued web-chat reply for ${message.conversationId}`);
    return { ok: true, detail: 'delivered to web session' };
  }
}
