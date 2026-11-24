import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  title: string;
  onClose?: () => void;
  wide?: boolean;
  children: ComponentChildren;
}

/** Accessible dialog: focuses its first control, closable via button. */
export function Modal({ title, onClose, wide, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, [tabindex="0"]',
    );
    first?.focus();
  }, []);
  return (
    <div class="modal-backdrop">
      <div
        class={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header class="modal-header">
          <h2>{title}</h2>
          {onClose && (
            <button class="btn btn-ghost" onClick={onClose} aria-label="Schließen">
              ✕
            </button>
          )}
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
