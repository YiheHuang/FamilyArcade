import { mulberry32, seedFromString, shuffled } from './rng';
import {
  AXIS_DELTA,
  axisName,
  boardMap,
  key,
  lineCells,
  lineError,
  lineKey,
  touchedLines,
  type Axis,
  type Cell,
} from './board';
import { fullBag, isValidTile } from './tiles';
import type {
  ApplyResult,
  EndReason,
  ErrorCode,
  GameConfig,
  GameEvent,
  GameResult,
  GameState,
  Move,
  MovePreview,
  MoveScore,
  PlayerView,
  PlacedTile,
  ScoreRow,
  ScoredLine,
  SeatConfig,
  TileId,
} from './types';

export const HAND_SIZE = 6;
export const MAX_PLAY_TILES = 3;
export const BLOOM_BONUS = 6;
export const CLEAR_BONUS = 6;
export const MAX_TURNS = 500;
export const OPENING = { x: 0, y: 0 } as const;

interface ValidatedPlay {
  placements: PlacedTile[];
  score: MoveScore;
}

/* ------------------------------------------------------------------ helpers */

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: {
      ...state.config,
      seats: state.config.seats.map((s) => ({ ...s })),
    },
    board: state.board.map((t) => ({ ...t })),
    hands: state.hands.map((hand) => [...hand]),
    bag: [...state.bag],
    scores: [...state.scores],
    blooms: [...state.blooms],
    winners: [...state.winners],
    moves: state.moves.map(cloneMove),
    lastMove: state.lastMove ? cloneMove(state.lastMove) : null,
    lastScore: state.lastScore ? cloneScore(state.lastScore) : null,
  };
}

function cloneMove(move: Move): Move {
  if (move.kind === 'play') {
    return { ...move, placements: move.placements.map((p) => ({ ...p })) };
  }
  if (move.kind === 'swap') return { ...move, hand: [...move.hand] };
  return { ...move };
}

function cloneScore(score: MoveScore): MoveScore {
  return {
    ...score,
    lines: score.lines.map((line) => ({
      ...line,
      from: { ...line.from },
      to: { ...line.to },
      tiles: [...line.tiles],
    })),
  };
}

function handWithout(hand: readonly TileId[], placements: readonly PlacedTile[]): TileId[] {
  const out = [...hand];
  for (const placed of placements) {
    const index = out.indexOf(placed.tile);
    if (index >= 0) out.splice(index, 1);
  }
  return out;
}

function scoreLines(map: Map<string, TileId>, touched: readonly Cell[]): MoveScore {
  const lines: ScoredLine[] = [];
  let points = 0;
  let bloomCount = 0;
  const seen = new Set<string>();
  for (const { axis, cells } of touchedLines(map, touched)) {
    if (cells.length < 2) continue;
    const k = lineKey(axis, cells);
    if (seen.has(k)) continue;
    seen.add(k);
    const tiles = cells.map((c) => map.get(key(c.x, c.y)) as TileId);
    const bloom = cells.length === 6;
    const linePoints = cells.length + (bloom ? BLOOM_BONUS : 0);
    points += linePoints;
    if (bloom) bloomCount++;
    lines.push({
      axis: axisName(axis),
      from: { ...cells[0] },
      to: { ...cells[cells.length - 1] },
      length: cells.length,
      points: linePoints,
      bloom,
      tiles,
    });
  }
  if (points === 0 && touched.length === 1) {
    // A lone opening tile is still a line of one.
    const tile = map.get(key(touched[0].x, touched[0].y));
    if (tile !== undefined) {
      points = 1;
      lines.push({
        axis: 'row',
        from: { ...touched[0] },
        to: { ...touched[0] },
        length: 1,
        points: 1,
        bloom: false,
        tiles: [tile],
      });
    }
  }
  return { points, lines, bloomCount };
}

function hasAdjacentExisting(
  original: Map<string, TileId>,
  placements: readonly PlacedTile[],
): boolean {
  for (const p of placements) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (original.has(key(p.x + dx, p.y + dy))) return true;
    }
  }
  return false;
}

function playAxis(placements: readonly PlacedTile[]): Axis | null {
  if (placements.length <= 1) return 0;
  const sameY = placements.every((p) => p.y === placements[0].y);
  const sameX = placements.every((p) => p.x === placements[0].x);
  if (sameY && !sameX) return 0;
  if (sameX && !sameY) return 1;
  return null;
}

