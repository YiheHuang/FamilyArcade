export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type PlayerKind = 'human' | 'ai';

export interface SeatConfig {
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

export interface GameConfig {
  playerCount: 2 | 3 | 4;
  seats: SeatConfig[];
  /** Optional seed for AI tie-breaking / reproducible tests. */
  seed?: string;
}

export type MoveKind = 'step' | 'jump' | 'pass';

export interface Move {
  seat: number;
  from: number;
  to: number;
  /** Every hole visited, including start and end. Empty for a pass. */
  path: number[];
  kind: MoveKind;
}

export type EndReason = 'home' | 'stalemate' | 'cap' | null;

export interface GameState {
  version: 1;
  config: GameConfig;
  /** 0 = empty, 1..4 = seat + 1 */
  board: number[];
  current: number;
  /** 1-based turn number */
  turn: number;
  /** 0-based seat of the winner, or null */
  winner: number | null;
  /** Consecutive full turns without a marble entering its target. */
  noProgress: number;
  moves: Move[];
  lastMove: Move | null;
  status: 'playing' | 'ended';
  endReason: EndReason;
}

export type ErrorCode =
  | 'game-over'
  | 'not-your-turn'
  | 'no-marble'
  | 'illegal-move'
  | 'occupied'
  | 'no-legal-moves'
  | 'pass-not-allowed'
  | 'bad-seat'
  | 'bad-config';

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: ErrorCode };

export interface RankingRow {
  seat: number;
  name: string;
  home: number;
  distance: number;
  remaining: number;
  rank: number;
}

export interface GameResult {
  winner: number | null;
  reason: 'home' | 'stalemate' | 'cap';
  ranking: RankingRow[];
}

/** Perfect-information game: the view is the state. Kept as a function so
 *  UI/session/AI share the same access pattern as games with hidden info. */
export function viewFor(state: GameState, _seat: number | null): GameState {
  return state;
}

export function seatName(state: GameState, seat: number): string {
  return state.config.seats[seat]?.name ?? `Seat ${seat + 1}`;
}
