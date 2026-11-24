/**
 * Database schema (SQLite via Drizzle; portable to PostgreSQL).
 *
 * Privacy legend in the comments:
 *   [PB]  personal data (pseudonymous – still personal under Art. 4 No. 5 GDPR)
 *   [ANON] anonymous / aggregated, no reference to a person
 *   Retention ("Löschfrist") is documented per table and enforced in jobs/retention.ts.
 * Full overview: docs/datenschutz/01_Datenuebersicht.md
 *
 * Deliberately NOT stored anywhere: real names, e-mail, birth date, photos, IP addresses,
 * user agents, world positions, mouse/keyboard input.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'number' });
const bool = (name: string) => integer(name, { mode: 'boolean' });

/** [PB] Accounts. Löschfrist: 6 Monate nach letzter Aktivität oder auf Antrag. */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    role: text('role', { enum: ['student', 'teacher', 'superadmin'] }).notNull(),
    /** Pseudonym chosen/generated – never a real name. */
    username: text('username').notNull(),
    /** Lower-case username for case-insensitive uniqueness. */
    usernameKey: text('username_key').notNull(),
    /** Students belong to exactly one class; staff have null. */
    classId: text('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: bool('must_change_password').notNull().default(true),
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabled: bool('totp_enabled').notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: ts('locked_until'),
    status: text('status', { enum: ['active', 'locked', 'archived'] })
      .notNull()
      .default('active'),
    privacyAckVersion: integer('privacy_ack_version'),
    privacyAckAt: ts('privacy_ack_at'),
    lastActiveAt: ts('last_active_at').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('users_class_username').on(t.classId, t.usernameKey),
    index('users_last_active').on(t.lastActiveAt),
  ],
);

/** [PB] Server-side sessions. Only a hash of the token is stored. Löschfrist: Ablauf (max. 12 h). */
export const sessions = sqliteTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

/** Classes (no personal data). Deleted by the teacher. */
export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  schoolYear: text('school_year').notNull(),
  joinCode: text('join_code').notNull().unique(),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull(),
});

/** [PB] Which teacher manages which class. */
export const classTeachers = sqliteTable(
  'class_teachers',
  {
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.classId, t.teacherId] })],
);

/** Free groups of learners defined by a teacher (e.g. "FISI A"). */
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
});

/** [PB] Group membership. */
export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

/** Feature switches per scope; [PB] when scope_type = 'user'. Deleted with the scope. */
export const policies = sqliteTable(
  'policies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scopeType: text('scope_type', { enum: ['global', 'class', 'group', 'user'] }).notNull(),
    scopeId: text('scope_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(), // JSON
    updatedBy: text('updated_by'),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [uniqueIndex('policies_scope_key').on(t.scopeType, t.scopeId, t.key)],
);

/** [PB] Optional short organisational note by the teacher (≤ 200 chars). Deleted with the account. */
export const teacherNotes = sqliteTable('teacher_notes', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  authorId: text('author_id'),
  updatedAt: ts('updated_at').notNull(),
});

/** [PB] Game settings per account (audio, keys, accessibility). */
export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  json: text('json').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/** [PB] Avatar appearance. */
export const characters = sqliteTable('characters', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  skinTone: integer('skin_tone').notNull(),
  equipped: text('equipped').notNull(), // JSON slot → itemId
  createdAt: ts('created_at').notNull(),
});

/** [PB] Owned items. */
export const inventory = sqliteTable(
  'inventory',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    source: text('source').notNull(),
    acquiredAt: ts('acquired_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

/** [PB] Currency balance (cache of the ledger). */
export const wallets = sqliteTable('wallets', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  totalEarned: integer('total_earned').notNull().default(0),
});

/** [PB] Transaction ledger (anti-cheat). `ref` makes rewards idempotent. Deleted with the account. */
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    ref: text('ref'),
    actorId: text('actor_id'),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('transactions_user_ref')
      .on(t.userId, t.ref)
      .where(sql`ref IS NOT NULL`),
    index('transactions_user').on(t.userId),
  ],
);

/** [PB] Pity counters per loot box type. */
export const lootboxPity = sqliteTable(
  'lootbox_pity',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boxId: text('box_id').notNull(),
    counter: integer('counter').notNull().default(0),
    opened: integer('opened').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.boxId] })],
);

