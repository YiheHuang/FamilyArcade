/** Public game contract for Hue Garden.
 *
 * The pure engine is the single source of truth for the app, the AI worker,
 * replay and the docs scripts. It never touches the DOM, the network, a clock
 * or Math.random.
 */

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
  /** Seed used by replay and by AI tie-breaking. Shuffling uses the injected Rng. */
  seed: string;
}

/** A tile is one of 36 colour/shape combinations. The three physical copies are
 *  interchangeable and represented by repeated ids in bags and hands. */
export type TileId = number;

export interface PlacedTile {
  x: number;
  y: number;
  tile: TileId;
}

export type Move =
  | {
      kind: 'play';
      seat: number;
      /** 1–3 tiles placed in one contiguous line. */
      placements: PlacedTile[];
    }
  | {
      kind: 'swap';
      seat: number;
      /** Indices into the acting seat's hand, 1–3 of them. */
      hand: number[];
    }
  | { kind: 'pass'; seat: number };

export type EndReason = 'cleared' | 'blocked' | 'cap' | null;

export interface ScoredLine {
  axis: 'row' | 'col';
  /** Inclusive endpoints in board coordinates. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  length: number;
  points: number;
  bloom: boolean;
  tiles: TileId[];
}

export interface MoveScore {
  points: number;
  lines: ScoredLine[];
  bloomCount: number;
  /** +6 when a player empties their hand after the bag is empty. */
  endBonus?: number;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  board: PlacedTile[];
  hands: TileId[][];
  /** Remaining bag, in draw order: the last element is drawn first. */
  bag: TileId[];
  current: number;
  /** 1-based turn number. */
  turn: number;
  scores: number[];
  /** Number of six-tile "bloom" lines each seat has completed. */
  blooms: number[];
  status: 'playing' | 'ended';
  endReason: EndReason;
  winners: number[];
  moves: Move[];
  lastMove: Move | null;
  lastScore: MoveScore | null;
  consecutivePasses: number;
  totalPasses: number;
}

export type ErrorCode =
  | 'game-over'
  | 'not-your-turn'
  | 'bad-seat'
  | 'bad-config'
  | 'bad-move'
  | 'unknown-tile'
  | 'no-tiles'
  | 'too-many-tiles'
  | 'hand-index'
  | 'tile-not-in-hand'
  | 'cell-occupied'
  | 'not-in-line'
  | 'not-contiguous'
  | 'not-connected'
  | 'cannot-insert'
  | 'opening-origin'
  | 'line-mixed'
  | 'line-duplicate'
  | 'line-too-long'
  | 'swap-size'
  | 'bag-too-small'
  | 'pass-not-allowed'
  | 'save-version'
  | 'save-corrupt';

export interface ApplyOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}

export interface ApplyErr {
  ok: false;
  reason: ErrorCode;
  params?: Record<string, string | number>;
}

export type ApplyResult = ApplyOk | ApplyErr;

export type GameEvent =
  | {
      type: 'place';
      seat: number;
      cells: PlacedTile[];
      points: number;
      blooms: number;
      lines: ScoredLine[];
    }
  | { type: 'swap'; seat: number; count: number }
  | { type: 'pass'; seat: number }
  | { type: 'end'; reason: Exclude<EndReason, null>; winners: number[]; bonus: number };

export interface ScoreRow {
  seat: number;
  name: string;
  points: number;
  blooms: number;
  handCount: number;
  rank: number;
}

export interface GameResult {
  reason: Exclude<EndReason, null>;
  /** The sole winner, or null when the top place is shared. */
  winner: number | null;
  winners: number[];
  ranking: ScoreRow[];
}

export interface PublicSeat {
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

/** What the UI and AI are allowed to see. Other hands and the bag contents are
 *  removed here, not hidden with CSS. */
export interface PlayerView {
  version: 1;
  seat: number | null;
  config: {
    playerCount: 2 | 3 | 4;
    seats: PublicSeat[];
    seed: string;
  };
  board: PlacedTile[];
  hand: TileId[] | null;
  handCounts: number[];
  bagCount: number;
  current: number;
  turn: number;
  status: 'playing' | 'ended';
  endReason: EndReason;
  scores: number[];
  blooms: number[];
  winners: number[];
  movesCount: number;
  lastMove: Move | null;
  lastScore: MoveScore | null;
  consecutivePasses: number;
}

export interface MovePreview {
  score: MoveScore;
  board: PlacedTile[];
  hand: TileId[];
}

export function errorTextKey(reason: ErrorCode): string {
  return `error.${reason}`;
}

export function seatName(state: GameState, seat: number): string {
  return state.config.seats[seat]?.name ?? `Seat ${seat + 1}`;
}
