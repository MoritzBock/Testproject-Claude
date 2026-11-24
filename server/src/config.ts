import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Public origin (scheme + host + port) – used for CSRF origin checks later. */
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Directory for the SQLite database and other persistent data. */
  DATA_DIR: z.string().default('./data'),
  /** Directory of the built client (served by the app in production). */
  CLIENT_DIST: z.string().optional(),
  /**
   * Secure cookies. Must be true in production. Only Safari on plain http://localhost
   * needs `false` during local development.
   */
  COOKIE_SECURE: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Ungültige Konfiguration: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && !cfg.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE=false ist in Produktion nicht erlaubt.');
  }
  return cfg;
}