/** [PB] Unopened boxes granted by a teacher (spawnbox). */
export const pendingBoxes = sqliteTable('pending_boxes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  boxId: text('box_id').notNull(),
  createdAt: ts('created_at').notNull(),
});

/** [PB] Learning progress per level. */
export const levelProgress = sqliteTable(
  'level_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    levelId: text('level_id').notNull(),
    status: text('status', { enum: ['started', 'completed'] }).notNull(),
    bestStars: integer('best_stars').notNull().default(0),
    /** Stars for which the reward has already been paid (no double payout). */
    rewardedStars: integer('rewarded_stars').notNull().default(0),
    completionRewarded: bool('completion_rewarded').notNull().default(false),
    runs: integer('runs').notNull().default(0),
    totalTimeMs: integer('total_time_ms').notNull().default(0),
    firstStartedAt: ts('first_started_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.levelId] })],
);

/** [PB] Running level attempt (server-side state, timing). Löschfrist: 7 Tage. */
export const levelRuns = sqliteTable('level_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  levelId: text('level_id').notNull(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  state: text('state').notNull(), // JSON
});

/** Teacher unlock/lock of levels for a learner, group or class. */
export const levelOverrides = sqliteTable(
  'level_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scopeType: text('scope_type', { enum: ['user', 'group', 'class'] }).notNull(),
    scopeId: text('scope_id').notNull(),
    levelId: text('level_id').notNull(),
    mode: text('mode', { enum: ['unlock', 'lock'] }).notNull(),
    actorId: text('actor_id'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('level_overrides_scope').on(t.scopeType, t.scopeId, t.levelId)],
);

/** [PB] Detailed attempts per task. Löschfrist: nach 8 Wochen aggregiert und gelöscht. */
export const taskAttempts = sqliteTable(
  'task_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    classId: text('class_id'),
    levelId: text('level_id').notNull(),
    taskId: text('task_id').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    correct: bool('correct').notNull(),
    points: integer('points').notNull(),
    maxPoints: integer('max_points').notNull(),
    hintsUsed: integer('hints_used').notNull(),
    durationMs: integer('duration_ms').notNull(),
    /** Only option ids / short normalised text of a wrong answer (for "most common mistakes"). */
    wrongAnswerKey: text('wrong_answer_key'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('task_attempts_user').on(t.userId), index('task_attempts_created').on(t.createdAt)],
);

/** [PB] Long-term per-person task summary (no timeline). Deleted with the account. */
export const taskStatsUser = sqliteTable(
  'task_stats_user',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    levelId: text('level_id').notNull(),
    taskId: text('task_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    hints: integer('hints').notNull().default(0),
    timeSumMs: integer('time_sum_ms').notNull().default(0),
    lastAt: ts('last_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.levelId, t.taskId] })],
);

/** [ANON] Aggregated statistics per class and task (no person reference). */
export const taskStatsAnon = sqliteTable(
  'task_stats_anon',
  {
    classId: text('class_id').notNull(),
    levelId: text('level_id').notNull(),
    taskId: text('task_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    hints: integer('hints').notNull().default(0),
    timeSumMs: integer('time_sum_ms').notNull().default(0),
    wrongAnswers: text('wrong_answers').notNull().default('{}'), // JSON key → count
  },
  (t) => [primaryKey({ columns: [t.classId, t.levelId, t.taskId] })],
);

/** [PB] Online minutes per day (heartbeat, aggregated). Löschfrist: 12 Monate. */
export const activityDaily = sqliteTable(
  'activity_daily',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: text('day').notNull(), // YYYY-MM-DD
    minutes: integer('minutes').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** [PB] Unlocked achievements. */
export const achievements = sqliteTable(
  'achievements',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').notNull(),
    unlockedAt: ts('unlocked_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

/** [PB] Audit log of admin actions. Löschfrist: 12 Monate. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    targetUserId: text('target_user_id'),
    targetName: text('target_name'),
    targetClassId: text('target_class_id'),
    params: text('params').notNull().default('{}'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('audit_created').on(t.createdAt), index('audit_class').on(t.targetClassId)],
);

/** [PB] Self-service deletion requests (7-day grace period). */
export const deletionRequests = sqliteTable('deletion_requests', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  requestedAt: ts('requested_at').notNull(),
  executeAt: ts('execute_at').notNull(),
});

/** Technical key/value store (setup state, last job runs). */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
