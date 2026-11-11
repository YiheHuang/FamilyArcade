import type { Balloon } from './data';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type PlayerKind = 'human' | 'ai';

export interface SeatConfig {
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

export interface GameConfig {
  playerCount: number;
  seats: SeatConfig[];
  /** Stable seed used by setup and replay. */
  seed: string;
}

export type GamePhase = 'support' | 'summary' | 'ended';

export type Move =
  | { kind: 'support'; seat: number; balloon: number; tailwind: boolean }
  | { kind: 'advance' };

export type ErrorCode =
  | 'game-over'
  | 'wrong-phase'
  | 'not-your-turn'
  | 'bad-seat'
  | 'bad-balloon'
  | 'already-supported'
  | 'no-tailwind'
  | 'bad-move';

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: ErrorCode };

export interface RoundRecord {
  round: number;
  supports: number[];
  tailwinds: boolean[];
  wind: number[];
  positionsBefore: number[];
  positionsAfter: number[];
  leaders: number[];
  seconds: number[];
  points: number[];
  overallLeaders: number[] | null;
  overallPoints: number[] | null;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  round: number;
  phase: GamePhase;
  /** Seat choosing a support, or -1 during summary/ended. */
  current: number;
  positions: number[];
  supports: (number | null)[];
  tailwinds: boolean[];
  tokensLeft: number[];
  /** Hidden from every view until the round resolves. */
  windPlan: number[][];
  history: RoundRecord[];
  moves: Move[];
  overallLeaders: number[];
}

export interface ScoreRow {
  seat: number;
  name: string;
  roundPoints: number;
  overallPoints: number;
  tailwindPoints: number;
  total: number;
  correctSupports: number;
  tokensLeft: number;
  rank: number;
}

export interface GameResult {
  winners: number[];
  reason: 'four-rounds';
  ranking: ScoreRow[];
}

export interface PlayerView {
  seat: number;
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

/** Everything a player may know. Hidden supports and future winds are stripped. */
export interface GameView {
  version: 1;
  phase: GamePhase;
  round: number;
  current: number;
  playerCount: number;
  seats: PlayerView[];
  positions: number[];
  tokensLeft: number[];
  submitted: boolean[];
  mySeat: number | null;
  mySupport: number | null;
  myTailwind: boolean;
  canTailwind: boolean;
  balloons: readonly Balloon[];
  trackLength: number;
  rounds: number;
  history: RoundRecord[];
  overallLeaders: number[];
  scores: ScoreRow[];
  winners: number[];
  lastRound: RoundRecord | null;
}

export interface AiExplanation {
  key: string;
  params: Record<string, string | number>;
}
