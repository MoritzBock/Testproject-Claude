import { useEffect, useState } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: (s: T) => void): () => void;
}

/** Minimal observable store shared by Phaser scenes and Preact components. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<(s: T) => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Preact hook: re-renders when the selected slice changes (shallow compare). */
export function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  const [value, setValue] = useState(() => select(store.get()));
  useEffect(() => {
    let current = select(store.get());
    setValue(() => current);
    return store.subscribe((s) => {
      const next = select(s);
      if (!Object.is(next, current)) {
        current = next;
        setValue(() => next);
      }
    });
  }, [store]);
  return value;
}
