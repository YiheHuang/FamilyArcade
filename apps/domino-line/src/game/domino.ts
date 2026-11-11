/**
 * Domino Line — pure block-dominoes engine.
 *
 * No DOM, network, clock or Math.random. Every random choice (the deal) takes an
 * injected RNG so the same seed always produces the same game. Hidden information
 * is protected by `view(state, seat)`: a seat only ever sees its own hand.
 */

export type Rng = () => number;
export type End = 'left' | 'right';
export type Phase = 'playing' | 'round-over' | 'match-over';
export type PlayerCount = 2 | 3 | 4;

export interface Tile {
  a: number;
  b: number;
}

/** A tile as it sits in the line. `left`/`right` are the outward-facing pips. */
export interface PlacedTile {
  tile: Tile;
  left: number;
  right: number;
}

export interface LegalPlay {
  tile: Tile;
  end: End;
  /** Pip that becomes the new open end. */
  outer: number;
}

export interface LastPlay {
  seat: number;
  end: End;
  tile: Tile;
  outer: number;
}

export interface GameState {
  players: PlayerCount;
  target: number;
  hands: Tile[][];
  boneyard: Tile[];
  board: PlacedTile[];
  left: number | null;
  right: number | null;
  turn: number;
  phase: Phase;
  round: number;
  scores: number[];
  /** Consecutive passes with an empty boneyard. */
  passes: number;
  roundWinner: number | null;
  roundPoints: number;
  matchWinner: number | null;
  starter: number;
  lastPlay: LastPlay | null;
}

export type Action =
  | { type: 'play'; seat: number; tile: Tile; end: End }
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number };

export type ActionError =
  | 'bad-action'
  | 'bad-seat'
  | 'wrong-turn'
  | 'not-playing'
  | 'not-in-hand'
  | 'not-legal'
  | 'must-play'
  | 'boneyard-empty'
  | 'must-draw'
  | 'cannot-pass';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: ActionError;
  points?: number;
}

export interface SeatView {
  seat: number;
  players: number;
  target: number;
  round: number;
  hand: Tile[];
  counts: number[];
  /** Hidden from opponents while the round is live, revealed in the summary. */
  pipTotals: (number | null)[];
  boneyardCount: number;
  board: PlacedTile[];
  left: number | null;
  right: number | null;
  turn: number;
  phase: Phase;
  scores: number[];
  legal: LegalPlay[];
  canMove: boolean;
  canDraw: boolean;
  canPass: boolean;
  lastPlay: LastPlay | null;
  roundWinner: number | null;
  roundPoints: number;
  matchWinner: number | null;
}

export const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4];
export const DEFAULT_TARGET = 100;

export function makeTile(a: number, b: number): Tile {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) {
    throw new Error(`invalid domino pips: ${a},${b}`);
  }
  return a <= b ? { a, b } : { a: b, b: a };
}

export function tileKey(tile: Tile): string {
  return `${tile.a}-${tile.b}`;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.a === b.a && a.b === b.b;
}

export const ALL_TILES: readonly Tile[] = Object.freeze(
  Array.from({ length: 7 }, (_, a) =>
    Array.from({ length: 7 - a }, (_, offset) => makeTile(a, a + offset)),
  ).flat(),
);

export function pipTotal(tiles: readonly Tile[]): number {
  return tiles.reduce((sum, tile) => sum + tile.a + tile.b, 0);
}

/** Small, fast deterministic RNG (mulberry32). Useful for seeds and tests. */
export function makeRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const raw = Math.floor(rng() * (i + 1));
    const j = Math.max(0, Math.min(i, raw));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawCount(players: PlayerCount): number {
  return players === 2 ? 7 : 5;
}

export function nextSeat(players: number, seat: number): number {
  return (seat + 1) % players;
}

