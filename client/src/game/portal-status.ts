import type { LevelStatus } from '@pixel/shared';

export interface StatusPresentation {
  label: string;
  /** Icon id from ui/icons.ts – shape differs per status (not colour only). */
  icon: 'lock' | 'play' | 'half' | 'check';
  className: string;
}

export const STATUS: Record<LevelStatus, StatusPresentation> = {
  locked: { label: 'Gesperrt', icon: 'lock', className: 'status-locked' },
  available: { label: 'Verfügbar', icon: 'play', className: 'status-available' },
  started: { label: 'Begonnen', icon: 'half', className: 'status-started' },
  completed: { label: 'Abgeschlossen', icon: 'check', className: 'status-completed' },
};

/** "★★☆" for 2 of 3 stars – plus an accessible text version. */
export function starString(stars: number, max = 3): { visual: string; text: string } {
  const s = Math.max(0, Math.min(max, Math.floor(stars)));
  return {
    visual: '★'.repeat(s) + '☆'.repeat(max - s),
    text: `${s} von ${max} Sternen`,
  };
}
