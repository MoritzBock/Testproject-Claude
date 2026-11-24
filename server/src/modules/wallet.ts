import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { requireReady } from '../auth/guards.js';
import type { Deps } from '../deps.js';
import { transactions, wallets } from '../db/schema.js';
import { HttpError } from '../lib/http-error.js';

export function balance(deps: Deps, userId: string): { balance: number; totalEarned: number } {
  const w = deps.db.select().from(wallets).where(eq(wallets.userId, userId)).get();
  return { balance: w?.balance ?? 0, totalEarned: w?.totalEarned ?? 0 };
}

/**
 * Books a currency change (server-side only). Every booking is written to the ledger.
 * `ref` makes a booking idempotent: the same ref is never paid twice (returns false).
 * Must be called inside a DB transaction when combined with other writes.
 */
export function book(
  deps: Deps,
  userId: string,
  amount: number,
  reason: string,
  ref: string | null,
  actorId: string | null = null,
): boolean {
  if (!Number.isInteger(amount) || amount === 0) return false;
  const { db, clock } = deps;
  if (
    ref &&
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.ref, ref)))
      .get()
  )
    return false;
  const current = balance(deps, userId);
  const next = current.balance + amount;
  if (next < 0) throw new HttpError(400, 'validation', 'Nicht genug Bytes.');
  db.insert(wallets)
    .values({ userId, balance: next, totalEarned: current.totalEarned + Math.max(0, amount) })
    .onConflictDoUpdate({
      target: wallets.userId,
      set: { balance: next, totalEarned: current.totalEarned + Math.max(0, amount) },
    })
    .run();
  db.insert(transactions)
    .values({ userId, amount, reason, ref, actorId, balanceAfter: next, createdAt: clock.now() })
    .run();
  return true;
}

/** Consistency check: cached balance equals the sum of the ledger. */
export function verifyLedger(deps: Deps, userId: string): boolean {
  const sum = deps.db
    .select({ a: transactions.amount })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .all()
    .reduce((s, r) => s + r.a, 0);
  return sum === balance(deps, userId).balance;
}

export function registerWalletRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/api/wallet', async (req) => {
    const u = requireReady(req, deps);
    return balance(deps, u.id);
  });
}
