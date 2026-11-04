/**
 * A small fixed-window rate limiter for the endpoints that are reachable
 * without a credential.
 *
 * Every message posted to /api/webchat/message runs the agent, and when an LLM
 * is configured that costs money. The endpoint is deliberately public — it is
 * what the embeddable widget calls — so without a limiter anyone who finds the
 * URL can drive unbounded inference spend and fill the database with
 * conversations. The same applies to the inbound webhook endpoints.
 *
 * This is per-process and in-memory: it protects a single instance from a
 * runaway client, which is the realistic threat for a self-hosted deployment.
 * A multi-instance deployment should put the limit in front of the fleet (an
 * ingress or a shared store) rather than relying on this.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per window, per key. */
  max: number;
  /** Derives the bucket key; defaults to the client address. */
  key?: (request: FastifyRequest) => string;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, options: RateLimitOptions): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drop windows that have already expired so the map cannot grow forever. */
  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

/**
 * Build a Fastify `onRequest` hook that rejects over-limit callers with 429 and
 * a `Retry-After` header.
 */
export function rateLimitHook(limiter: RateLimiter, options: RateLimitOptions) {
  const deriveKey =
    options.key ?? ((request: FastifyRequest) => request.ip || 'unknown');

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { allowed, retryAfterSeconds } = limiter.check(deriveKey(request), options);
    if (allowed) return;
    await reply
      .code(429)
      .header('retry-after', String(retryAfterSeconds))
      .send({
        error: {
          code: 'rate_limited',
          message: `Too many requests. Try again in ${retryAfterSeconds}s.`,
        },
      });
  };
}
