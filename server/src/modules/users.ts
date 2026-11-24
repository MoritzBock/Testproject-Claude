import { and, eq } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import { auditLog, levelOverrides, policies, users } from '../db/schema.js';

/**
 * Deletes an account with ALL personal data. Most tables cascade via foreign keys;
 * scope-based rows and audit references are cleaned explicitly. Anonymous class
 * statistics (task_stats_anon) are kept – they contain no person reference.
 */
export function deleteUserCompletely(deps: Deps, userId: string): void {
  const { db } = deps;
  db.transaction(() => {
    db.delete(policies)
      .where(and(eq(policies.scopeType, 'user'), eq(policies.scopeId, userId)))
      .run();
    db.delete(levelOverrides)
      .where(and(eq(levelOverrides.scopeType, 'user'), eq(levelOverrides.scopeId, userId)))
      .run();
    // Audit entries stay for accountability, but no longer point to the person.
    db.update(auditLog)
      .set({ targetUserId: null, targetName: '(gelöschtes Konto)' })
      .where(eq(auditLog.targetUserId, userId))
      .run();
    db.update(auditLog).set({ actorId: null }).where(eq(auditLog.actorId, userId)).run();
    db.delete(users).where(eq(users.id, userId)).run();
  });
}
