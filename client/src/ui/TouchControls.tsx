import { useRef, useState } from 'preact/hooks';
import { appState } from '../core/app-state';
import { settingsStore } from '../core/settings-store';
import { useStore } from '../core/store';
import { input } from '../input/input';

const RADIUS = 44;

const coarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Virtual joystick + action button for tablets and phones. */
export function TouchControls() {
  const mode = useStore(settingsStore, (s) => s.settings.controls.touchControls);
  const touchActive = useStore(appState, (s) => s.touchActive);
  const visible = mode === 'on' || (mode === 'auto' && (touchActive || coarsePointer()));
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  if (!visible) return null;

  const move = (e: PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    input.setTouchMove(dx / RADIUS, dy / RADIUS);
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.setTouchMove(0, 0);
  };

  return (
    <div class="touch-controls">
      <div
        class="joystick"
        ref={base}
        aria-hidden="true"
        onPointerDown={(e) => {
          pointer.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => pointer.current === e.pointerId && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div class="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        class="touch-action"
        aria-label="Aktion"
        onPointerDown={(e) => {
          e.preventDefault();
          input.pressVirtual('interact');
        }}
      >
        A
      </button>
    </div>
  );
}
