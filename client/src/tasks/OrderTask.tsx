import { useEffect, useState } from 'preact/hooks';
import type { OrderView } from '@pixel/shared';
import { registerTaskRenderer, type TaskRendererProps } from './registry';

/** Sort a list: drag the handle (mouse/touch) or use the arrow buttons (keyboard). */
function OrderTask({ task, disabled, onChange }: TaskRendererProps<OrderView>) {
  const [items, setItems] = useState(task.view.items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  useEffect(() => onChange({ order: items.map((i) => i.id) }, true), [items]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    setItems(next);
  };

  return (
    <ol class="order-list">
      {items.map((it, i) => (
        <li
          key={it.id}
          class={`order-item ${dragIdx === i ? 'order-dragging' : ''}`}
          data-index={i}
        >
          <span
            class="order-handle"
            aria-hidden="true"
            onPointerDown={(e) => {
              if (disabled) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDragIdx(i);
            }}
            onPointerMove={(e) => {
              if (dragIdx === null) return;
              const el = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find(
                (x) => x.dataset.index,
              );
              const target = el ? Number(el.dataset.index) : dragIdx;
              if (target !== dragIdx) {
                move(dragIdx, target);
                setDragIdx(target);
              }
            }}
            onPointerUp={() => setDragIdx(null)}
            onPointerCancel={() => setDragIdx(null)}
          >
            ⋮⋮
          </span>
          <span class="order-num">{i + 1}.</span>
          <span class="order-text">{it.text}</span>
          <span class="order-buttons">
            <button
              type="button"
              class="btn btn-small"
              disabled={disabled || i === 0}
              aria-label={`${it.text} nach oben`}
              onClick={() => move(i, i - 1)}
            >
              ▲
            </button>
            <button
              type="button"
              class="btn btn-small"
              disabled={disabled || i === items.length - 1}
              aria-label={`${it.text} nach unten`}
              onClick={() => move(i, i + 1)}
            >
              ▼
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}

registerTaskRenderer('order', OrderTask);
