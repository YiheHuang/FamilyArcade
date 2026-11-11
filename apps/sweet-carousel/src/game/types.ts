/** Shared types for the pure Sweet Carousel engine. No DOM, no clock, no Math.random. */

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export const DESSERT_IDS = ['macaron', 'tart', 'eclair', 'pudding', 'candy', 'cake'] as const;
export type DessertId = (typeof DESSERT_IDS)[number];

export type PlayerKind = 'human' | 'ai';
export type PlayerCount = 2 | 3 | 4 | 5;

export interface SeatConfig {
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

export interface GameConfig {
  playerCount: PlayerCount;
  seats: SeatConfig[];
  /** Seed string. The UI generates one per game; tests pass a fixed seed. */
  seed: string;
}

export type Rng = () => number;

export type Phase = 'choosing' | 'reveal' | 'round-end' | 'ended';
export type PassDirection = 'left' | 'right';

export interface Pick {
  seat: number;
  cardId: number;
}

export type Move =
  | { kind: 'pick'; seat: number; cardId: number }
  | { kind: 'advance' }
  | { kind: 'next-round' };

export type ErrorCode =
  | 'game-over'
  | 'wrong-phase'
  | 'bad-seat'
  | 'card-not-in-hand'
  | 'already-picked'
  | 'invalid-config'
  | 'invalid-save'
  | 'bad-move';

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
  | { type: 'picked'; seat: number; cardId: number }
  | { type: 'revealed'; picks: Pick[] }
  | { type: 'passed'; direction: PassDirection; round: number }
  | { type: 'round-ended'; round: number; breakdowns: RoundBreakdown[] }
  | { type: 'game-ended'; winner: number | null };

export type ComboKind = 'pair' | 'triple' | 'quad';

export interface Combo {
  kind: ComboKind;
  dessert: DessertId;
  cards: number[];
  points: number;
}

export interface Sampler {
  desserts: DessertId[];
  cards: number[];
  points: 5;
}

export interface RoundBreakdown {
  seat: number;
  combos: Combo[];
  sampler: Sampler | null;
  leftovers: number[];
  leftoverPoints: number;
  total: number;
}

export interface PickRound {
  round: number;
  passDirection: PassDirection;
  /** One entry per pick number; each entry is ordered by seat. */
  picks: Pick[][];
  breakdowns: RoundBreakdown[];
}

export interface Crown {
  dessert: DessertId;
  seat: number;
  count: number;
  points: 6;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  phase: Phase;
  round: 1 | 2 | 3;
  /** Number of completed picks in the current round, 0..8. */
  pickIndex: number;
  passDirection: PassDirection;
  /** Current hands. These are private and never leave view() for another seat. */
  hands: number[][];
  /** Pending simultaneous picks for the current pick; null means not picked. */
  pending: (number | null)[];
  /** Cards already picked in the current round. */
  roundCollected: number[][];
  /** All cards collected across the game. */
  collected: number[][];
  /** Revealed picks for the current round. */
  roundPicks: Pick[][];
  /** Completed rounds. */
  rounds: PickRound[];
  /** Last reveal (empty while choosing). */
  revealed: Pick[];
  /** Pre-dealt hands for rounds 1..3. Future hands are never exposed in view(). */
  deals: number[][][];
  crowns: Crown[];
  lastEvents: GameEvent[];
}

export interface ScoreRow {
  seat: number;
  name: string;
  total: number;
  roundScores: number[];
  setPoints: number;
  samplerPoints: number;
  leftoverPoints: number;
  crownPoints: number;
  majorities: number;
  types: number;
  cards: number;
}

export interface GameResult {
  winner: number | null;
  ranking: ScoreRow[];
  crowns: Crown[];
  tieBreak: 'score' | 'majorities' | 'types' | 'seat';
  reason: 'three-rounds';
}

export interface PublicSeatView {
  seat: number;
  name: string;
  kind: PlayerKind;
  level: AiLevel;
  handCount: number;
  hasPicked: boolean;
  roundCollected: number[];
  collected: number[];
  total: number;
  majorities: number;
  types: number;
}

export interface GameView {
  phase: Phase;
  round: 1 | 2 | 3;
  pickIndex: number;
  playerCount: PlayerCount;
  passDirection: PassDirection;
  seats: PublicSeatView[];
  mySeat: number | null;
  myHand: number[];
  myPending: number | null;
  revealed: Pick[];
  roundPicks: Pick[][];
  roundBreakdowns: RoundBreakdown[] | null;
  rounds: PickRound[];
  score: ScoreRow[];
  crowns: Crown[];
  result: GameResult | null;
  remainingPicks: number;
}

export interface HintReason {
  key: string;
  params?: Record<string, string | number>;
}

export interface AiSpec<V, M> {
  choose(view: V, level: AiLevel, budgetMs: number, rng: Rng): M | null;
  explain(view: V, move: M): HintReason;
}

export interface GameDefinition<S, M, V, C> {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  setup(config: C, rng: Rng): S;
  view(state: S, seat: number | null): V;
  legal(state: S, seat: number): M[];
  apply(state: S, move: M): ApplyResult;
  score(state: S): ScoreRow[];
  result(state: S): GameResult | null;
  serialize(state: S): string;
  deserialize(json: string): S;
  invariants(state: S): string[];
  ai: AiSpec<V, M>;
}