/** Validate every rule of a play without mutating the state. */
export function validatePlay(
  state: GameState,
  move: Extract<Move, { kind: 'play' }>,
): { ok: true; play: ValidatedPlay } | { ok: false; reason: ErrorCode; params?: Record<string, string | number> } {
  const placements = move.placements;
  if (!Array.isArray(placements) || placements.length === 0) {
    return { ok: false, reason: 'no-tiles' };
  }
  if (placements.length > MAX_PLAY_TILES) {
    return { ok: false, reason: 'too-many-tiles', params: { max: MAX_PLAY_TILES } };
  }
  if (state.board.length === 0 && placements.length > MAX_PLAY_TILES) {
    return { ok: false, reason: 'too-many-tiles', params: { max: MAX_PLAY_TILES } };
  }

  const cells = new Set<string>();
  for (const p of placements) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !isValidTile(p.tile)) {
      return { ok: false, reason: 'unknown-tile' };
    }
    const k = key(p.x, p.y);
    if (cells.has(k)) return { ok: false, reason: 'cell-occupied' };
    cells.add(k);
  }

  const original = boardMap(state.board);
  for (const p of placements) {
    if (original.has(key(p.x, p.y))) return { ok: false, reason: 'cell-occupied' };
  }

  const hand = state.hands[move.seat];
  if (!hand) return { ok: false, reason: 'bad-seat' };
  const available = new Map<TileId, number>();
  for (const tile of hand) available.set(tile, (available.get(tile) ?? 0) + 1);
  for (const p of placements) {
    const left = available.get(p.tile) ?? 0;
    if (left <= 0) return { ok: false, reason: 'tile-not-in-hand' };
    available.set(p.tile, left - 1);
  }

  const axis = playAxis(placements);
  if (axis === null) return { ok: false, reason: 'not-in-line' };

  const sorted = [...placements].sort((a, b) =>
    axis === 0 ? (a.x === b.x ? a.y - b.y : a.x - b.x) : a.y === b.y ? a.x - b.x : a.y - b.y,
  );
  const d = AXIS_DELTA[axis];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - sorted[i - 1].x !== d.x || sorted[i].y - sorted[i - 1].y !== d.y) {
      return { ok: false, reason: 'not-contiguous' };
    }
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const before = original.get(key(first.x - d.x, first.y - d.y));
  const after = original.get(key(last.x + d.x, last.y + d.y));
  if (before !== undefined && after !== undefined) {
    return { ok: false, reason: 'cannot-insert' };
  }
  // A new tile may never be slipped between two existing tiles, in either axis.
  for (const p of sorted) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      if (
        original.has(key(p.x - dx, p.y - dy)) &&
        original.has(key(p.x + dx, p.y + dy))
      ) {
        return { ok: false, reason: 'cannot-insert' };
      }
    }
  }

  if (original.size === 0) {
    if (!sorted.some((p) => p.x === OPENING.x && p.y === OPENING.y)) {
      return { ok: false, reason: 'opening-origin' };
    }
  } else if (!hasAdjacentExisting(original, sorted)) {
    return { ok: false, reason: 'not-connected' };
  }

  const map = new Map(original);
  for (const p of sorted) map.set(key(p.x, p.y), p.tile);

  const touched = sorted.map((p) => ({ x: p.x, y: p.y }));
  const lines = touchedLines(map, touched);
  for (const line of lines) {
    const tiles = line.cells.map((c) => map.get(key(c.x, c.y)) as TileId);
    const err = lineError(tiles);
    if (err) return { ok: false, reason: err };
  }

  const score = scoreLines(map, touched);
  return {
    ok: true,
    play: {
      placements: sorted.map((p) => ({ x: p.x, y: p.y, tile: p.tile })),
      score,
    },
  };
}

/* ------------------------------------------------------------------- setup */

function validateConfig(config: GameConfig): void {
  const count = config.playerCount;
  if (count !== 2 && count !== 3 && count !== 4) throw new Error('bad-config: player count');
  if (!Array.isArray(config.seats) || config.seats.length !== count) {
    throw new Error('bad-config: seats');
  }
  for (const seat of config.seats) {
    if (!seat || typeof seat.name !== 'string' || seat.name.trim().length === 0) {
      throw new Error('bad-config: seat name');
    }
    if (seat.kind !== 'human' && seat.kind !== 'ai') throw new Error('bad-config: seat kind');
    if (!['companion', 'easy', 'normal', 'hard'].includes(seat.level)) {
      throw new Error('bad-config: seat level');
    }
  }
}

