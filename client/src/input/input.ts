import { ACTIONS, type Action } from '@pixel/shared';
import { appState } from '../core/app-state';
import { getSettings } from '../core/settings-store';
import { normalizeMove } from './move';

/**
 * Unified input: keyboard (rebindable), gamepad (standard mapping) and touch controls.
 * Only key *states* are read – no typing is recorded or transmitted anywhere.
 */
class InputController {
  private down = new Set<string>();
  private pressed = new Set<Action>();
  private padPrev: boolean[] = [];
  private touchMove = { x: 0, y: 0 };
  private navAt = 0;
  /** UI can block game input (e.g. while a menu is open). */
  blocked: () => boolean = () => false;
  /** Called for gamepad B/Start while the game input is blocked (close menus). */
  onUiBack: () => void = () => {};

  attach(): void {
    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (this.blocked()) return;
      const action = this.actionFor(e.code);
      if (action) e.preventDefault();
      if (!e.repeat && action) this.pressed.add(action);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    window.addEventListener(
      'touchstart',
      () => {
        if (!appState.get().touchActive) appState.set({ touchActive: true });
      },
      { passive: true },
    );
  }

  reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.touchMove = { x: 0, y: 0 };
  }

  private actionFor(code: string): Action | null {
    const b = getSettings().controls.bindings;
    return ACTIONS.find((a) => b[a][0] === code || b[a][1] === code) ?? null;
  }

  private isDown(action: Action): boolean {
    const [k1, k2] = getSettings().controls.bindings[action];
    return (!!k1 && this.down.has(k1)) || (!!k2 && this.down.has(k2));
  }

  /** Call once per frame (polls the gamepad). */
  update(): void {
    const pad =
      typeof navigator.getGamepads === 'function' ? navigator.getGamepads().find((p) => p) : null;
    if (!pad) return;
    const btn = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => btn(i) && !this.padPrev[i];
    if (this.blocked()) {
      if (edge(1) || edge(9)) this.onUiBack();
      // Menu navigation with the gamepad: D-pad / stick moves the focus, A activates.
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dir =
        btn(12) || ay < -0.6
          ? -1
          : btn(13) || ay > 0.6
            ? 1
            : btn(14) || ax < -0.6
              ? -1
              : btn(15) || ax > 0.6
                ? 1
                : 0;
      const now = performance.now();
      if (dir !== 0 && now - this.navAt > 220) {
        this.navAt = now;
        moveFocus(dir);
      }
      if (dir === 0) this.navAt = 0;
      if (edge(0)) (document.activeElement as HTMLElement | null)?.click();
    } else {
      if (edge(0)) this.pressed.add('interact');
      if (edge(9)) this.pressed.add('pause');
      if (edge(8)) this.pressed.add('map');
    }
    this.padPrev = pad.buttons.map((b) => b.pressed);
  }

  /** Movement vector, length ≤ 1. */
  move(): { x: number; y: number } {
    if (this.blocked()) return { x: 0, y: 0 };
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    const pad =
      typeof navigator.getGamepads === 'function' ? navigator.getGamepads().find((p) => p) : null;
    if (pad) {
      x +=
        (pad.axes[0] ?? 0) +
        (pad.buttons[15]?.pressed ? 1 : 0) -
        (pad.buttons[14]?.pressed ? 1 : 0);
      y +=
        (pad.axes[1] ?? 0) +
        (pad.buttons[13]?.pressed ? 1 : 0) -
        (pad.buttons[12]?.pressed ? 1 : 0);
    }
    x += this.touchMove.x;
    y += this.touchMove.y;
    return normalizeMove(x, y);
  }

  /** Returns true once per press. */
  consume(action: Action): boolean {
    if (this.blocked()) {
      this.pressed.delete(action);
      return false;
    }
    const had = this.pressed.has(action);
    this.pressed.delete(action);
    return had;
  }

  setTouchMove(x: number, y: number): void {
    this.touchMove = { x, y };
  }

  pressVirtual(action: Action): void {
    if (!this.blocked()) this.pressed.add(action);
  }
}

/** Moves keyboard focus to the next/previous focusable control of the top-most dialog. */
function moveFocus(dir: number): void {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  const scope: ParentNode =
    dialogs[dialogs.length - 1] ?? document.getElementById('ui-root') ?? document;
  const items = [
    ...scope.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select, [tabindex="0"]',
    ),
  ].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[(i + dir + items.length) % items.length]?.focus();
}

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
  );
}

export const input = new InputController();
