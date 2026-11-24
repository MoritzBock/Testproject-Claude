/**
 * Public (client-facing) task shapes. Solutions NEVER appear here – the server keeps
 * them and evaluates answers. Each task type has a "view" (what the client renders)
 * and an "answer" (what the client sends back).
 */
import type { LevelStatus, Requirement, WorldState } from './unlock.js';

export interface PublicTaskBase {
  id: string;
  type: string;
  prompt: string;
  hintCount: number;
  maxPoints: number;
  maxAttempts: number;
}

export interface ChoiceView {
  options: Array<{ id: string; text: string }>;
  multiple: boolean;
}
export interface ClozeView {
  segments: Array<{ t: 'text'; text: string } | { t: 'gap'; id: string; options?: string[] }>;
}
export interface MatchView {
  left: Array<{ id: string; text: string }>;
  right: Array<{ id: string; text: string }>;
}
export interface OrderView {
  items: Array<{ id: string; text: string }>;
}

export type PublicTask =
  | (PublicTaskBase & { type: 'choice'; view: ChoiceView })
  | (PublicTaskBase & { type: 'cloze'; view: ClozeView })
  | (PublicTaskBase & { type: 'match'; view: MatchView })
  | (PublicTaskBase & { type: 'order'; view: OrderView })
  | (PublicTaskBase & { type: string; view: unknown });

export interface ChoiceAnswer {
  selected: string[];
}
export interface ClozeAnswer {
  gaps: Record<string, string>;
}
export interface MatchAnswer {
  pairs: Record<string, string>;
}
export interface OrderAnswer {
  order: string[];
}

/** Uniform result object of every task type. */
export interface TaskResult {
  correct: boolean;
  /** 0..1 share of the task that was right. */
  score: number;
  points: number;
  attempt: number;
  attemptsLeft: number;
  /** true when the task is finished (correct or no attempts left). */
  done: boolean;
  timeMs: number;
  hintsUsed: number;
  feedback: string;
  /** Explanation shown once the task is done. */
  explanation?: string;
}

export interface LevelMeta {
  id: string;
  title: string;
  subject: string;
  description: string;
  icon: string;
  /** Optional portal position (tiles) if the map has no portal object for this level. */
  portal?: { x: number; y: number };
  requires?: Requirement;
  taskCount: number;
  starThresholds: [number, number, number];
}

export interface WorldResponse {
  levels: LevelMeta[];
  zones: Array<{ id: string; label: string }>;
  state: WorldState;
  /** Unlocked because the viewer is staff (preview mode). */
  preview: boolean;
}

export interface RunStartResponse {
  runId: string;
  level: { id: string; title: string; subject: string };
  tasks: PublicTask[];
  preview: boolean;
  /** Task states when an unfinished run is resumed. */
  progress: Array<{
    taskId: string;
    done: boolean;
    points: number;
    attempts: number;
    hintsUsed: number;
  }>;
}

export interface RunSummary {
  stars: number;
  bestStars: number;
  points: number;
  maxPoints: number;
  passed: boolean;
  newStars: number;
  currency: number;
  items: Array<{ itemId: string; duplicate: boolean; converted: number }>;
  achievements: string[];
  status: LevelStatus;
  preview: boolean;
}

/** Stars from score share and thresholds (e.g. [0.5, 0.75, 0.95]). */
export function starsFor(share: number, thresholds: readonly [number, number, number]): number {
  return thresholds.filter((t) => share + 1e-9 >= t).length;
}

/** Points for an attempt: later attempts and used hints reduce the points. */
export function pointsFor(
  maxPoints: number,
  score: number,
  attempt: number,
  hintsUsed: number,
): number {
  const attemptFactor = [1, 0.6, 0.3][attempt - 1] ?? 0.2;
  const hintFactor = Math.max(0.4, 1 - 0.2 * hintsUsed);
  return Math.round(maxPoints * score * attemptFactor * hintFactor);
}

/** Text normalisation for free-text gaps (trim, collapse whitespace, optional case folding). */
export function normalizeText(s: string, caseSensitive = false): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLocaleLowerCase('de-DE');
}
