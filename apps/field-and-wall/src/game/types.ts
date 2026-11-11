export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type EdgeType = 'city' | 'road' | 'field';
export type CenterType = 'city' | 'road' | 'monastery' | 'field';
export type FeatureType = 'city' | 'road' | 'monastery';

/** Edge order is clockwise from the top: 0=N, 1=E, 2=S, 3=W. */
export type Rotation = 0 | 1 | 2 | 3;

export interface TileType {
  id: string;
  name: { zh: string; en: string };
  edges: [EdgeType, EdgeType, EdgeType, EdgeType];
  center: CenterType;
  copies: number;
}

export interface TileData {
  version: number;
  source: string;
  count: number;
  tileSize: number;
  startTile: { type: string; rot: Rotation };
  types: TileType[];
}

export interface PlacedTile {
  x: number;
  y: number;
  type: string;
  rot: Rotation;
  /** Seat that owns the meeple on this tile, or null. */
  meeple: number | null;
  /** Local feature index on this tile. */
  meepleFeature: number | null;
}

export type PlayerKind = 'human' | 'ai';

export interface SeatConfig {
  name: string;
  kind: PlayerKind;
  level: AiLevel;
}

export interface GameConfig {
  playerCount: 2 | 3 | 4;
  seats: SeatConfig[];
  /** Same seed + same moves = same game. Never read the clock in the engine. */
  seed: string;
}

export type MoveKind = 'place' | 'discard';

export interface Move {
  seat: number;
  kind: MoveKind;
  x: number;
  y: number;
  rot: Rotation;
  /** Local feature index on the placed tile, or null for no meeple. */
  meeple: number | null;
}

export type EndReason = 'bag-empty' | 'no-tiles' | null;

export interface Cell {
  x: number;
  y: number;
}

export interface ScoredFeature {
  type: FeatureType;
  tiles: Cell[];
  points: number;
  /** Seats that scored (all seats tied for the meeple majority). */
  seats: number[];
  /** True for a completed feature, false for final scoring. */
  complete: boolean;
  meeples: { seat: number; count: number }[];
}

export interface GameState {
  version: 1;
  config: GameConfig;
  tiles: PlacedTile[];
  /** The unseen draw pile. Hidden from view(). */
  bag: string[];
  /** The tile currently in the player's hand (public). */
  currentTile: string | null;
  current: number;
  /** 1-based turn number. */
  turn: number;
  scores: number[];
  meeplesLeft: number[];
  moves: Move[];
  status: 'playing' | 'ended';
  endReason: EndReason;
  lastScored: ScoredFeature[];
  /** Number of completed features scored, per seat (tie-break + stats). */
  completed: number[];
  discarded: string[];
  lastMove: Move | null;
}

/** Public view: same board, but the order of the bag is stripped away. */
export interface GameView {
  version: 1;
  config: GameConfig;
  tiles: PlacedTile[];
  bagCount: number;
  currentTile: string | null;
  current: number;
  turn: number;
  scores: number[];
  meeplesLeft: number[];
  moves: Move[];
  status: 'playing' | 'ended';
  endReason: EndReason;
  lastScored: ScoredFeature[];
  completed: number[];
  discarded: string[];
  lastMove: Move | null;
}

export type ErrorCode =
  | 'game-over'
  | 'not-your-turn'
  | 'bad-seat'
  | 'bad-config'
  | 'no-current-tile'
  | 'unknown-tile'
  | 'occupied'
  | 'not-adjacent'
  | 'edge-mismatch'
  | 'bad-rotation'
  | 'bad-meeple'
  | 'no-meeples'
  | 'feature-occupied'
  | 'feature-complete'
  | 'cannot-discard'
  | 'no-legal-move'
  | 'bad-move';

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: ErrorCode; params?: Record<string, string | number> };

export interface RankingRow {
  seat: number;
  name: string;
  score: number;
  completed: number;
  meeplesLeft: number;
  rank: number;
}

export interface GameResult {
  winner: number | null;
  tiedWinners: number[];
  reason: 'bag-empty' | 'no-tiles';
  ranking: RankingRow[];
}

export interface ScoreRow {
  seat: number;
  name: string;
  score: number;
}

export const SEATS: Record<number, { zh: string; en: string; color: string; deep: string; mark: string }> = {
  0: { zh: '青蓝', en: 'Blue', color: '#47657f', deep: '#2d4458', mark: 'dot' },
  1: { zh: '陶红', en: 'Clay', color: '#a35f4c', deep: '#743d30', mark: 'plus' },
  2: { zh: '芥黄', en: 'Ochre', color: '#b08a45', deep: '#7d5f2c', mark: 'ring' },
  3: { zh: '木紫', en: 'Plum', color: '#77627f', deep: '#503f58', mark: 'slash' },
};

export const DIR_NAMES = [
  { zh: '北', en: 'north' },
  { zh: '东', en: 'east' },
  { zh: '南', en: 'south' },
  { zh: '西', en: 'west' },
] as const;

export const OPPOSITE = [2, 3, 0, 1] as const;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
