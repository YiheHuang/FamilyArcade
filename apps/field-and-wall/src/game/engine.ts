import {
  analyze,
  featureForNode,
  featurePoints,
  majoritySeats,
  meepleCounts,
  type GlobalFeature,
} from './features';
import { rngFor, shuffle } from './rng';
import {
  TILE_DATA,
  allTileTypes,
  edgeAt,
  isRotation,
  localFeatures,
  tileType,
  totalTiles,
} from './tiles';
import {
  DX,
  DY,
  OPPOSITE,
  type ApplyResult,
  type Cell,
  type ErrorCode,
  type GameConfig,
  type GameResult,
  type GameState,
  type GameView,
  type Move,
  type PlacedTile,
  type RankingRow,
  type Rotation,
  type ScoreRow,
  type ScoredFeature,
} from './types';

export const MEEPLES_PER_PLAYER = 7;
export const STATE_VERSION = 1;

export interface MeepleChoice {
  index: number;
  type: 'city' | 'road' | 'monastery';
  tiles: number;
  openEdges: number;
  pointsIfCompleted: number;
  complete: boolean;
  occupied: boolean;
}

function fail(reason: ErrorCode, params?: Record<string, string | number>): ApplyResult {
  return { ok: false, reason, params };
}

function validateConfig(config: GameConfig): void {
  if (config.playerCount < 2 || config.playerCount > 4) {
    throw new Error('playerCount must be 2, 3 or 4');
  }
  if (!Array.isArray(config.seats) || config.seats.length !== config.playerCount) {
    throw new Error('seat count mismatch');
  }
  for (const seat of config.seats) {
    if (!seat.name || typeof seat.name !== 'string') throw new Error('seat name missing');
    if (seat.kind !== 'human' && seat.kind !== 'ai') throw new Error('bad seat kind');
  }
  if (typeof config.seed !== 'string' || config.seed.length === 0) {
    throw new Error('config.seed is required');
  }
}

export function setup(config: GameConfig): GameState {
  validateConfig(config);
  const rng = rngFor(config.seed);
  const pool: string[] = [];
  for (const type of allTileTypes()) {
    for (let i = 0; i < type.copies; i++) pool.push(type.id);
  }
  const startType = TILE_DATA.startTile.type;
  const startIndex = pool.indexOf(startType);
  if (startIndex < 0) throw new Error(`start tile missing from pool: ${startType}`);
  pool.splice(startIndex, 1);
  const bag = shuffle(pool, rng);
  const tiles: PlacedTile[] = [
    {
      x: 0,
      y: 0,
      type: startType,
      rot: TILE_DATA.startTile.rot,
      meeple: null,
      meepleFeature: null,
    },
  ];
  const currentTile = bag.shift() ?? null;
  const state: GameState = {
    version: 1,
    config: {
      ...config,
      seats: config.seats.map((s) => ({ ...s })),
    },
    tiles,
    bag,
    currentTile,
    current: 0,
    turn: 1,
    scores: new Array<number>(config.playerCount).fill(0),
    meeplesLeft: new Array<number>(config.playerCount).fill(MEEPLES_PER_PLAYER),
    moves: [],
    status: 'playing',
    endReason: null,
    lastScored: [],
    completed: new Array<number>(config.playerCount).fill(0),
    discarded: [],
    lastMove: null,
  };
  if (currentTile == null) endGame(state);
  return state;
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config, seats: state.config.seats.map((s) => ({ ...s })) },
    tiles: state.tiles.map((t) => ({ ...t })),
    bag: [...state.bag],
    scores: [...state.scores],
    meeplesLeft: [...state.meeplesLeft],
    moves: state.moves.map((m) => ({ ...m })),
    lastScored: state.lastScored.map((f) => ({
      ...f,
      tiles: f.tiles.map((c) => ({ ...c })),
      seats: [...f.seats],
      meeples: f.meeples.map((m) => ({ ...m })),
    })),
    completed: [...state.completed],
    discarded: [...state.discarded],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

export function viewFor(state: GameState): GameView {
  return {
    version: 1,
    config: state.config,
    tiles: state.tiles,
    bagCount: state.bag.length,
    currentTile: state.currentTile,
    current: state.current,
    turn: state.turn,
    scores: state.scores,
    meeplesLeft: state.meeplesLeft,
    moves: state.moves,
    status: state.status,
    endReason: state.endReason,
    lastScored: state.lastScored,
    completed: state.completed,
    discarded: state.discarded,
    lastMove: state.lastMove,
  };
}

