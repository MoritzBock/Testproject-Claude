import { z } from 'zod';
import { normalizeText, type ClozeAnswer, type ClozeView } from '@pixel/shared';
import { TaskBaseSchema, registerTaskType, shuffle } from './registry.js';

const GAP_RE = /\{\{([a-z0-9-]{1,20})\}\}/g;

const Schema = TaskBaseSchema.extend({
  type: z.literal('cloze'),
  /** Text with gaps like "Port {{p}} ist für HTTPS." */
  text: z.string().min(1).max(2000),
  gaps: z.record(
    z.string(),
    z.object({
      accepted: z.array(z.string().min(1).max(100)).min(1),
      caseSensitive: z.boolean().default(false),
      /** If set, the gap is a dropdown with these choices (accepted ones are added). */
      options: z.array(z.string().min(1).max(100)).optional(),
    }),
  ),
}).refine(
  (t) => [...t.text.matchAll(GAP_RE)].every((m) => m[1]! in t.gaps),
  'Jede Lücke im Text braucht eine Definition.',
);

type ClozeTask = z.infer<typeof Schema>;

registerTaskType<ClozeTask, null, ClozeAnswer>({
  type: 'cloze',
  label: 'Lückentext',
  schema: Schema as unknown as z.ZodType<ClozeTask>,
  answerSchema: z.object({ gaps: z.record(z.string().max(20), z.string().max(200)) }),
  toPublic(task, rand) {
    const segments: ClozeView['segments'] = [];
    let last = 0;
    for (const m of task.text.matchAll(GAP_RE)) {
      if (m.index! > last) segments.push({ t: 'text', text: task.text.slice(last, m.index) });
      const gap = task.gaps[m[1]!]!;
      const options = gap.options
        ? shuffle([...new Set([...gap.options, gap.accepted[0]!])], rand)
        : undefined;
      segments.push({ t: 'gap', id: m[1]!, ...(options ? { options } : {}) });
      last = m.index! + m[0].length;
    }
    if (last < task.text.length) segments.push({ t: 'text', text: task.text.slice(last) });
    return { view: { segments } satisfies ClozeView, secret: null };
  },
  evaluate(task, answer) {
    const ids = Object.keys(task.gaps);
    let right = 0;
    let firstWrong: string | undefined;
    for (const id of ids) {
      const g = task.gaps[id]!;
      const given = normalizeText(answer.gaps[id] ?? '', g.caseSensitive);
      if (g.accepted.some((a) => normalizeText(a, g.caseSensitive) === given)) right++;
      else firstWrong ??= `${id}=${given.slice(0, 40)}`;
    }
    return {
      score: ids.length ? right / ids.length : 0,
      wrongKey: firstWrong,
      detail: ids.length > 1 ? `${right} von ${ids.length} Lücken richtig` : undefined,
    };
  },
});
