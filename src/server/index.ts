import { createRuntime } from './runtime.js';
import { buildApp } from './app.js';
import { ensureDataDir } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('server');

async function main(): Promise<void> {
  const runtime = await createRuntime();
  ensureDataDir(runtime.config);

  if (runtime.config.adminToken === 'change-me-admin-token') {
    log.warn('ADMIN_TOKEN is still the default — change it before exposing Duty publicly');
  }

  const app = await buildApp(runtime);

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`received ${signal}, shutting down`);
    try {
      await app.close();
      await runtime.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: runtime.config.port, host: runtime.config.host });
  log.info(`Duty listening on ${runtime.config.publicUrl} (api on :${runtime.config.port})`);
  log.info(`dashboard: ${runtime.config.publicUrl}/?token=<ADMIN_TOKEN>`);
  log.info(`whatsapp webhook: ${runtime.config.publicUrl}/webhooks/whatsapp`);
  log.info(`inbound webhook:  ${runtime.config.publicUrl}/webhooks/inbound`);
}

main().catch((error) => {
  log.error('failed to start', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
