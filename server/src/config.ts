import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const int = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Public origin (scheme + host + port) – used for the CSRF origin check. */
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATA_DIR: z.string().default('./data'),
  /** ':memory:' for tests, otherwise a file inside DATA_DIR. */
  DB_FILE: z.string().optional(),
  CLIENT_DIST: z.string().optional(),
  COOKIE_SECURE: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** 64 hex chars (32 bytes). If unset, a key file is created in DATA_DIR. Encrypts TOTP secrets. */
  APP_SECRET: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  /** One-time token for creating the superadmin. If unset and no superadmin exists, one is generated and logged. */
  SETUP_TOKEN: z.string().min(16).optional(),
  /** Shown in the privacy notice (Art. 13 GDPR). */
  SCHOOL_NAME: z.string().default('[Name und Anschrift der Schule]'),
  SCHOOL_CONTACT: z.string().default('[Kontakt der Schulleitung]'),
  DPO_CONTACT: z.string().default('[Kontakt der/des Datenschutzbeauftragten der Schule]'),
  HOSTING_INFO: z.string().default('[Betreiber/Hoster des Servers, Standort EU]'),
  /** Version of the privacy notice; raising it forces everyone to confirm again. */
  PRIVACY_VERSION: int(1, 1),
  REQUIRE_STAFF_2FA: bool.default(false),
  /** Create demo accounts on an empty database (development only). */
  DEV_SEED: bool.default(true),

  SESSION_HOURS_STUDENT: int(12, 1),
  SESSION_HOURS_STAFF: int(8, 1),
  SESSION_IDLE_MINUTES: int(120, 5),
  LOGIN_MAX_FAILS: int(5, 1),
  LOGIN_LOCK_MINUTES: int(15, 1),

  // Retention (Löschfristen) – see jobs/retention.ts
  RETENTION_INACTIVE_DAYS: int(183, 30),
  RETENTION_WARN_DAYS: int(30, 1),
  RETENTION_ATTEMPTS_DAYS: int(56, 7),
  RETENTION_ACTIVITY_DAYS: int(365, 30),
  RETENTION_AUDIT_DAYS: int(365, 30),
  RETENTION_RUNS_DAYS: int(7, 1),
  SELF_DELETE_GRACE_DAYS: int(7, 0),
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
