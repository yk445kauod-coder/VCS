import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { isDutyError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { bus } from '../core/events.js';
import type { Runtime } from './runtime.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerPublicRoutes } from './routes/public.js';

const log = createLogger('http');

const PUBLIC_PREFIXES = [
  '/api/health',
  '/api/webchat',
  '/api/public',
  '/webhooks',
  '/mcp',
  '/widget',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function extractAdminToken(request: FastifyRequest): string | null {
  const header = request.headers['x-admin-token'];
  if (typeof header === 'string' && header) return header;
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  const query = request.query as Record<string, unknown> | undefined;
  if (query && typeof query.token === 'string') return query.token;
  return null;
}

export async function buildApp(runtime: Runtime): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: runtime.config.corsOrigin === '*' ? true : runtime.config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0];
    if (!pathname.startsWith('/api') || isPublic(pathname)) return;
    const token = extractAdminToken(request);
    if (token !== runtime.config.adminToken) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid or missing admin token' } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (isDutyError(error)) {
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    log.error(`${request.method} ${request.url} failed`, error instanceof Error ? error.message : String(error));
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];
    if (pathname.startsWith('/api') || pathname.startsWith('/webhooks')) {
      return reply.code(404).send({ error: { code: 'not_found', message: `No route for ${pathname}` } });
    }
    const indexPath = path.resolve(process.cwd(), 'web-dist/index.html');
    if (existsSync(indexPath)) return reply.type('text/html').send(readFileSync(indexPath));
    return reply
      .code(404)
      .type('text/html')
      .send('<h1>Duty</h1><p>Dashboard not built yet. Run <code>npm run build:web</code>.</p>');
  });

  // Server-sent events: the dashboard subscribes for live conversation/order activity.
  app.get('/api/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    const forward = (event: string) => (payload: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    const subscriptions = (
      [
        'message.inbound',
        'message.outbound',
        'order.created',
        'order.updated',
        'order.paid',
        'upsell.offered',
        'upsell.accepted',
        'conversation.escalated',
        'report.generated',
        'knowledge.ingested',
      ] as const
    ).map((event) => bus.on(event, forward(event)));

    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      subscriptions.forEach((unsubscribe) => unsubscribe());
    });
    return reply;
  });

  registerPublicRoutes(app, runtime);
  registerAdminRoutes(app, runtime);

  const webDist = path.resolve(process.cwd(), 'web-dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    await app.register(fastifyStatic, {
      root: path.resolve(process.cwd(), 'public'),
      prefix: '/widget/',
      decorateReply: false,
    });
    log.info('serving dashboard from web-dist');
  } else {
    await app.register(fastifyStatic, { root: path.resolve(process.cwd(), 'public'), prefix: '/widget/' });
  }

  return app;
}

export type { FastifyReply, FastifyRequest };
