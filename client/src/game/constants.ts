/** Must match scripts/assets/sprites.ts (generator) – frame layout of the sheets. */
export const CHAR_W = 16;
export const CHAR_H = 24;
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const PORTAL_KINDS = ['terminal', 'rack', 'cave', 'frame'] as const;

export const PLAYER_SPEED = 80; // px per second
export const INTERACT_RANGE = 26; // px
