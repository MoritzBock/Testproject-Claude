import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** AES-256-GCM for small secrets (TOTP). Output: iv.tag.ciphertext (base64url). */
export function encryptSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(key: Buffer, data: string): string {
  const [iv, tag, enc] = data.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key, iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString('utf8');
}

/** Loads APP_SECRET or creates a key file (0600) in the data directory. */
export function loadAppKey(dataDir: string, envSecret?: string): Buffer {
  if (envSecret) return Buffer.from(envSecret, 'hex');
  const file = join(dataDir, 'app-secret.key');
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    /* not supported on all file systems */
  }
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Readable class code like "K7M-Q2P" (no 0/O, 1/I/L). */
export function generateJoinCode(): string {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}
