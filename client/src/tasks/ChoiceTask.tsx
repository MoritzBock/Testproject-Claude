import { useState } from 'preact/hooks';
import type { ChoiceView } from '@pixel/shared';
import { registerTaskRenderer, type TaskRendererProps } from './registry';

function ChoiceTask({ task, disabled, onChange }: TaskRendererProps<ChoiceView>) {
  const [sel, setSel] = useState<string[]>([]);
  const multiple = task.view.multiple;
  const toggle = (id: string) => {
    const next = multiple ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id];
    setSel(next);
    onChange({ selected: next }, next.length > 0);
  };
  return (
    <div class="choice" role={multiple ? 'group' : 'radiogroup'} aria-label="Antwortmöglichkeiten">
      <p class="note">
        {multiple ? 'Mehrere Antworten können richtig sein.' : 'Wähle eine Antwort.'}
      </p>
      {task.view.options.map((o, i) => {
        const on = sel.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            disabled={disabled}
            class={`choice-option ${on ? 'choice-on' : ''}`}
            onClick={() => toggle(o.id)}
          >
            <span class={`choice-mark ${multiple ? 'square' : 'round'}`} aria-hidden="true">
              {on ? (multiple ? '✓' : '●') : ''}
            </span>
            <span class="choice-key" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

registerTaskRenderer('choice', ChoiceTask);
