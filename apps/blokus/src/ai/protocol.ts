import type { Difficulty } from './types';
import type { PlaceMove, SerializedGame } from '../game/types';

export interface AiRequest {
  id: number;
  snapshot: SerializedGame;
  seat: number;
  difficulty: Difficulty;
  budgetMs: number;
  seed: number;
}

export interface AiResponse {
  id: number;
  /** null when the seat has no legal placement (must pass) */
  move: PlaceMove | null;
  ms: number;
}

/** scoring weights — tuned for balanced expansion vs. blocking play */
export const WEIGHTS = {
  size: 10.0,
  newFrontier: 1.2,
  edge: 0.7,
  contact: 0.5,
} as const;

export const NOISE_AMP: Record<Difficulty, number> = {
  easy: 7,
  normal: 0.8,
  hard: 0.8,
};

export const HARD_TOP_K = 14;
