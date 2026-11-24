/** Typed events from the UI to the game scenes. */
export interface BusEvents {
  startGame: void;
  toTitle: void;
  enterPortal: void;
  interact: void;
  /** Demo only (until M4): finish the active level with n stars. */
  demoCompleteLevel: { levelId: string; stars: number };
  demoResetProgress: void;
  settingsChanged: void;
  levelClosed: void;
}

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

export const bus = {
  on<K extends keyof BusEvents>(event: K, fn: Handler<BusEvents[K]>): () => void {
    const set = handlers.get(event) ?? new Set();
    set.add(fn as Handler<never>);
    handlers.set(event, set);
    return () => set.delete(fn as Handler<never>);
  },
  emit<K extends keyof BusEvents>(
    event: K,
    ...payload: BusEvents[K] extends void ? [] : [BusEvents[K]]
  ): void {
    handlers.get(event)?.forEach((fn) => (fn as Handler<unknown>)(payload[0]));
  },
};
