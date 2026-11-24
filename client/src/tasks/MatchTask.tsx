import { useRef, useState } from 'preact/hooks';
import type { MatchView } from '@pixel/shared';
import { registerTaskRenderer, type TaskRendererProps } from './registry';

/**
 * Drag & drop matching. Works with mouse, touch (pointer events) and keyboard /
 * tap: select a card, then select the target row.
 */
function MatchTask({ task, disabled, onChange }: TaskRendererProps<MatchView>) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const moved = useRef(false);

  const assign = (leftId: string, rightId: string) => {
    const next = { ...pairs };
    for (const [l, r] of Object.entries(next)) if (r === rightId) delete next[l];
    next[leftId] = rightId;
    setPairs(next);
    setPicked(null);
    onChange(
      { pairs: next },
      task.view.left.every((l) => next[l.id]),
    );
  };
  const unassign = (leftId: string) => {
    const next = { ...pairs };
    delete next[leftId];
    setPairs(next);
    onChange({ pairs: next }, false);
  };
  const used = new Set(Object.values(pairs));
  const text = (id: string) => task.view.right.find((r) => r.id === id)?.text ?? '';

  const onPointerDown = (e: PointerEvent, id: string) => {
    if (disabled) return;
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) moved.current = true;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return;
    const id = drag.id;
    setDrag(null);
    if (!moved.current) {
      setPicked(picked === id ? null : id); // tap = select
      return;
    }
    const target = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find(
      (el) => el.dataset.drop,
    );
    if (target?.dataset.drop) assign(target.dataset.drop, id);
  };

  const chip = (id: string) => (
    <button
      type="button"
      key={id}
      class={`match-chip ${picked === id ? 'match-picked' : ''} ${drag?.id === id && moved.current ? 'match-dragging' : ''}`}
      disabled={disabled}
      aria-pressed={picked === id}
      onPointerDown={(e) => onPointerDown(e, id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setPicked(picked === id ? null : id);
        }
      }}
    >
      {text(id)}
    </button>
  );

  return (
    <div class="match">
      <p class="note">
        Ziehe die Karten auf das passende Feld – oder tippe erst eine Karte und dann das Feld an.
      </p>
      <ul class="match-rows">
        {task.view.left.map((l) => (
          <li key={l.id} class="match-row">
            <span class="match-left">{l.text}</span>
            <button
              type="button"
              class={`match-drop ${pairs[l.id] ? 'match-filled' : ''} ${picked ? 'match-ready' : ''}`}
              data-drop={l.id}
              disabled={disabled}
              aria-label={`Feld für ${l.text}${pairs[l.id] ? `: ${text(pairs[l.id]!)}` : ', leer'}`}
              onClick={() => (picked ? assign(l.id, picked) : pairs[l.id] && unassign(l.id))}
            >
              {pairs[l.id] ? text(pairs[l.id]!) : '…'}
            </button>
          </li>
        ))}
      </ul>
      <div class="match-pool" aria-label="Karten">
        {task.view.right.filter((r) => !used.has(r.id)).map((r) => chip(r.id))}
      </div>
      {drag && moved.current && (
        <div
          class="match-ghost"
          style={{ left: `${drag.x}px`, top: `${drag.y}px` }}
          aria-hidden="true"
        >
          {text(drag.id)}
        </div>
      )}
    </div>
  );
}

registerTaskRenderer('match', MatchTask);
