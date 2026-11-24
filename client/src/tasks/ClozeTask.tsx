import { useState } from 'preact/hooks';
import type { ClozeView } from '@pixel/shared';
import { registerTaskRenderer, type TaskRendererProps } from './registry';

function ClozeTask({ task, disabled, onChange }: TaskRendererProps<ClozeView>) {
  const [gaps, setGaps] = useState<Record<string, string>>({});
  const ids = task.view.segments.flatMap((s) => (s.t === 'gap' ? [s.id] : []));
  const set = (id: string, v: string) => {
    const next = { ...gaps, [id]: v };
    setGaps(next);
    onChange(
      { gaps: next },
      ids.every((g) => (next[g] ?? '').trim() !== ''),
    );
  };
  let n = 0;
  return (
    <p class="cloze">
      {task.view.segments.map((s, i) => {
        if (s.t === 'text') return <span key={i}>{s.text}</span>;
        n++;
        const label = `Lücke ${n}`;
        return s.options ? (
          <select
            key={i}
            aria-label={label}
            disabled={disabled}
            value={gaps[s.id] ?? ''}
            onChange={(e) => set(s.id, (e.target as HTMLSelectElement).value)}
          >
            <option value="">– bitte wählen –</option>
            {s.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={i}
            aria-label={label}
            disabled={disabled}
            autoComplete="off"
            spellcheck={false}
            value={gaps[s.id] ?? ''}
            size={Math.max(6, (gaps[s.id] ?? '').length + 2)}
            onInput={(e) => set(s.id, (e.target as HTMLInputElement).value)}
          />
        );
      })}
    </p>
  );
}

registerTaskRenderer('cloze', ClozeTask);
