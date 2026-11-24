import type { ZodType } from 'zod';
import { z } from 'zod';

/** Fields every task has (authoring format in the level JSON). */
export const TaskBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Aufgaben-ID: Kleinbuchstaben, Ziffern, Bindestrich'),
  type: z.string(),
  prompt: z.string().min(1).max(1000),
  hints: z.array(z.string().min(1).max(500)).max(5).default([]),
  points: z.number().int().min(1).max(100).default(10),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  feedback: z
    .object({ correct: z.string().max(500).optional(), wrong: z.string().max(500).optional() })
    .default({}),
  /** Shown once the task is finished (after the last attempt or when correct). */
  explanation: z.string().max(1000).optional(),
});
export type TaskBase = z.infer<typeof TaskBaseSchema>;

export interface Evaluation {
  /** 0..1 */
  score: number;
  /** Short, non-identifying key of a wrong answer for the "most common mistakes" statistics. */
  wrongKey?: string;
  /** Optional detail like "2 von 3 Lücken richtig". */
  detail?: string;
}

/**
 * A task type plugin. `toPublic` produces what the client may see plus a per-run
 * `secret` (e.g. the mapping of shuffled, opaque ids) that stays on the server.
 */
export interface TaskType<T extends TaskBase = TaskBase, S = unknown, A = unknown> {
  type: string;
  label: string;
  schema: ZodType<T>;
  answerSchema: ZodType<A>;
  toPublic(task: T, rand: () => number): { view: unknown; secret: S };
  evaluate(task: T, answer: A, secret: S): Evaluation;
}

const registry = new Map<string, TaskType>();

export function registerTaskType<T extends TaskBase, S, A>(t: TaskType<T, S, A>): void {
  if (registry.has(t.type)) throw new Error(`Aufgabentyp ${t.type} doppelt registriert`);
  registry.set(t.type, t as unknown as TaskType);
}

export function getTaskType(type: string): TaskType {
  const t = registry.get(type);
  if (!t) throw new Error(`Unbekannter Aufgabentyp "${type}"`);
  return t;
}

export const taskTypes = () => [...registry.values()];

/** Fisher-Yates shuffle with injectable randomness. */
export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Opaque ids ("o1", "o2", …) so that ids never reveal the solution. */
export const opaque = (i: number) => `o${i + 1}`;