export function tileAt(tiles: PlacedTile[], x: number, y: number): PlacedTile | null {
  for (let i = tiles.length - 1; i >= 0; i--) {
    if (tiles[i].x === x && tiles[i].y === y) return tiles[i];
  }
  return null;
}

export function frontierCells(tiles: PlacedTile[]): Cell[] {
  const occupied = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const cells = new Map<string, Cell>();
  for (const tile of tiles) {
    for (let d = 0; d < 4; d++) {
      const x = tile.x + DX[d];
      const y = tile.y + DY[d];
      const key = `${x},${y}`;
      if (!occupied.has(key) && !cells.has(key)) cells.set(key, { x, y });
    }
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export interface PlacementProblem {
  reason: ErrorCode;
  params?: Record<string, string | number>;
}

export function placementProblem(
  tiles: PlacedTile[],
  typeId: string,
  rot: Rotation,
  x: number,
  y: number,
): PlacementProblem | null {
  if (!isRotation(rot)) return { reason: 'bad-rotation' };
  let type;
  try {
    type = tileType(typeId);
  } catch {
    return { reason: 'unknown-tile' };
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { reason: 'bad-move' };
  if (tileAt(tiles, x, y)) return { reason: 'occupied' };
  const neighbours: { dir: number; tile: PlacedTile }[] = [];
  for (let d = 0; d < 4; d++) {
    const neighbour = tileAt(tiles, x + DX[d], y + DY[d]);
    if (neighbour) neighbours.push({ dir: d, tile: neighbour });
  }
  if (neighbours.length === 0) return { reason: 'not-adjacent' };
  for (const { dir, tile } of neighbours) {
    const mine = edgeAt(type.id, rot, dir);
    const theirs = edgeAt(tile.type, tile.rot, OPPOSITE[dir]);
    if (mine !== theirs) {
      return { reason: 'edge-mismatch', params: { dir, mine, theirs } };
    }
  }
  return null;
}

function rotationSignature(typeId: string, rot: Rotation): string {
  const type = tileType(typeId);
  const edges = [0, 1, 2, 3].map((d) => edgeAt(type.id, rot, d)).join('');
  const features = localFeatures(type.id, rot)
    .map((f) => `${f.type}:${[...f.edges].sort().join('.')}`)
    .join('|');
  return `${edges}/${type.center}/${features}`;
}

export function meepleChoicesFor(
  state: Pick<GameState, 'tiles' | 'currentTile' | 'meeplesLeft'>,
  seat: number,
  x: number,
  y: number,
  rot: Rotation,
): MeepleChoice[] {
  if (!state.currentTile) return [];
  if ((state.meeplesLeft[seat] ?? 0) <= 0) return [];
  const tile: PlacedTile = {
    x,
    y,
    type: state.currentTile,
    rot,
    meeple: null,
    meepleFeature: null,
  };
  const tiles = [...state.tiles, tile];
  const tileIndex = tiles.length - 1;
  const analysis = analyze(tiles);
  const choices: MeepleChoice[] = [];
  for (const local of localFeatures(tile.type, tile.rot)) {
    const feature = featureForNode(analysis, tileIndex, local.index);
    if (!feature) continue;
    choices.push({
      index: local.index,
      type: local.type,
      tiles: feature.tileIndexes.length,
      openEdges: feature.openEdges,
      pointsIfCompleted: featurePoints(feature, true),
      complete: feature.complete,
      occupied: feature.meeples.length > 0,
    });
  }
  return choices;
}

function placementMoves(state: GameState, seat: number): Move[] {
  if (!state.currentTile || state.status !== 'playing') return [];
  const typeId = state.currentTile;
  const out: Move[] = [];
  for (const cell of frontierCells(state.tiles)) {
    const seen = new Set<string>();
    for (let r = 0; r < 4; r++) {
      const rot = r as Rotation;
      if (placementProblem(state.tiles, typeId, rot, cell.x, cell.y)) continue;
      const sig = rotationSignature(typeId, rot);
      if (seen.has(sig)) continue;
      seen.add(sig);
      const choices = meepleChoicesFor(state, seat, cell.x, cell.y, rot);
      out.push({ seat, kind: 'place', x: cell.x, y: cell.y, rot, meeple: null });
      for (const choice of choices) {
        if (choice.occupied || choice.complete) continue;
        out.push({
          seat,
          kind: 'place',
          x: cell.x,
          y: cell.y,
          rot,
          meeple: choice.index,
        });
      }
    }
  }
  return out;
}

export function legalMoves(state: GameState, seat: number): Move[] {
  if (state.status !== 'playing' || state.current !== seat) return [];
  const moves = placementMoves(state, seat);
  if (moves.length > 0) return moves;
  if (!state.currentTile) return [];
  return [{ seat, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null }];
}

export function placementsOnly(state: GameState, seat: number): Move[] {
  if (state.status !== 'playing' || state.current !== seat) return [];
  return placementMoves(state, seat);
}

export function mustDiscard(state: GameState, seat: number): boolean {
  if (state.status !== 'playing' || state.current !== seat || !state.currentTile) return false;
  return placementMoves(state, seat).length === 0;
}

function removeMeeples(feature: GlobalFeature, tiles: PlacedTile[], meeplesLeft: number[]): void {
  for (const meeple of feature.meeples) {
    const tile = tiles[meeple.tileIndex];
    if (tile) {
      tile.meeple = null;
      tile.meepleFeature = null;
    }
    meeplesLeft[meeple.seat] = (meeplesLeft[meeple.seat] ?? 0) + 1;
  }
}

function toScored(feature: GlobalFeature, tiles: PlacedTile[], complete: boolean): ScoredFeature {
  const points = featurePoints(feature, complete);
  const counts = meepleCounts(feature);
  return {
    type: feature.type,
    tiles: feature.tileIndexes.map((i) => ({ x: tiles[i].x, y: tiles[i].y })),
    points,
    seats: majoritySeats(feature),
    complete,
    meeples: counts,
  };
}

function scoreCompleted(
  tiles: PlacedTile[],
  scores: number[],
  meeplesLeft: number[],
  completed: number[],
): ScoredFeature[] {
  const analysis = analyze(tiles);
  const scored: ScoredFeature[] = [];
  for (const feature of analysis.features) {
    if (!feature.complete) continue;
    if (feature.meeples.length === 0) continue;
    const row = toScored(feature, tiles, true);
    for (const seat of row.seats) {
      scores[seat] = (scores[seat] ?? 0) + row.points;
      completed[seat] = (completed[seat] ?? 0) + 1;
    }
    removeMeeples(feature, tiles, meeplesLeft);
    scored.push(row);
  }
  return scored;
}

function endGame(state: GameState): void {
  const analysis = analyze(state.tiles);
  const finalRows: ScoredFeature[] = [];
  for (const feature of analysis.features) {
    if (feature.meeples.length === 0) continue;
    if (feature.complete) continue;
    const row = toScored(feature, state.tiles, false);
    for (const seat of row.seats) {
      state.scores[seat] = (state.scores[seat] ?? 0) + row.points;
    }
    finalRows.push(row);
  }
  state.status = 'ended';
  state.endReason = 'bag-empty';
  state.currentTile = null;
  state.lastScored = [...state.lastScored, ...finalRows];
}

function finishTurn(state: GameState): void {
  if (state.bag.length === 0) {
    endGame(state);
    return;
  }
  state.currentTile = state.bag.shift() ?? null;
  state.current = (state.current + 1) % state.config.playerCount;
  state.turn++;
}

export function apply(state: GameState, move: Move): ApplyResult {
  if (state.status === 'ended') return fail('game-over');
  if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= state.config.playerCount) {
    return fail('bad-seat');
  }
  if (move.seat !== state.current) return fail('not-your-turn');
  if (!state.currentTile) return fail('no-current-tile');
  if (move.kind !== 'place' && move.kind !== 'discard') return fail('bad-move');

  if (move.kind === 'discard') {
    if (placementMoves(state, move.seat).length > 0) return fail('cannot-discard');
    const next = cloneState(state);
    if (next.currentTile) next.discarded.push(next.currentTile);
    next.moves.push({ ...move });
    next.lastMove = { ...move };
    next.lastScored = [];
    next.currentTile = null;
    finishTurn(next);
    return { ok: true, state: next };
  }

  if (!isRotation(move.rot)) return fail('bad-rotation');
  const problem = placementProblem(state.tiles, state.currentTile, move.rot, move.x, move.y);
  if (problem) return fail(problem.reason, problem.params);

  const next = cloneState(state);
  const typeId = next.currentTile;
  if (!typeId) return fail('no-current-tile');
  const tile: PlacedTile = {
    x: move.x,
    y: move.y,
    type: typeId,
    rot: move.rot,
    meeple: null,
    meepleFeature: null,
  };

  if (move.meeple != null) {
    if ((next.meeplesLeft[move.seat] ?? 0) <= 0) return fail('no-meeples');
    const local = localFeatures(typeId, move.rot)[move.meeple];
    if (!local) return fail('bad-meeple');
    const probeTiles = [...next.tiles, { ...tile }];
    const analysis = analyze(probeTiles);
    const global = featureForNode(analysis, probeTiles.length - 1, local.index);
    if (!global) return fail('bad-meeple');
    if (global.meeples.length > 0) return fail('feature-occupied');
    if (global.complete) return fail('feature-complete');
    tile.meeple = move.seat;
    tile.meepleFeature = local.index;
  }

  next.tiles.push(tile);
  next.moves.push({ ...move });
  next.lastMove = { ...move };
  if (move.meeple != null) {
    next.meeplesLeft[move.seat] = (next.meeplesLeft[move.seat] ?? 0) - 1;
  }
  next.lastScored = scoreCompleted(
    next.tiles,
    next.scores,
    next.meeplesLeft,
    next.completed,
  );
  next.currentTile = null;
  finishTurn(next);
  return { ok: true, state: next };
}

export interface Simulation {
  tiles: PlacedTile[];
  scores: number[];
  meeplesLeft: number[];
  completed: number[];
  scored: ScoredFeature[];
}

/** Apply a known-legal placement to a board without drawing from the bag.
 *  Used by the AI so it never needs the hidden order of the draw pile. */
export function simulatePlacement(
  tiles: PlacedTile[],
  typeId: string,
  seat: number,
  move: Move,
  scores: number[],
  meeplesLeft: number[],
  completed: number[],
): Simulation {
  const nextTiles = tiles.map((t) => ({ ...t }));
  const nextScores = [...scores];
  const nextMeeples = [...meeplesLeft];
  const nextCompleted = [...completed];
  const tile: PlacedTile = {
    x: move.x,
    y: move.y,
    type: typeId,
    rot: move.rot,
    meeple: null,
    meepleFeature: null,
  };
  if (move.meeple != null) {
    tile.meeple = seat;
    tile.meepleFeature = move.meeple;
    nextMeeples[seat] = (nextMeeples[seat] ?? 0) - 1;
  }
  nextTiles.push(tile);
  const scored = scoreCompleted(nextTiles, nextScores, nextMeeples, nextCompleted);
  return {
    tiles: nextTiles,
    scores: nextScores,
    meeplesLeft: nextMeeples,
    completed: nextCompleted,
    scored,
  };
}

export function score(state: GameState): ScoreRow[] {
  return state.config.seats.map((seat, i) => ({
    seat: i,
    name: seat.name,
    score: state.scores[i] ?? 0,
  }));
}

export function ranking(state: GameState): RankingRow[] {
  const rows: RankingRow[] = state.config.seats.map((seat, i) => ({
    seat: i,
    name: seat.name,
    score: state.scores[i] ?? 0,
    completed: state.completed[i] ?? 0,
    meeplesLeft: state.meeplesLeft[i] ?? 0,
    rank: 0,
  }));
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.completed !== a.completed) return b.completed - a.completed;
    return a.seat - b.seat;
  });
  let rank = 0;
  let prev: RankingRow | null = null;
  for (const row of rows) {
    if (!prev || row.score !== prev.score || row.completed !== prev.completed) rank++;
    row.rank = rank;
    prev = row;
  }
  return rows;
}

