import type Database from 'better-sqlite3';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import type { Clock } from './lib/clock.js';

/** Everything route modules need – passed explicitly (easy to fake in tests). */
export interface Deps {
  db: Db;
  sqlite: Database.Database;
  cfg: Config;
  clock: Clock;
  /** Key for encrypting secrets at rest (TOTP). */
  appKey: Buffer;
}