export function setup(config: GameConfig, rng: () => number): GameState {
  validateConfig(config);
  const seats: SeatConfig[] = config.seats.map((s) => ({ ...s, name: s.name.trim() }));
  const bag = shuffled(fullBag(), rng);
  const hands: TileId[][] = Array.from({ length: config.playerCount }, () => []);
  for (let round = 0; round < HAND_SIZE; round++) {
    for (let seat = 0; seat < config.playerCount; seat++) {
      const tile = bag.pop();
      if (tile !== undefined) hands[seat].push(tile);
    }
  }
  return {
    version: 1,
    config: { ...config, seats, seed: config.seed || 'hue-garden' },
    board: [],
    hands,
    bag,
    current: 0,
    turn: 1,
    scores: new Array(config.playerCount).fill(0),
    blooms: new Array(config.playerCount).fill(0),
    status: 'playing',
    endReason: null,
    winners: [],
    moves: [],
    lastMove: null,
    lastScore: null,
    consecutivePasses: 0,
    totalPasses: 0,
  };
}

/* -------------------------------------------------------------------- view */

export function view(state: GameState, seat: number | null): PlayerView {
  return {
    version: 1,
    seat,
    config: {
      playerCount: state.config.playerCount,
      seats: state.config.seats.map((s) => ({ name: s.name, kind: s.kind, level: s.level })),
      seed: state.config.seed,
    },
    board: state.board.map((t) => ({ ...t })),
    hand: seat !== null && state.hands[seat] ? [...state.hands[seat]] : null,
    handCounts: state.hands.map((h) => h.length),
    bagCount: state.bag.length,
    current: state.current,
    turn: state.turn,
    status: state.status,
    endReason: state.endReason,
    scores: [...state.scores],
    blooms: [...state.blooms],
    winners: [...state.winners],
    movesCount: state.moves.length,
    lastMove: state.lastMove ? cloneMove(state.lastMove) : null,
    lastScore: state.lastScore ? cloneScore(state.lastScore) : null,
    consecutivePasses: state.consecutivePasses,
  };
}

/** A legal-move scratch state built only from a public player view. Other hands
 *  stay empty and the bag is a dummy of the correct length; this is enough to
 *  enumerate legal plays/swaps for the seat, never to apply or persist. */
export function viewPosition(playerView: PlayerView): GameState {
  const seat = playerView.seat ?? playerView.current;
  const hands: TileId[][] = Array.from({ length: playerView.config.playerCount }, (_, i) =>
    i === seat ? [...(playerView.hand ?? [])] : [],
  );
  return {
    version: 1,
    config: {
      playerCount: playerView.config.playerCount,
      seats: playerView.config.seats.map((s) => ({ ...s })),
      seed: playerView.config.seed,
    },
    board: playerView.board.map((t) => ({ ...t })),
    hands,
    bag: new Array(playerView.bagCount).fill(0),
    current: playerView.current,
    turn: playerView.turn,
    scores: [...playerView.scores],
    blooms: [...playerView.blooms],
    status: playerView.status,
    endReason: playerView.endReason,
    winners: [...playerView.winners],
    moves: [],
    lastMove: playerView.lastMove ? cloneMove(playerView.lastMove) : null,
    lastScore: playerView.lastScore ? cloneScore(playerView.lastScore) : null,
    consecutivePasses: playerView.consecutivePasses,
    totalPasses: 0,
  };
}

/* ----------------------------------------------------------- legal moves */

interface Segment {
  axis: Axis;
  cells: Cell[];
}

function segmentKey(axis: Axis, cells: readonly Cell[]): string {
  return `${axis}:${cells.map((c) => `${c.x},${c.y}`).join('|')}`;
}

