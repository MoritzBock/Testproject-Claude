import type { MeResponse } from '@pixel/shared';
import { createStore } from '../core/store';

export const dash = createStore<{ me: MeResponse | null; route: string }>({
  me: null,
  route: location.hash.slice(1) || '/klassen',
});

window.addEventListener('hashchange', () =>
  dash.set({ route: location.hash.slice(1) || '/klassen' }),
);

export const go = (route: string) => {
  location.hash = route;
};