export function setup(players: PlayerCount, rng: Rng, target = DEFAULT_TARGET): GameState {
  if (!PLAYER_COUNTS.includes(players)) throw new Error(`invalid player count: ${players}`);
  if (!Number.isFinite(target) || target <= 0) throw new Error(`invalid target: ${target}`);
  const deck = shuffle(ALL_TILES, rng);
  const perPlayer = drawCount(players);
  const hands: Tile[][] = Array.from({ length: players }, () => []);
  let cursor = 0;
  for (let round = 0; round < perPlayer; round += 1) {
    for (let seat = 0; seat < players; seat += 1) {
      hands[seat].push(deck[cursor]);
      cursor += 1;
    }
  }
  return {
    players,
    target,
    hands,
    boneyard: deck.slice(cursor),
    board: [],
    left: null,
    right: null,
    turn: 0,
    phase: 'playing',
    round: 1,
    scores: Array.from({ length: players }, () => 0),
    passes: 0,
    roundWinner: null,
    roundPoints: 0,
    matchWinner: null,
    starter: 0,
    lastPlay: null,
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    hands: state.hands.map((hand) => hand.map((tile) => ({ ...tile }))),
    boneyard: state.boneyard.map((tile) => ({ ...tile })),
    board: state.board.map((placed) => ({
      tile: { ...placed.tile },
      left: placed.left,
      right: placed.right,
    })),
    scores: state.scores.slice(),
    lastPlay: state.lastPlay ? { ...state.lastPlay, tile: { ...state.lastPlay.tile } } : null,
  };
}

/**
 * Every way the seat can play its hand against the current open ends. The same
 * tile is listed at most once per end, and duplicate outcomes are removed when
 * both ends show the same pip.
 */
export function legalPlays(state: GameState, seat: number): LegalPlay[] {
  if (state.phase !== 'playing' || state.turn !== seat || seat < 0 || seat >= state.players) {
    return [];
  }
  const hand = state.hands[seat] ?? [];
  const plays: LegalPlay[] = [];
  const seen = new Set<string>();
  const add = (play: LegalPlay) => {
    const key = `${play.end}:${tileKey(play.tile)}:${play.outer}`;
    if (seen.has(key)) return;
    seen.add(key);
    plays.push(play);
  };

  for (const tile of hand) {
    if (state.board.length === 0) {
      add({ tile, end: 'right', outer: tile.b });
      continue;
    }
    const { left, right } = state;
    if (left === null || right === null) continue;
    if (tile.a === right) add({ tile, end: 'right', outer: tile.b });
    if (tile.b === right) add({ tile, end: 'right', outer: tile.a });
    if (tile.b === left) add({ tile, end: 'left', outer: tile.a });
    if (tile.a === left) add({ tile, end: 'left', outer: tile.b });
  }

  if (state.board.length > 0 && state.left === state.right) {
    const seenTile = new Set<string>();
    return plays.filter((play) => {
      const key = tileKey(play.tile);
      if (seenTile.has(key)) return false;
      seenTile.add(key);
      return true;
    });
  }
  return plays;
}

export function canPlayAny(state: GameState, seat: number): boolean {
  return legalPlays(state, seat).length > 0;
}

function blockRound(state: GameState): void {
  const totals = state.hands.map((hand) => pipTotal(hand));
  const lowest = Math.min(...totals);
  const contenders = totals.flatMap((total, seat) => (total === lowest ? [seat] : []));
  state.passes = 0;
  if (contenders.length !== 1) {
    state.roundWinner = -1;
    state.roundPoints = 0;
    state.phase = 'round-over';
    return;
  }
  const winner = contenders[0];
  const points = totals.reduce(
    (sum, total, seat) => (seat === winner ? sum : sum + total),
    0,
  );
  state.roundWinner = winner;
  state.roundPoints = points;
  state.scores[winner] += points;
  if (state.scores[winner] >= state.target) {
    state.phase = 'match-over';
    state.matchWinner = winner;
  } else {
    state.phase = 'round-over';
  }
}