function candidateSegments(
  map: Map<string, TileId>,
  maxLength: number,
): Segment[] {
  const out = new Map<string, Segment>();
  const inserted = (cell: Cell): boolean => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      if (map.has(key(cell.x - dx, cell.y - dy)) && map.has(key(cell.x + dx, cell.y + dy))) {
        return true;
      }
    }
    return false;
  };
  const add = (axis: Axis, cells: Cell[]): void => {
    if (cells.every((c) => !map.has(key(c.x, c.y)) && !inserted(c))) {
      const k = segmentKey(axis, cells);
      if (!out.has(k)) out.set(k, { axis, cells });
    }
  };

  if (map.size === 0) {
    for (const axis of [0, 1] as const) {
      const d = AXIS_DELTA[axis];
      for (let length = 1; length <= maxLength; length++) {
        for (let offset = 0; offset < length; offset++) {
          const startX = OPENING.x - offset * d.x;
          const startY = OPENING.y - offset * d.y;
          const cells: Cell[] = [];
          for (let i = 0; i < length; i++) {
            cells.push({ x: startX + i * d.x, y: startY + i * d.y });
          }
          add(axis, cells);
        }
      }
    }
    return [...out.values()];
  }

  const anchors = new Map<string, Cell>();
  for (const tile of map.keys()) {
    const [x, y] = tile.split(',').map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const cell = { x: x + dx, y: y + dy };
      if (!map.has(key(cell.x, cell.y))) anchors.set(key(cell.x, cell.y), cell);
    }
  }

  for (const anchor of anchors.values()) {
    for (const axis of [0, 1] as const) {
      const d = AXIS_DELTA[axis];
      for (let length = 1; length <= maxLength; length++) {
        for (let offset = 0; offset < length; offset++) {
          const startX = anchor.x - offset * d.x;
          const startY = anchor.y - offset * d.y;
          const cells: Cell[] = [];
          for (let i = 0; i < length; i++) {
            cells.push({ x: startX + i * d.x, y: startY + i * d.y });
          }
          add(axis, cells);
        }
      }
    }
  }

  return [...out.values()];
}

function playMoveKey(move: Extract<Move, { kind: 'play' }>): string {
  return move.placements.map((p) => `${p.x},${p.y},${p.tile}`).join('|');
}

function sharesAttribute(a: TileId, b: TileId): boolean {
  return Math.floor(a / 6) === Math.floor(b / 6) || a % 6 === b % 6;
}

/** Enumerate every legal play. The search is deliberately local: only empty
 *  cells touching the courtyard become anchors, and each cell first filters the
 *  hand through the perpendicular line it would join. */
