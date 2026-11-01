import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createDatabase } from './db/index.js';
import { SessionRepository } from './db/repositories/sessions.js';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';

const db = createDatabase(config.dbFile);
const sessions = new SessionRepository(db);

const app = createApp({
  db,
  sessions,
  checkLlm: async () => ({ ok: false, latencyMs: null }),
});

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.host },
  () => {
    logger.info('server_started', {
      port: config.port,
      host: config.host,
      model: config.model,
      apiKeyPresent: config.apiKey.length > 0,
    });
  },
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info('server_stopping', { signal: sig });
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
