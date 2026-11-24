import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
mkdirSync(cfg.DATA_DIR, { recursive: true });

const app = await buildApp(cfg);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Server wird beendet');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: cfg.HOST, port: cfg.PORT });