export function enumeratePlayMoves(state: GameState, seat: number): Extract<Move, { kind: 'play' }>[] {
  const hand = state.hands[seat];
  if (!hand || hand.length === 0) return [];
  const map = boardMap(state.board);
  const maxLength = Math.min(MAX_PLAY_TILES, hand.length);
  const segments = candidateSegments(map, maxLength);
  const found = new Map<string, Extract<Move, { kind: 'play' }>>();
  const uniqueTiles = [...new Set(hand)];

  for (const segment of segments) {
    const otherAxis: Axis = segment.axis === 0 ? 1 : 0;

    // Which of this hand's tiles could sit in each cell without breaking the
    // perpendicular line? Usually this is 1–4 tiles, not all six.
    const allowed: Set<TileId>[] = [];
    let impossible = false;
    for (const cell of segment.cells) {
      const set = new Set<TileId>();
      for (const tile of uniqueTiles) {
        map.set(key(cell.x, cell.y), tile);
        const perp = lineCells(map, cell.x, cell.y, otherAxis);
        const perpTiles = perp.map((c) => map.get(key(c.x, c.y)) as TileId);
        if (lineError(perpTiles) === null) set.add(tile);
        map.delete(key(cell.x, cell.y));
      }
      if (set.size === 0) {
        impossible = true;
        break;
      }
      allowed.push(set);
    }
    if (impossible) continue;

    const first = segment.cells[0];
    const last = segment.cells[segment.cells.length - 1];
    const d = AXIS_DELTA[segment.axis];
    const before = map.get(key(first.x - d.x, first.y - d.y));
    const after = map.get(key(last.x + d.x, last.y + d.y));
    if (before !== undefined && after !== undefined) continue;

    const used = new Array(hand.length).fill(false);
    const assigned: TileId[] = [];
    const perpCells: Cell[][] = [];

    const walk = (index: number): void => {
      if (index === segment.cells.length) {
        const axisCells = lineCells(map, first.x, first.y, segment.axis);
        const axisTiles = axisCells.map((c) => map.get(key(c.x, c.y)) as TileId);
        if (lineError(axisTiles) !== null) return;

        const lines: ScoredLine[] = [];
        let points = 0;
        let bloomCount = 0;
        if (axisCells.length >= 2) {
          const bloom = axisCells.length === 6;
          const linePoints = axisCells.length + (bloom ? BLOOM_BONUS : 0);
          points += linePoints;
          if (bloom) bloomCount++;
          lines.push({
            axis: axisName(segment.axis),
            from: { ...axisCells[0] },
            to: { ...axisCells[axisCells.length - 1] },
            length: axisCells.length,
            points: linePoints,
            bloom,
            tiles: axisTiles,
          });
        }
        const seenLines = new Set<string>();
        for (const cells of perpCells) {
          if (cells.length < 2) continue;
          const k = lineKey(otherAxis, cells);
          if (seenLines.has(k)) continue;
          seenLines.add(k);
          const tiles = cells.map((c) => map.get(key(c.x, c.y)) as TileId);
          const bloom = cells.length === 6;
          const linePoints = cells.length + (bloom ? BLOOM_BONUS : 0);
          points += linePoints;
          if (bloom) bloomCount++;
          lines.push({
            axis: axisName(otherAxis),
            from: { ...cells[0] },
            to: { ...cells[cells.length - 1] },
            length: cells.length,
            points: linePoints,
            bloom,
            tiles,
          });
        }
        if (points === 0) {
          points = 1;
          const tile = assigned[0];
          lines.push({
            axis: 'row',
            from: { ...first },
            to: { ...first },
            length: 1,
            points: 1,
            bloom: false,
            tiles: [tile],
          });
        }

        const placements: PlacedTile[] = segment.cells.map((cell, i) => ({
          x: cell.x,
          y: cell.y,
          tile: assigned[i],
        }));
        const move: Extract<Move, { kind: 'play' }> = { kind: 'play', seat, placements };
        const moveKey = playMoveKey(move);
        if (!found.has(moveKey)) found.set(moveKey, move);
        return;
      }

      const cell = segment.cells[index];
      const set = allowed[index];
      const tried = new Set<TileId>();
      for (let i = 0; i < hand.length; i++) {
        if (used[i]) continue;
        const tile = hand[i];
        if (tried.has(tile) || !set.has(tile)) continue;
        if (index === 0 && before !== undefined && !sharesAttribute(tile, before)) continue;
        if (
          index === segment.cells.length - 1 &&
          after !== undefined &&
          !sharesAttribute(tile, after)
        ) {
          continue;
        }
        if (index > 0 && !sharesAttribute(tile, assigned[index - 1])) continue;
        tried.add(tile);

        map.set(key(cell.x, cell.y), tile);
        assigned.push(tile);
        used[i] = true;

        const perp = lineCells(map, cell.x, cell.y, otherAxis);
        const perpTiles = perp.map((c) => map.get(key(c.x, c.y)) as TileId);
        if (lineError(perpTiles) === null) {
          perpCells.push(perp);
          walk(index + 1);
          perpCells.pop();
        }

        used[i] = false;
        assigned.pop();
        map.delete(key(cell.x, cell.y));
      }
    };

    walk(0);
  }

  return [...found.values()].sort((a, b) => playMoveKey(a).localeCompare(playMoveKey(b)));
}

function combinations(count: number, pick: number): number[][] {
  const out: number[][] = [];
  const choose = (start: number, current: number[]): void => {
    if (current.length === pick) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < count; i++) {
      current.push(i);
      choose(i + 1, current);
      current.pop();
    }
  };
  choose(0, []);
  return out;
}

export function legalMoves(state: GameState, seat: number): Move[] {
  if (state.status !== 'playing' || state.current !== seat) return [];
  const plays = enumeratePlayMoves(state, seat);
  const moves: Move[] = [...plays];

  if (state.bag.length > 0) {
    const hand = state.hands[seat] ?? [];
    for (let n = 1; n <= Math.min(MAX_PLAY_TILES, hand.length); n++) {
      if (state.bag.length < n) break;
      for (const indices of combinations(hand.length, n)) {
        moves.push({ kind: 'swap', seat, hand: indices });
      }
    }
  }

  if (plays.length === 0 && state.bag.length === 0) {
    moves.push({ kind: 'pass', seat });
  }
  return moves;
}

/* ---------------------------------------------------------------- preview */

export function previewMove(state: GameState, move: Move): MovePreview | null {
  if (move.kind !== 'play' || state.current !== move.seat) return null;
  const response = validatePlay(state, move);
  if (!response.ok) return null;
  const map = boardMap(state.board);
  for (const p of response.play.placements) map.set(key(p.x, p.y), p.tile);
  const board = state.board.map((t) => ({ ...t }));
  for (const p of response.play.placements) board.push({ ...p });
  return {
    score: response.play.score,
    board,
    hand: handWithout(state.hands[move.seat], response.play.placements),
  };
}

