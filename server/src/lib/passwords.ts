import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

// Argon2id (algorithm 2), OWASP recommendation: m=19 MiB, t=2, p=1.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function verifyPassword(hashStr: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

/** Hash of a random password – used to equalise timing for unknown users. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword('dummy-password-for-timing'));

// Simple, unambiguous German words (no umlauts) for printable start passwords.
const WORDS = [
  'Apfel',
  'Birne',
  'Wolke',
  'Tiger',
  'Panda',
  'Kiwi',
  'Sonne',
  'Mond',
  'Stern',
  'Insel',
  'Kabel',
  'Pixel',
  'Daten',
  'Router',
  'Modem',
  'Server',
  'Laser',
  'Robbe',
  'Adler',
  'Biber',
  'Dachs',
  'Eule',
  'Fuchs',
  'Hase',
  'Igel',
  'Koala',
  'Lama',
  'Otter',
  'Rabe',
  'Wal',
  'Zebra',
  'Kekse',
  'Nudel',
  'Pizza',
  'Tomate',
  'Berg',
  'Fluss',
  'Wald',
  'Strand',
  'Welle',
  'Blitz',
  'Regen',
  'Nebel',
  'Feder',
  'Kompass',
  'Anker',
  'Rakete',
  'Komet',
];

/** e.g. "Tiger-Wolke-47" – easy to read and type, ≥ 10 characters. */
export function generateStartPassword(): string {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${randomInt(10, 100)}`;
}

const ADJ = ['flink', 'mutig', 'schlau', 'ruhig', 'wach', 'kühn', 'froh', 'klug', 'fix', 'cool'];
const NOUN = [
  'Fuchs',
  'Biber',
  'Eule',
  'Otter',
  'Rabe',
  'Panda',
  'Lama',
  'Igel',
  'Dachs',
  'Robbe',
  'Adler',
  'Hase',
];
/** Random pseudonym suggestion, e.g. "SchlauerFuchs42" (ASCII only). */
export function generatePseudonym(): string {
  const a = ADJ[randomInt(ADJ.length)]!.replace('ü', 'ue');
  return `${a[0]!.toUpperCase()}${a.slice(1)}${NOUN[randomInt(NOUN.length)]}${randomInt(10, 100)}`;
}
