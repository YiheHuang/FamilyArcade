/** Core data types shared by engine, AI, UI and networking. */

export type VariantId = 'standard' | 'duo';
export type PlayerCount = 2 | 3 | 4;

export interface GameConfig {
  variant: VariantId;
  players: PlayerCount;
}

/** A placement of `piece` in orientation `o` with its bounding-box origin at (x, y). */
export interface PlaceMove {
  kind: 'place';
  p: number;
  piece: number;
  o: number;
  x: number;
  y: number;
}

export interface PassMove {
  kind: 'pass';
  p: number;
}

export type Action = PlaceMove | PassMove;

export interface PlayerScore {
  /** squares placed on the board */
  cells: number;
  /** end-of-game bonus (all 21 pieces: +15, monomino last: +20) */
  bonus: number;
  total: number;
  piecesLeft: number;
}

/** Wire/JSON format — replaying `history` reconstructs the exact game state. */
export interface SerializedGame {
  v: 1;
  config: GameConfig;
  history: Action[];
}
