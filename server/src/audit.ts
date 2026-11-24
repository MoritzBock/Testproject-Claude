import type { Deps } from './deps.js';
import { auditLog } from './db/schema.js';
import type { AuthUser } from './auth/types.js';

/** Records an admin action: who, what, when, on whom. No passwords or secrets in params. */
export function audit(
  deps: Deps,
  actor: Pick<AuthUser, 'id' | 'username'> | null,
  action: string,
  target: { userId?: string | null; name?: string | null; classId?: string | null } = {},
  params: Record<string, unknown> = {},
): void {
  deps.db
    .insert(auditLog)
    .values({
      actorId: actor?.id ?? null,
      actorName: actor?.username ?? 'System',
      action,
      targetUserId: target.userId ?? null,
      targetName: target.name ?? null,
      targetClassId: target.classId ?? null,
      params: JSON.stringify(params),
      createdAt: deps.clock.now(),
    })
    .run();
}