export function result(state: GameState): GameResult | null {
  if (state.status !== 'ended') return null;
  const rows = ranking(state);
  const tiedWinners = rows.filter((r) => r.rank === 1).map((r) => r.seat);
  return {
    winner: tiedWinners[0] ?? null,
    tiedWinners,
    reason: state.endReason === 'no-tiles' ? 'no-tiles' : 'bag-empty',
    ranking: rows,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify({ version: STATE_VERSION, state });
}

export function deserialize(json: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('save is not valid JSON');
  }
  const wrapped = parsed as { version?: number; state?: GameState };
  if (wrapped.version !== STATE_VERSION || !wrapped.state) {
    throw new Error(`unsupported save version: ${String(wrapped.version)}`);
  }
  const state = wrapped.state;
  if (state.version !== 1) throw new Error('unsupported state version');
  const problems = invariants(state);
  if (problems.length > 0) throw new Error(`invalid save: ${problems[0]}`);
  return state;
}

export function replay(config: GameConfig, moves: Move[]): GameState {
  let state = setup(config);
  for (const move of moves) {
    const out = apply(state, move);
    if (!out.ok) throw new Error(`illegal replay move: ${out.reason}`);
    state = out.state;
  }
  return state;
}

export function invariants(state: GameState): string[] {
  const problems: string[] = [];
  const count = state.config?.playerCount;
  if (count !== 2 && count !== 3 && count !== 4) problems.push('bad playerCount');
  if (!state.config?.seats || state.config.seats.length !== count) problems.push('bad seats');
  if (!Array.isArray(state.tiles) || state.tiles.length === 0) problems.push('no tiles');
  if (!Array.isArray(state.bag)) problems.push('bad bag');
  if (!Array.isArray(state.scores) || state.scores.length !== count) problems.push('bad scores');
  if (!Array.isArray(state.meeplesLeft) || state.meeplesLeft.length !== count) {
    problems.push('bad meeple supply');
  }
  if (problems.length > 0) return problems;

  const cells = new Set<string>();
  const meepleTally = new Array<number>(count).fill(0);
  for (const tile of state.tiles) {
    const key = `${tile.x},${tile.y}`;
    if (cells.has(key)) problems.push(`duplicate tile at ${key}`);
    cells.add(key);
    if (!isRotation(tile.rot)) problems.push(`bad rotation at ${key}`);
    let locals;
    try {
      tileType(tile.type);
      locals = localFeatures(tile.type, tile.rot);
    } catch {
      problems.push(`unknown tile ${tile.type}`);
      continue;
    }
    if (tile.meeple != null) {
      if (tile.meeple < 0 || tile.meeple >= count) problems.push(`bad meeple seat at ${key}`);
      else meepleTally[tile.meeple]++;
      if (tile.meepleFeature == null) {
        problems.push(`meeple without feature at ${key}`);
      } else {
        const local = locals[tile.meepleFeature];
        if (!local) problems.push(`bad meeple feature at ${key}`);
      }
    } else if (tile.meepleFeature != null) {
      problems.push(`feature without meeple at ${key}`);
    }
  }

  for (let seat = 0; seat < count; seat++) {
    if ((state.meeplesLeft[seat] ?? -1) < 0 || (state.meeplesLeft[seat] ?? 99) > MEEPLES_PER_PLAYER) {
      problems.push(`bad meeple supply for seat ${seat}`);
    }
    if (state.meeplesLeft[seat] + meepleTally[seat] !== MEEPLES_PER_PLAYER) {
      problems.push(`meeple conservation failed for seat ${seat}`);
    }
    if ((state.scores[seat] ?? -1) < 0) problems.push(`negative score for seat ${seat}`);
  }

  for (const id of state.bag) {
    try {
      tileType(id);
    } catch {
      problems.push(`unknown bag tile ${id}`);
    }
  }
  if (state.currentTile != null) {
    try {
      tileType(state.currentTile);
    } catch {
      problems.push('unknown current tile');
    }
  }
  const accounted =
    state.tiles.length +
    state.bag.length +
    (state.currentTile ? 1 : 0) +
    state.discarded.length;
  if (accounted !== totalTiles()) {
    problems.push(`tile conservation failed: ${accounted} != ${totalTiles()}`);
  }
  if (state.status === 'playing') {
    if (state.current < 0 || state.current >= count) problems.push('bad current seat');
    if (!state.currentTile) problems.push('playing without a tile');
    if (state.endReason != null) problems.push('playing with an end reason');
  } else if (state.status === 'ended') {
    if (state.endReason == null) problems.push('ended without a reason');
    if (state.currentTile != null) problems.push('ended with a tile in hand');
  } else {
    problems.push('bad status');
  }
  if (state.lastScored.some((f) => f.points < 0)) problems.push('negative feature score');
  return problems;
}

export function errorTextKey(reason: ErrorCode): string {
  return `error.${reason}`;
}
