import type { FunctionComponent } from 'preact';
import type { PublicTask } from '@pixel/shared';

export interface TaskRendererProps<V = unknown> {
  task: PublicTask & { view: V };
  /** Disabled after the answer was checked. */
  disabled: boolean;
  /** Report the current answer; `complete` = everything filled in (enables "Prüfen"). */
  onChange: (answer: unknown, complete: boolean) => void;
}

const renderers = new Map<string, FunctionComponent<TaskRendererProps<never>>>();

/** Registers the client-side renderer of a task type (see docs/LEVEL_ERSTELLEN.md). */
export function registerTaskRenderer<V>(
  type: string,
  component: FunctionComponent<TaskRendererProps<V>>,
): void {
  renderers.set(type, component as unknown as FunctionComponent<TaskRendererProps<never>>);
}

export function getTaskRenderer(type: string) {
  return renderers.get(type);
}
