/** Rebindable input actions. Codes are `KeyboardEvent.code` values (layout independent). */
export const ACTIONS = ['up', 'down', 'left', 'right', 'interact', 'pause', 'map'] as const;
export type Action = (typeof ACTIONS)[number];

/** Two slots per action: primary and secondary key. */
export type Bindings = Record<Action, [string | null, string | null]>;

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Nach oben',
  down: 'Nach unten',
  left: 'Nach links',
  right: 'Nach rechts',
  interact: 'Interagieren',
  pause: 'Pause / Menü',
  map: 'Weltkarte',
};

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Space'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM', null],
};

export function cloneBindings(b: Bindings): Bindings {
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a] = [b[a][0], b[a][1]];
  return out;
}

export interface Conflict {
  code: string;
  slots: Array<{ action: Action; slot: 0 | 1 }>;
}

/** Returns every key code that is bound to more than one slot. */
export function findConflicts(b: Bindings): Conflict[] {
  const seen = new Map<string, Array<{ action: Action; slot: 0 | 1 }>>();
  for (const action of ACTIONS) {
    for (const slot of [0, 1] as const) {
      const code = b[action][slot];
      if (!code) continue;
      const list = seen.get(code) ?? [];
      list.push({ action, slot });
      seen.set(code, list);
    }
  }
  return [...seen.entries()]
    .filter(([, slots]) => slots.length > 1)
    .map(([code, slots]) => ({ code, slots }));
}

export interface AssignResult {
  bindings: Bindings;
  /** Set if the code was taken by another slot; the two slots were swapped. */
  swappedWith?: { action: Action; slot: 0 | 1; previousCode: string | null };
}

/**
 * Assigns `code` to `action`/`slot`. If the code is already used elsewhere, the slots
 * are swapped so that no conflict can arise (the UI tells the user about the swap).
 */
export function assignKey(b: Bindings, action: Action, slot: 0 | 1, code: string): AssignResult {
  const next = cloneBindings(b);
  const previousCode = next[action][slot];
  for (const other of ACTIONS) {
    for (const s of [0, 1] as const) {
      if ((other !== action || s !== slot) && next[other][s] === code) {
        next[other][s] = previousCode;
        next[action][slot] = code;
        // Avoid the same key twice within one action after swapping.
        if (other === action && next[action][0] === next[action][1]) next[action][s] = null;
        return { bindings: next, swappedWith: { action: other, slot: s, previousCode } };
      }
    }
  }
  next[action][slot] = code;
  return { bindings: next };
}

export function clearKey(b: Bindings, action: Action, slot: 0 | 1): Bindings {
  const next = cloneBindings(b);
  next[action][slot] = null;
  return next;
}

/** Actions that must always keep at least one key (otherwise the game is unplayable). */
export const REQUIRED_ACTIONS: readonly Action[] = [
  'up',
  'down',
  'left',
  'right',
  'interact',
  'pause',
];

export function missingRequired(b: Bindings): Action[] {
  return REQUIRED_ACTIONS.filter((a) => !b[a][0] && !b[a][1]);
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Leertaste',
  Enter: 'Enter',
  Escape: 'Esc',
  ShiftLeft: 'Umschalt links',
  ShiftRight: 'Umschalt rechts',
  ControlLeft: 'Strg links',
  ControlRight: 'Strg rechts',
  AltLeft: 'Alt',
  Tab: 'Tab',
  Backspace: 'Rücktaste',
};

/** Human readable German key name for a `KeyboardEvent.code`. */
export function keyLabel(code: string | null): string {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