/* ------------------------------------------------------------------ score */

function rankRows(state: GameState): ScoreRow[] {
  const rows: ScoreRow[] = state.config.seats.map((seat, index) => ({
    seat: index,
    name: seat.name,
    points: state.scores[index] ?? 0,
    blooms: state.blooms[index] ?? 0,
    handCount: state.hands[index]?.length ?? 0,
    rank: 0,
  }));
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.blooms !== a.blooms) return b.blooms - a.blooms;
    if (a.handCount !== b.handCount) return a.handCount - b.handCount;
    return a.seat - b.seat;
  });
  let rank = 0;
  let previous: ScoreRow | null = null;
  for (const row of rows) {
    if (
      !previous ||
      row.points !== previous.points ||
      row.blooms !== previous.blooms ||
      row.handCount !== previous.handCount
    ) {
      rank++;
    }
    row.rank = rank;
    previous = row;
  }
  return rows;
}

export function score(state: GameState): ScoreRow[] {
  return rankRows(state);
}

export function computeWinners(state: GameState): number[] {
  return rankRows(state)
    .filter((row) => row.rank === 1)
    .map((row) => row.seat);
}

function finish(state: GameState, reason: Exclude<EndReason, null>): void {
  state.status = 'ended';
  state.endReason = reason;
  state.winners = computeWinners(state);
}

export function result(state: GameState): GameResult | null {
  if (state.status !== 'ended' || !state.endReason) return null;
  const ranking = rankRows(state);
  const winners = ranking.filter((row) => row.rank === 1).map((row) => row.seat);
  return {
    reason: state.endReason,
    winner: winners.length === 1 ? winners[0] : null,
    winners,
    ranking,
  };
}

/* ------------------------------------------------------------------ apply */

function drawToHand(state: GameState, seat: number): void {
  const hand = state.hands[seat];
  while (hand.length < HAND_SIZE && state.bag.length > 0) {
    const tile = state.bag.pop();
    if (tile === undefined) break;
    hand.push(tile);
  }
}

function advance(state: GameState): void {
  state.current = (state.current + 1) % state.config.playerCount;
  state.turn++;
}

function maybeCap(state: GameState): boolean {
  if (state.status === 'playing' && state.turn > MAX_TURNS) {
    finish(state, 'cap');
    return true;
  }
  return false;
}

function validateSwap(
  state: GameState,
  move: Extract<Move, { kind: 'swap' }>,
): ErrorCode | null {
  if (!Array.isArray(move.hand) || move.hand.length < 1) return 'no-tiles';
  if (move.hand.length > MAX_PLAY_TILES) return 'swap-size';
  const hand = state.hands[move.seat];
  if (!hand) return 'bad-seat';
  const seen = new Set<number>();
  for (const index of move.hand) {
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) return 'hand-index';
    if (seen.has(index)) return 'hand-index';
    seen.add(index);
  }
  if (state.bag.length < move.hand.length) return 'bag-too-small';
  return null;
}

function validatePass(state: GameState, seat: number): ErrorCode | null {
  if (state.bag.length > 0) return 'pass-not-allowed';
  if (enumeratePlayMoves(state, seat).length > 0) return 'pass-not-allowed';
  return null;
}

