/**
 * Consistent online backup of the SQLite database (also while the server runs).
 *   node server/dist/tools/backup.js <target-file>
 * Encryption and rotation are done by scripts/backup.sh (age).
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR ?? './data';
const source = process.env.DB_FILE ?? join(dataDir, 'pixel.db');
const target = process.argv[2];
if (!target) {
  console.error('Aufruf: backup.js <zieldatei>');
  process.exit(1);
}
const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();
console.warn(`Backup geschrieben: ${target}`);
