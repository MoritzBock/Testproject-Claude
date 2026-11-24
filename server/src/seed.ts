import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { seedDemo } from './dev-seed.js';
import { systemClock } from './lib/clock.js';
import { loadAppKey } from './lib/crypto.js';

const cfg = loadConfig();
if (cfg.NODE_ENV === 'production') {
  console.error('Demo-Daten dürfen in Produktion nicht angelegt werden.');
  process.exit(1);
}
mkdirSync(cfg.DATA_DIR, { recursive: true });
const { db, sqlite } = openDb(cfg.DB_FILE ?? join(cfg.DATA_DIR, 'pixel.db'));
const deps = {
  db,
  sqlite,
  cfg,
  clock: systemClock,
  appKey: loadAppKey(cfg.DATA_DIR, cfg.APP_SECRET),
};
const created = await seedDemo(deps);
console.warn(created ? 'Demo-Daten angelegt.' : 'Datenbank ist nicht leer – nichts angelegt.');