export function apply(state: GameState, move: Move): ApplyResult {
  if (state.status !== 'playing') return { ok: false, reason: 'game-over' };
  if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= state.config.playerCount) {
    return { ok: false, reason: 'bad-seat' };
  }
  if (move.seat !== state.current) return { ok: false, reason: 'not-your-turn' };

  if (move.kind === 'play') {
    const response = validatePlay(state, move);
    if (!response.ok) return { ok: false, reason: response.reason, params: response.params };
    const next = cloneState(state);
    const play = response.play;
    next.hands[move.seat] = handWithout(next.hands[move.seat], play.placements);
    next.board.push(...play.placements.map((p) => ({ ...p })));
    const canonical: Move = {
      kind: 'play',
      seat: move.seat,
      placements: play.placements.map((p) => ({ ...p })),
    };
    next.moves.push(canonical);
    next.lastMove = canonical;
    next.lastScore = cloneScore(play.score);
    next.scores[move.seat] += play.score.points;
    next.blooms[move.seat] += play.score.bloomCount;
    next.consecutivePasses = 0;

    const events: GameEvent[] = [
      {
        type: 'place',
        seat: move.seat,
        cells: play.placements.map((p) => ({ ...p })),
        points: play.score.points,
        blooms: play.score.bloomCount,
        lines: play.score.lines.map((line) => ({
          ...line,
          from: { ...line.from },
          to: { ...line.to },
          tiles: [...line.tiles],
        })),
      },
    ];

    if (next.bag.length === 0 && next.hands[move.seat].length === 0) {
      next.scores[move.seat] += CLEAR_BONUS;
      if (next.lastScore) next.lastScore.endBonus = CLEAR_BONUS;
      finish(next, 'cleared');
      events.push({
        type: 'end',
        reason: 'cleared',
        winners: [...next.winners],
        bonus: CLEAR_BONUS,
      });
      return { ok: true, state: next, events };
    }

    drawToHand(next, move.seat);
    advance(next);
    if (maybeCap(next)) {
      events.push({
        type: 'end',
        reason: 'cap',
        winners: [...next.winners],
        bonus: 0,
      });
    }
    return { ok: true, state: next, events };
  }

  if (move.kind === 'swap') {
    const error = validateSwap(state, move);
    if (error) return { ok: false, reason: error };
    const next = cloneState(state);
    const hand = next.hands[move.seat];
    const indices = [...move.hand].sort((a, b) => b - a);
    const returned: TileId[] = [];
    for (const index of indices) {
      const [tile] = hand.splice(index, 1);
      if (tile !== undefined) returned.push(tile);
    }
    const drawn: TileId[] = [];
    for (let i = 0; i < returned.length; i++) {
      const tile = next.bag.pop();
      if (tile !== undefined) drawn.push(tile);
    }
    next.hands[move.seat] = [...hand, ...drawn];
    next.bag = [...returned, ...next.bag];
    const canonical: Move = { kind: 'swap', seat: move.seat, hand: [...move.hand].sort((a, b) => a - b) };
    next.moves.push(canonical);
    next.lastMove = canonical;
    next.lastScore = null;
    next.consecutivePasses = 0;
    advance(next);
    const events: GameEvent[] = [{ type: 'swap', seat: move.seat, count: returned.length }];
    if (maybeCap(next)) {
      events.push({
        type: 'end',
        reason: 'cap',
        winners: [...next.winners],
        bonus: 0,
      });
    }
    return { ok: true, state: next, events };
  }

  const passError = validatePass(state, move.seat);
  if (passError) return { ok: false, reason: passError };
  const next = cloneState(state);
  const canonical: Move = { kind: 'pass', seat: move.seat };
  next.moves.push(canonical);
  next.lastMove = canonical;
  next.lastScore = null;
  next.consecutivePasses++;
  next.totalPasses++;
  advance(next);
  const events: GameEvent[] = [{ type: 'pass', seat: move.seat }];
  if (next.consecutivePasses >= next.config.playerCount) {
    finish(next, 'blocked');
    events.push({
      type: 'end',
      reason: 'blocked',
      winners: [...next.winners],
      bonus: 0,
    });
  } else if (maybeCap(next)) {
    events.push({
      type: 'end',
      reason: 'cap',
      winners: [...next.winners],
      bonus: 0,
    });
  }
  return { ok: true, state: next, events };
}

/* ----------------------------------------------------------- serialization */

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function assertStateShape(parsed: GameState): void {
  if (!parsed || parsed.version !== 1) throw new Error('save-version');
  if (typeof parsed.config !== 'object' || !Array.isArray(parsed.config.seats)) {
    throw new Error('save-corrupt');
  }
  if (!Array.isArray(parsed.board) || !Array.isArray(parsed.hands) || !Array.isArray(parsed.bag)) {
    throw new Error('save-corrupt');
  }
  if (parsed.hands.length !== parsed.config.playerCount) throw new Error('save-corrupt');
  if (!Array.isArray(parsed.scores) || !Array.isArray(parsed.blooms)) throw new Error('save-corrupt');
  if (!Array.isArray(parsed.moves) || !Array.isArray(parsed.winners)) throw new Error('save-corrupt');
}

export function deserialize(json: string): GameState {
  let parsed: GameState;
  try {
    parsed = JSON.parse(json) as GameState;
  } catch {
    throw new Error('save-corrupt');
  }
  assertStateShape(parsed);
  const problems = invariants(parsed);
  if (problems.length > 0) throw new Error(`save-corrupt: ${problems[0]}`);
  return parsed;
}

export function serializationVersion(): number {
  return 1;
}

export function rngForConfig(config: GameConfig): () => number {
  return mulberry32(seedFromString(config.seed || 'hue-garden'));
}