function emptyHandRound(state: GameState, winner: number): void {
  const points = state.hands.reduce(
    (sum, hand, seat) => (seat === winner ? sum : sum + pipTotal(hand)),
    0,
  );
  state.roundWinner = winner;
  state.roundPoints = points;
  state.scores[winner] += points;
  if (state.scores[winner] >= state.target) {
    state.phase = 'match-over';
    state.matchWinner = winner;
  } else {
    state.phase = 'round-over';
  }
}

function orientForRight(tile: Tile, endPip: number): PlacedTile {
  return tile.a === endPip
    ? { tile: { ...tile }, left: tile.a, right: tile.b }
    : { tile: { ...tile }, left: tile.b, right: tile.a };
}

function orientForLeft(tile: Tile, endPip: number): PlacedTile {
  return tile.b === endPip
    ? { tile: { ...tile }, left: tile.a, right: tile.b }
    : { tile: { ...tile }, left: tile.b, right: tile.a };
}

export function applyAction(state: GameState, action: Action): ActionResult {
  if (!action || typeof action !== 'object') {
    return { ok: false, state, error: 'bad-action' };
  }
  if (state.phase !== 'playing') {
    return { ok: false, state, error: 'not-playing' };
  }
  if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat >= state.players) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (state.turn !== action.seat) {
    return { ok: false, state, error: 'wrong-turn' };
  }

  if (action.type === 'play') {
    const hand = state.hands[action.seat];
    const index = hand.findIndex((tile) => sameTile(tile, action.tile));
    if (index < 0) return { ok: false, state, error: 'not-in-hand' };
    const legal = legalPlays(state, action.seat).find(
      (play) => sameTile(play.tile, action.tile) && play.end === action.end,
    );
    if (!legal) return { ok: false, state, error: 'not-legal' };

    const next = cloneState(state);
    next.hands[action.seat].splice(index, 1);
    let placed: PlacedTile;
    if (next.board.length === 0) {
      placed = { tile: { ...action.tile }, left: action.tile.a, right: action.tile.b };
      next.left = placed.left;
      next.right = placed.right;
      next.board = [placed];
    } else if (action.end === 'right') {
      placed = orientForRight(action.tile, next.right as number);
      next.board.push(placed);
      next.right = placed.right;
    } else {
      placed = orientForLeft(action.tile, next.left as number);
      next.board.unshift(placed);
      next.left = placed.left;
    }
    next.passes = 0;
    next.lastPlay = {
      seat: action.seat,
      end: action.end,
      tile: { ...action.tile },
      outer: placed.right === next.right ? placed.right : placed.left,
    };
    if (next.hands[action.seat].length === 0) {
      emptyHandRound(next, action.seat);
    } else {
      next.turn = nextSeat(next.players, action.seat);
    }
    return {
      ok: true,
      state: next,
      points: next.roundWinner === action.seat ? next.roundPoints : undefined,
    };
  }

  if (action.type === 'draw') {
    if (legalPlays(state, action.seat).length > 0) {
      return { ok: false, state, error: 'must-play' };
    }
    if (state.boneyard.length === 0) {
      return { ok: false, state, error: 'boneyard-empty' };
    }
    const next = cloneState(state);
    const tile = next.boneyard[next.boneyard.length - 1];
    next.boneyard = next.boneyard.slice(0, -1);
    next.hands[action.seat] = [...next.hands[action.seat], { ...tile }];
    next.passes = 0;
    return { ok: true, state: next };
  }

  if (action.type === 'pass') {
    if (legalPlays(state, action.seat).length > 0) {
      return { ok: false, state, error: 'cannot-pass' };
    }
    if (state.boneyard.length > 0) {
      return { ok: false, state, error: 'must-draw' };
    }
    const next = cloneState(state);
    next.passes += 1;
    if (next.passes >= next.players) {
      blockRound(next);
    } else {
      next.turn = nextSeat(next.players, action.seat);
    }
    return { ok: true, state: next };
  }

  return { ok: false, state, error: 'bad-action' };
}

