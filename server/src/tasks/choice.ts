import { z } from 'zod';
import type { ChoiceAnswer, ChoiceView } from '@pixel/shared';
import { TaskBaseSchema, opaque, registerTaskType, shuffle } from './registry.js';

const Schema = TaskBaseSchema.extend({
  type: z.literal('choice'),
  options: z
    .array(z.object({ text: z.string().min(1).max(300), correct: z.boolean().default(false) }))
    .min(2)
    .max(8),
  /** Multiple selection allowed (default: true if more than one option is correct). */
  multiple: z.boolean().optional(),
  shuffle: z.boolean().default(true),
}).refine((t) => t.options.some((o) => o.correct), 'Mindestens eine Antwort muss richtig sein.');

type ChoiceTask = z.infer<typeof Schema>;
/** Secret: opaque id → original option index. */
type Secret = Record<string, number>;

registerTaskType<ChoiceTask, Secret, ChoiceAnswer>({
  type: 'choice',
  label: 'Multiple Choice (Einfach- oder Mehrfachauswahl)',
  schema: Schema as unknown as z.ZodType<ChoiceTask>,
  answerSchema: z.object({ selected: z.array(z.string().max(10)).max(8) }),
  toPublic(task, rand) {
    const idx = task.options.map((_, i) => i);
    const order = task.shuffle ? shuffle(idx, rand) : idx;
    const secret: Secret = {};
    const options = order.map((orig, pos) => {
      secret[opaque(pos)] = orig;
      return { id: opaque(pos), text: task.options[orig]!.text };
    });
    const multiple = task.multiple ?? task.options.filter((o) => o.correct).length > 1;
    return { view: { options, multiple } satisfies ChoiceView, secret };
  },
  evaluate(task, answer, secret) {
    const chosen = new Set(answer.selected.filter((id) => id in secret).map((id) => secret[id]!));
    const correct = new Set(task.options.flatMap((o, i) => (o.correct ? [i] : [])));
    const exact = chosen.size === correct.size && [...chosen].every((i) => correct.has(i));
    return {
      score: exact ? 1 : 0,
      wrongKey: exact ? undefined : `opt:${[...chosen].sort((a, b) => a - b).join(',') || '-'}`,
    };
  },
});
