import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  POLICY_KEYS,
  isValidPolicyValue,
  resolvePolicies,
  type PolicyKey,
  type PolicyMap,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import { groupMembers, groups, policies, users } from '../db/schema.js';
import { assertTeacherOfClass, assertTeacherOfStudent, requireRole } from '../auth/guards.js';
import type { AuthUser } from '../auth/types.js';
import { HttpError, forbidden, notFound, parse } from '../lib/http-error.js';
import { audit } from '../audit.js';

type Scope = { scopeType: 'global' | 'class' | 'group' | 'user'; scopeId: string };

function layer(deps: Deps, scopeType: Scope['scopeType'], scopeIds: string[]) {
  if (scopeIds.length === 0) return [];
  return deps.db
    .select()
    .from(policies)
    .where(and(eq(policies.scopeType, scopeType), inArray(policies.scopeId, scopeIds)))
    .all();
}

const toMap = (rows: Array<{ key: string; value: string }>) =>
  Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown])) as Partial<
    Record<PolicyKey, unknown>
  >;

/** Effective feature switches for one account. Staff are never restricted. */
export function effectivePolicies(deps: Deps, userId: string): PolicyMap {
  const u = deps.db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || u.role !== 'student') {
    return { ...resolvePolicies({ global: {}, class: {}, groups: [], user: {} }), frozen: false };
  }
  const groupIds = deps.db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .all()
    .map((g) => g.id);
  const groupRows = layer(deps, 'group', groupIds);
  return resolvePolicies({
    global: toMap(layer(deps, 'global', ['*'])),
    class: toMap(layer(deps, 'class', u.classId ? [u.classId] : [])),
    groups: groupIds.map((gid) => toMap(groupRows.filter((r) => r.scopeId === gid))),
    user: toMap(layer(deps, 'user', [userId])),
  });
}

export function setPolicy(
  deps: Deps,
  scope: Scope,
  key: PolicyKey,
  value: unknown | null,
  actor: AuthUser,
): void {
  if (value === null) {
    deps.db
      .delete(policies)
      .where(
        and(
          eq(policies.scopeType, scope.scopeType),
          eq(policies.scopeId, scope.scopeId),
          eq(policies.key, key),
        ),
      )
      .run();
  } else {
    if (!isValidPolicyValue(key, value))
      throw new HttpError(400, 'validation', `Ungültiger Wert für ${key}.`);
    const row = {
      ...scope,
      key,
      value: JSON.stringify(value),
      updatedBy: actor.id,
      updatedAt: deps.clock.now(),
    };
    deps.db
      .insert(policies)
      .values(row)
      .onConflictDoUpdate({
        target: [policies.scopeType, policies.scopeId, policies.key],
        set: { value: row.value, updatedBy: row.updatedBy, updatedAt: row.updatedAt },
      })
      .run();
  }
}

/** Checks that the actor may change policies for the given scope. */
export function assertScopeAccess(
  deps: Deps,
  actor: AuthUser,
  scope: Scope,
): { classId?: string | null; name?: string } {
  switch (scope.scopeType) {
    case 'global':
      if (actor.role !== 'superadmin')
        throw forbidden('Globale Einstellungen darf nur die Administration ändern.');
      return {};
    case 'class': {
      if (actor.role !== 'teacher') throw forbidden();
      const c = assertTeacherOfClass(deps, actor.id, scope.scopeId);
      return { classId: c.id, name: c.name };
    }
    case 'group': {
      const g = deps.db.select().from(groups).where(eq(groups.id, scope.scopeId)).get();
      if (!g || g.ownerId !== actor.id) throw notFound('Gruppe');
      return { name: g.name };
    }
    case 'user': {
      if (actor.role !== 'teacher') throw forbidden();
      const s = assertTeacherOfStudent(deps, actor.id, scope.scopeId);
      return { classId: s.classId, name: s.username };
    }
  }
}

const ScopeSchema = z.object({
  scopeType: z.enum(['global', 'class', 'group', 'user']),
  scopeId: z.string().min(1).max(64),
});

export function registerPolicyRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/api/policies/me', async (req) => {
    const u = requireRole(req, deps, 'student', 'teacher', 'superadmin');
    return effectivePolicies(deps, u.id);
  });

  /** Raw values set on one scope (for the dashboard editor). */
  app.get('/api/teacher/policies', async (req) => {
    const u = requireRole(req, deps, 'teacher', 'superadmin');
    const scope = parse(ScopeSchema, req.query);
    assertScopeAccess(deps, u, scope);
    return toMap(layer(deps, scope.scopeType, [scope.scopeId]));
  });

  /** Sets one switch for many targets at once (single learners, groups, classes). */
  app.post('/api/teacher/policies', async (req) => {
    const u = requireRole(req, deps, 'teacher', 'superadmin');
    const body = parse(
      z.object({
        targets: z.array(ScopeSchema).min(1).max(500),
        key: z.enum(POLICY_KEYS as [PolicyKey, ...PolicyKey[]]),
        value: z.unknown().nullable(),
      }),
      req.body,
    );
    const resolved = body.targets.map((t) => ({ t, info: assertScopeAccess(deps, u, t) }));
    deps.db.transaction(() => {
      for (const { t, info } of resolved) {
        setPolicy(deps, t, body.key, body.value, u);
        audit(
          deps,
          u,
          'policy.set',
          {
            userId: t.scopeType === 'user' ? t.scopeId : null,
            name: info.name,
            classId: info.classId ?? null,
          },
          { scope: t.scopeType, key: body.key, value: body.value },
        );
      }
    });
    return { ok: true, count: resolved.length };
  });
}
