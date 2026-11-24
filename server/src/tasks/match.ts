import { z } from 'zod';
import type { MatchAnswer, MatchView } from '@pixel/shared';
import { TaskBaseSchema, opaque, registerTaskType, shuffle } from './registry.js';

const Schema = TaskBaseSchema.extend({
  type: z.literal('match'),
  pairs: z
    .array(z.object({ left: z.string().min(1).max(200), right: z.string().min(1).max(200) }))
    .min(2)
    .max(8),
});
type MatchTask = z.infer<typeof Schema>;
/** left opaque id → pair index, right opaque id → pair index */
type Secret = { left: Record<string, number>; right: Record<string, number> };

registerTaskType<MatchTask, Secret, MatchAnswer>({
  type: 'match',
  label: 'Zuordnen (Drag & Drop)',
  schema: Schema as unknown as z.ZodType<MatchTask>,
  answerSchema: z.object({ pairs: z.record(z.string().max(10), z.string().max(10)) }),
  toPublic(task, rand) {
    const idx = task.pairs.map((_, i) => i);
    const secret: Secret = { left: {}, right: {} };
    const left = idx.map((i) => {
      secret.left[`l${i + 1}`] = i;
      return { id: `l${i + 1}`, text: task.pairs[i]!.left };
    });
    const right = shuffle(idx, rand).map((orig, pos) => {
      secret.right[opaque(pos)] = orig;
      return { id: opaque(pos), text: task.pairs[orig]!.right };
    });
    return { view: { left, right } satisfies MatchView, secret };
  },
  evaluate(task, answer, secret) {
    let right = 0;
    const wrong: string[] = [];
    for (const [l, pairIdx] of Object.entries(secret.left)) {
      const r = answer.pairs[l];
      if (r !== undefined && secret.right[r] === pairIdx) right++;
      else wrong.push(`${pairIdx}>${r !== undefined ? (secret.right[r] ?? '?') : '-'}`);
    }
    const n = task.pairs.length;
    return {
      score: right / n,
      wrongKey: wrong.length ? `pairs:${wrong.slice(0, 4).join(',')}` : undefined,
      detail: `${right} von ${n} Zuordnungen richtig`,
    };
  },
});
