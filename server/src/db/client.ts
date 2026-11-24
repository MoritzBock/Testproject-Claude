import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function openDb(file: string): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  // Deleted data is overwritten on disk (no forensic leftovers in free pages).
  sqlite.pragma('secure_delete = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, sqlite };
}