export function replay(config: GameConfig, moves: readonly Move[]): GameState {
  let state = setup(config, rngForConfig(config));
  for (const move of moves) {
    const out = apply(state, move);
    if (!out.ok) throw new Error(`illegal replay move: ${out.reason}`);
    state = out.state;
  }
  return state;
}

/* -------------------------------------------------------------- invariants */

export function invariants(state: GameState): string[] {
  const problems: string[] = [];
  const count = state.config?.playerCount;
  if (state.version !== 1) problems.push('version must be 1');
  if (count !== 2 && count !== 3 && count !== 4) problems.push('player count must be 2–4');
  if (!state.config?.seats || state.config.seats.length !== count) {
    problems.push('seat config mismatch');
  }
  if (state.hands.length !== count) problems.push('hand count mismatch');
  if (state.scores.length !== count) problems.push('score count mismatch');
  if (state.blooms.length !== count) problems.push('bloom count mismatch');
  if (state.current < 0 || state.current >= count) problems.push('current seat out of range');
  if (state.turn < 1) problems.push('turn must be positive');
  if (!Number.isFinite(state.consecutivePasses) || state.consecutivePasses < 0) {
    problems.push('consecutive passes invalid');
  }

  const placed = new Set<string>();
  for (const t of state.board) {
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) problems.push('non-integer coordinate');
    if (!isValidTile(t.tile)) problems.push('unknown tile on board');
    const k = key(t.x, t.y);
    if (placed.has(k)) problems.push(`duplicate board cell ${k}`);
    placed.add(k);
  }

  const counts = new Array<number>(36).fill(0);
  for (const t of state.board) if (isValidTile(t.tile)) counts[t.tile]++;
  for (const hand of state.hands) {
    if (hand.length > HAND_SIZE) problems.push('hand larger than six');
    for (const tile of hand) {
      if (!isValidTile(tile)) problems.push('unknown tile in hand');
      else counts[tile]++;
    }
  }
  for (const tile of state.bag) {
    if (!isValidTile(tile)) problems.push('unknown tile in bag');
    else counts[tile]++;
  }
  for (let tile = 0; tile < counts.length; tile++) {
    if (counts[tile] !== 3) problems.push(`tile ${tile} count ${counts[tile]} != 3`);
  }

  for (let seat = 0; seat < count; seat++) {
    if (!Number.isInteger(state.scores[seat]) || state.scores[seat] < 0) {
      problems.push('score must be a non-negative integer');
    }
    if (!Number.isInteger(state.blooms[seat]) || state.blooms[seat] < 0) {
      problems.push('bloom count must be a non-negative integer');
    }
  }

  if (state.status === 'ended') {
    if (!state.endReason) problems.push('ended game needs a reason');
    if (state.winners.length === 0) problems.push('ended game needs a winner');
  } else {
    if (state.endReason !== null) problems.push('playing game cannot have an end reason');
    if (state.winners.length !== 0) problems.push('playing game cannot have winners');
  }

  if (state.lastMove === null && state.moves.length > 0) problems.push('missing last move');
  if (state.lastMove !== null && state.moves.length === 0) problems.push('last move without history');

  const map = boardMap(state.board);
  const starts = new Set<string>();
  for (const t of state.board) {
    const west = map.has(key(t.x - 1, t.y));
    const north = map.has(key(t.x, t.y - 1));
    if (!west || !north) starts.add(key(t.x, t.y));
  }
  for (const start of starts) {
    const [x, y] = start.split(',').map(Number);
    for (const axis of [0, 1] as const) {
      const cells = lineCells(map, x, y, axis);
      if (cells.length === 0) continue;
      const tiles = cells.map((c) => map.get(key(c.x, c.y)) as TileId);
      const err = lineError(tiles);
      if (err) problems.push(`invalid ${axisName(axis)} line at ${start}: ${err}`);
    }
  }

  // The board must remain one courtyard: every tile orthogonally connected.
  if (state.board.length > 1) {
    const seen = new Set<string>();
    const queue: Cell[] = [{ x: state.board[0].x, y: state.board[0].y }];
    seen.add(key(state.board[0].x, state.board[0].y));
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const k = key(cell.x + dx, cell.y + dy);
        if (map.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push({ x: cell.x + dx, y: cell.y + dy });
        }
      }
    }
    if (seen.size !== state.board.length) problems.push('board is not connected');
  }

  return problems;
}

export { AXIS_DELTA };