/** Start the next round after a round-over state. Returns the same state otherwise. */
export function nextRound(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'round-over') return state;
  const deck = shuffle(ALL_TILES, rng);
  const perPlayer = drawCount(state.players);
  const hands: Tile[][] = Array.from({ length: state.players }, () => []);
  let cursor = 0;
  for (let round = 0; round < perPlayer; round += 1) {
    for (let seat = 0; seat < state.players; seat += 1) {
      hands[seat].push(deck[cursor]);
      cursor += 1;
    }
  }
  const starter =
    state.roundWinner !== null && state.roundWinner >= 0
      ? state.roundWinner
      : nextSeat(state.players, state.starter);
  return {
    ...state,
    hands,
    boneyard: deck.slice(cursor),
    board: [],
    left: null,
    right: null,
    turn: starter,
    phase: 'playing',
    round: state.round + 1,
    passes: 0,
    roundWinner: null,
    roundPoints: 0,
    matchWinner: null,
    starter,
    lastPlay: null,
  };
}

export function newMatch(state: GameState, rng: Rng, target = state.target): GameState {
  return setup(state.players, rng, target);
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.players ? seat : 0;
  const legal = legalPlays(state, safeSeat);
  const reveal = state.phase !== 'playing';
  return {
    seat: safeSeat,
    players: state.players,
    target: state.target,
    round: state.round,
    hand: state.hands[safeSeat].map((tile) => ({ ...tile })),
    counts: state.hands.map((hand) => hand.length),
    pipTotals: state.hands.map((hand, index) =>
      reveal || index === safeSeat ? pipTotal(hand) : null,
    ),
    boneyardCount: state.boneyard.length,
    board: state.board.map((placed) => ({
      tile: { ...placed.tile },
      left: placed.left,
      right: placed.right,
    })),
    left: state.left,
    right: state.right,
    turn: state.turn,
    phase: state.phase,
    scores: state.scores.slice(),
    legal,
    canMove: legal.length > 0,
    canDraw:
      state.phase === 'playing' &&
      state.turn === safeSeat &&
      legal.length === 0 &&
      state.boneyard.length > 0,
    canPass:
      state.phase === 'playing' &&
      state.turn === safeSeat &&
      legal.length === 0 &&
      state.boneyard.length === 0,
    lastPlay: state.lastPlay
      ? { ...state.lastPlay, tile: { ...state.lastPlay.tile } }
      : null,
    roundWinner: state.roundWinner,
    roundPoints: state.roundPoints,
    matchWinner: state.matchWinner,
  };
}

/** Tiles a seat has not seen: the boneyard plus every opponent hand. */
export function unseenTiles(state: GameState, seat: number): Tile[] {
  const known = new Set<string>();
  for (const placed of state.board) known.add(tileKey(placed.tile));
  for (const tile of state.hands[seat] ?? []) known.add(tileKey(tile));
  return ALL_TILES.filter((tile) => !known.has(tileKey(tile))).map((tile) => ({ ...tile }));
}

export function unseenPipCounts(tiles: readonly Tile[]): number[] {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const tile of tiles) {
    for (let pip = 0; pip <= 6; pip += 1) {
      if (tile.a === pip || tile.b === pip) counts[pip] += 1;
    }
  }
  return counts;
}

export function matchesInHand(hand: readonly Tile[], left: number | null, right: number | null): number {
  if (left === null || right === null) return 0;
  const ends = new Set([left, right]);
  return hand.filter((tile) => ends.has(tile.a) || ends.has(tile.b)).length;
}

export function playableTilesInHand(
  hand: readonly Tile[],
  left: number | null,
  right: number | null,
): Tile[] {
  if (left === null || right === null) return hand.map((tile) => ({ ...tile }));
  return hand.filter((tile) => tile.a === left || tile.b === left || tile.a === right || tile.b === right);
}

export function stateHash(state: GameState): number {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  mix(state.players);
  mix(state.round);
  mix(state.turn);
  for (const hand of state.hands) {
    for (const tile of hand) {
      mix(tile.a * 7 + tile.b);
    }
    mix(99);
  }
  for (const placed of state.board) mix(placed.left * 7 + placed.right);
  mix(state.boneyard.length);
  return hash >>> 0;
}
