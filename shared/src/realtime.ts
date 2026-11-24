/** Predefined emotes – there is deliberately NO free chat (prevents bullying, no moderation needed). */
export const EMOTES = [
  { id: 'hello', text: 'Hallo!' },
  { id: 'great', text: 'Super!' },
  { id: 'question', text: 'Frage?' },
  { id: 'idea', text: 'Idee!' },
  { id: 'yay', text: 'Juhu!' },
  { id: 'help', text: 'Hilfe?' },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];

export interface PresencePlayer {
  id: string;
  name: string;
  teacher: boolean;
  appearance: { skinTone: number; equipped: Record<string, string> } | null;
  x: number;
  y: number;
  frame: number;
  emote?: { id: EmoteId; at: number };
}

/** Server → client */
export interface ServerEvents {
  presence: { players: PresencePlayer[] };
  teleport: { x: number; y: number };
  frozen: { frozen: boolean };
  announce: { text: string; from: string };
  refresh: { what: Array<'world' | 'wallet' | 'policies' | 'character'> };
  kicked: { reason: string };
}

/** Client → server */
export interface ClientEvents {
  move: { x: number; y: number; frame: number };
  emote: { id: EmoteId };
}
