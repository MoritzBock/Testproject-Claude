import { z } from 'zod';
import type { OrderAnswer, OrderView } from '@pixel/shared';
import { TaskBaseSchema, opaque, registerTaskType, shuffle } from './registry.js';

const Schema = TaskBaseSchema.extend({
  type: z.literal('order'),
  /** Items in the CORRECT order. */
  items: z.array(z.string().min(1).max(200)).min(2).max(10),
});
type OrderTask = z.infer<typeof Schema>;
type Secret = Record<string, number>; // opaque id → correct position

registerTaskType<OrderTask, Secret, OrderAnswer>({
  type: 'order',
  label: 'Reihenfolge sortieren',
  schema: Schema as unknown as z.ZodType<OrderTask>,
  answerSchema: z.object({ order: z.array(z.string().max(10)).max(10) }),
  toPublic(task, rand) {
    const idx = task.items.map((_, i) => i);
    let order = shuffle(idx, rand);
    // never start in the correct order
    if (order.every((v, i) => v === i)) order = [...order.slice(1), order[0]!];
    const secret: Secret = {};
    const items = order.map((orig, pos) => {
      secret[opaque(pos)] = orig;
      return { id: opaque(pos), text: task.items[orig]! };
    });
    return { view: { items } satisfies OrderView, secret };
  },
  evaluate(task, answer, secret) {
    const n = task.items.length;
    const valid =
      answer.order.length === n &&
      new Set(answer.order).size === n &&
      answer.order.every((id) => id in secret);
    if (!valid) return { score: 0, wrongKey: 'invalid' };
    const positions = answer.order.map((id) => secret[id]!);
    const right = positions.filter((p, i) => p === i).length;
    return {
      score: right / n,
      wrongKey: right === n ? undefined : `order:${positions.join(',')}`,
      detail: `${right} von ${n} an der richtigen Stelle`,
    };
  },
});
