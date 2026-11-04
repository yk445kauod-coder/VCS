import { EventEmitter } from 'node:events';
import { createLogger } from './logger.js';

export interface DutyEvents {
  'message.inbound': { tenantId: string; conversationId: string; channel: string; text: string };
  'message.outbound': { tenantId: string; conversationId: string; channel: string; text: string };
  'conversation.escalated': { tenantId: string; conversationId: string; reason: string };
  'order.created': { tenantId: string; orderId: string; total: number };
  'order.updated': { tenantId: string; orderId: string; status: string };
  'order.paid': { tenantId: string; orderId: string; total: number };
  'upsell.offered': { tenantId: string; orderId: string; sku: string; strategy: string };
  'upsell.accepted': { tenantId: string; orderId: string; sku: string; revenue: number };
  'report.generated': { tenantId: string; reportId: string; kind: string };
  'knowledge.ingested': { tenantId: string; documentId: string; source: string };
  'channel.error': { channel: string; error: string };
}

type Handler<K extends keyof DutyEvents> = (payload: DutyEvents[K]) => void | Promise<void>;

/** Small typed event bus. Keeps channels, commerce and analytics decoupled. */
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly log = createLogger('events');

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof DutyEvents>(event: K, handler: Handler<K>): () => void {
    const wrapped = (payload: DutyEvents[K]) => {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          result.catch((error) => this.log.error(`handler for ${String(event)} failed`, String(error)));
        }
      } catch (error) {
        this.log.error(`handler for ${String(event)} threw`, String(error));
      }
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  emit<K extends keyof DutyEvents>(event: K, payload: DutyEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

export const bus = new EventBus();
