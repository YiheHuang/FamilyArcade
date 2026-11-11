import {
  enumeratePlayMoves,
  legalMoves,
  previewMove,
} from '../game/engine';
import { boardMap, key, lineCells, lineError } from '../game/board';
import { makeTile, tileColor, tileShape } from '../game/tiles';
import type {
  AiLevel,
  GameState,
  Move,
  MovePreview,
  PlayerView,
  TileId,
} from '../game/types';

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export interface AiWeights {
  immediate: number;
  potential: number;
  synergy: number;
  threat: number;
  opponent: number;
  noise: number;
}

export const AI_WEIGHTS: Record<AiLevel, AiWeights> = {
  companion: { immediate: 10, potential: 0.8, synergy: 0.4, threat: 0, opponent: 0, noise: 11 },
  easy: { immediate: 10, potential: 0.8, synergy: 0.3, threat: 0, opponent: 0, noise: 5 },
  normal: { immediate: 10, potential: 1.0, synergy: 0.35, threat: 1.0, opponent: 0.15, noise: 1.8 },
  hard: { immediate: 10, potential: 1.0, synergy: 0.35, threat: 1.0, opponent: 0.15, noise: 1.2 },
};

export interface Explain {
  key: string;
  params?: Record<string, string | number>;
}

/** Rebuild a private search position from the player view. Other hands and the
 *  bag contents are not known to the AI; the dummy bag only preserves its size
 *  so that swap legality (and therefore move legality) is unchanged. */
export function positionFromView(view: PlayerView): GameState {
  const seat = view.seat ?? view.current;
  const hands: TileId[][] = Array.from({ length: view.config.playerCount }, (_, i) =>
    i === seat ? [...(view.hand ?? [])] : [],
  );
  return {
    version: 1,
    config: {
      ...view.config,
      seats: view.config.seats.map((s) => ({ ...s })),
    },
    board: view.board.map((t) => ({ ...t })),
    hands,
    bag: new Array(view.bagCount).fill(0),
    current: view.current,
    turn: view.turn,
    scores: [...view.scores],
    blooms: [...view.blooms],
    status: view.status,
    endReason: view.endReason,
    winners: [...view.winners],
    moves: [],
    lastMove: null,
    lastScore: null,
    consecutivePasses: view.consecutivePasses,
    totalPasses: 0,
  };
}

function shareAttribute(a: TileId, b: TileId): boolean {
  return tileColor(a) === tileColor(b) || tileShape(a) === tileShape(b);
}

function handSynergy(hand: readonly TileId[]): number {
  let pairs = 0;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (shareAttribute(hand[i], hand[j])) pairs++;
    }
  }
  return pairs;
}

/** Best score a single remaining hand tile could add to the board next turn.
 *  This is a cheap, honest growth estimate (no hidden tiles consulted). */
export function bestSingleTileScore(
  board: readonly { x: number; y: number; tile: TileId }[],
  hand: readonly TileId[],
): { points: number; count: number } {
  if (hand.length === 0) return { points: 0, count: 0 };
  const map = boardMap(board);
  const anchors = new Map<string, { x: number; y: number }>();
  for (const tile of map.keys()) {
    const [x, y] = tile.split(',').map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!map.has(key(x + dx, y + dy))) {
        anchors.set(key(x + dx, y + dy), { x: x + dx, y: y + dy });
      }
    }
  }

  let best = 0;
  let count = 0;
  const unique = [...new Set(hand)];
  for (const cell of anchors.values()) {
    let inserted = false;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      if (
        map.has(key(cell.x - dx, cell.y - dy)) &&
        map.has(key(cell.x + dx, cell.y + dy))
      ) {
        inserted = true;
        break;
      }
    }
    if (inserted) continue;

    for (const tile of unique) {
      map.set(key(cell.x, cell.y), tile);
      let points = 0;
      let valid = true;
      const seen = new Set<string>();
      for (const axis of [0, 1] as const) {
        const cells = lineCells(map, cell.x, cell.y, axis);
        const k = `${axis}:${cells[0]?.x},${cells[0]?.y}-${cells.at(-1)?.x},${cells.at(-1)?.y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const lineTiles = cells.map((c) => map.get(key(c.x, c.y)) as TileId);
        if (lineError(lineTiles) !== null) {
          valid = false;
          break;
        }
        if (cells.length >= 2) points += cells.length + (cells.length === 6 ? 6 : 0);
      }
      map.delete(key(cell.x, cell.y));
      if (valid && points > 0) {
        count++;
        if (points > best) best = points;
      }
    }
  }
  return { points: best, count };
}

/** Count five-tile lines whose missing tile is not visible to this seat. These
 *  are public warnings: somebody may be holding the bloom. */
export function bloomThreats(view: PlayerView, board: readonly { x: number; y: number; tile: TileId }[], hand: readonly TileId[]): number {
  if (view.bagCount === 0 && view.handCounts.every((n, i) => i === view.seat || n === 0)) {
    return 0;
  }
  const map = boardMap(board);
  const visible = new Set<TileId>(hand);
  for (const t of board) visible.add(t.tile);
  const lines: TileId[][] = [];
  for (const t of board) {
    if (!map.has(key(t.x - 1, t.y))) {
      const cells = lineCells(map, t.x, t.y, 0);
      if (cells.length === 5) lines.push(cells.map((c) => map.get(key(c.x, c.y)) as TileId));
    }
    if (!map.has(key(t.x, t.y - 1))) {
      const cells = lineCells(map, t.x, t.y, 1);
      if (cells.length === 5) lines.push(cells.map((c) => map.get(key(c.x, c.y)) as TileId));
    }
  }
  let threats = 0;
  for (const line of lines) {
    const color = tileColor(line[0]);
    const shape = tileShape(line[0]);
    const allColor = line.every((t) => tileColor(t) === color);
    const allShape = line.every((t) => tileShape(t) === shape);
    let missing: TileId | null = null;
    if (allColor) {
      const shapes = new Set(line.map(tileShape));
      for (let s = 0; s < 6; s++) if (!shapes.has(s)) missing = makeTile(color, s);
    } else if (allShape) {
      const colors = new Set(line.map(tileColor));
      for (let c = 0; c < 6; c++) if (!colors.has(c)) missing = makeTile(c, shape);
    }
    if (missing !== null && !visible.has(missing)) threats++;
  }
  return threats;
}

function evaluateCandidate(
  view: PlayerView,
  preview: MovePreview,
  weights: AiWeights,
  deep: boolean,
): { score: number; followUp: number } {
  const immediate = preview.score.points;
  const synergy = handSynergy(preview.hand);
  const potential = deep
    ? bestSingleTileScore(preview.board, preview.hand)
    : { points: 0, count: 0 };
  const threats = deep && weights.threat > 0 ? bloomThreats(view, preview.board, preview.hand) : 0;
  const opponents = view.scores.filter((_, i) => i !== view.seat);
  const opponentMax = opponents.length ? Math.max(...opponents) : 0;
  const score =
    immediate * weights.immediate +
    potential.points * weights.potential +
    potential.count * 0.15 +
    synergy * weights.synergy -
    threats * weights.threat -
    opponentMax * weights.opponent;
  return { score, followUp: potential.points };
}

function bestFollowUp(
  view: PlayerView,
  board: readonly { x: number; y: number; tile: TileId }[],
  hand: readonly TileId[],
  seat: number,
  budgetLeft: number,
): number {
  if (hand.length === 0 || budgetLeft <= 0) return 0;
  const pseudo: GameState = {
    ...positionFromView({ ...view, hand: [...hand], current: seat, bagCount: 0 }),
    board: board.map((t) => ({ ...t })),
    current: seat,
  };
  const deadline = now() + Math.min(budgetLeft, 90);
  const moves = enumeratePlayMoves(pseudo, seat);
  const candidates: { move: Move; points: number }[] = [];
  for (const move of moves) {
    const preview = previewMove(pseudo, move);
    if (!preview) continue;
    candidates.push({ move, points: preview.score.points });
    if (candidates.length > 30 || now() > deadline) break;
  }
  candidates.sort((a, b) => b.points - a.points);
  let best = 0;
  for (const candidate of candidates.slice(0, 8)) {
    const preview = previewMove(pseudo, candidate.move);
    if (!preview) continue;
    const next = bestSingleTileScore(preview.board, preview.hand);
    best = Math.max(best, candidate.points * 0.5 + next.points);
    if (now() > deadline) break;
  }
  return best;
}

function chooseFrom<M>(items: readonly M[], rng: () => number): M | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

export function chooseMove(
  view: PlayerView,
  level: AiLevel,
  budgetMs: number,
  rng: () => number,
): Move | null {
  if (view.status !== 'playing' || view.current !== view.seat) return null;
  const seat = view.seat ?? view.current;
  const pseudo = positionFromView(view);
  const moves = legalMoves(pseudo, seat);
  if (moves.length === 0) return null;

  const plays = moves.filter((m): m is Extract<Move, { kind: 'play' }> => m.kind === 'play');
  const swaps = moves.filter((m): m is Extract<Move, { kind: 'swap' }> => m.kind === 'swap');
  const passes = moves.filter((m): m is Extract<Move, { kind: 'pass' }> => m.kind === 'pass');

  if (plays.length === 0) {
    if (swaps.length > 0) return chooseFrom(swaps, rng);
    return passes[0] ?? null;
  }

  const weights = AI_WEIGHTS[level];
  const deadline = now() + Math.max(20, budgetMs);
  const scored: {
    move: Extract<Move, { kind: 'play' }>;
    preview: MovePreview;
    score: number;
    follow: number;
    tie: number;
  }[] = [];

  for (const move of plays) {
    if (scored.length > 0 && now() > deadline) break;
    const preview = previewMove(pseudo, move);
    if (!preview) continue;
    const result = evaluateCandidate(view, preview, weights, false);
    scored.push({
      move,
      preview,
      score: result.score + (rng() * 2 - 1) * weights.noise,
      follow: 0,
      tie: rng(),
    });
  }

  if (scored.length === 0) {
    const fallback = plays.find((move) => previewMove(pseudo, move));
    return fallback ?? swaps[0] ?? passes[0] ?? null;
  }

  scored.sort((a, b) => b.score - a.score || a.tie - b.tie);

  if (level === 'companion') {
    const pool = scored.slice(0, Math.min(3, scored.length));
    return chooseFrom(pool, rng)?.move ?? scored[0].move;
  }

  if (level === 'easy') {
    const pool = scored.slice(0, 2);
    const pick = rng() < 0.2 ? pool[1] ?? pool[0] : pool[0];
    return pick.move;
  }

  // Normal and Hard spend their remaining budget on a smaller shortlist.
  const shortlist = scored.slice(0, level === 'hard' ? 12 : 5);
  for (const candidate of shortlist) {
    if (now() > deadline) break;
    const deep = evaluateCandidate(view, candidate.preview, weights, true);
    candidate.score = deep.score + (rng() * 2 - 1) * weights.noise;
    candidate.follow = deep.followUp;
  }
  shortlist.sort((a, b) => b.score - a.score || a.tie - b.tie);

  if (level === 'normal') {
    return shortlist[0]?.move ?? scored[0].move;
  }

  // Hard: a two-step plan over our own reachable board, plus public bloom
  // threats. It never looks at another seat's hand.
  const top = shortlist.slice(0, 8);
  let best = top[0] ?? scored[0];
  let bestScore = -Infinity;
  for (const candidate of top) {
    if (now() > deadline) break;
    const plan = bestFollowUp(
      view,
      candidate.preview.board,
      candidate.preview.hand,
      seat,
      Math.max(10, deadline - now()),
    );
    const total = candidate.score + plan * 0.1;
    if (total > bestScore) {
      bestScore = total;
      best = candidate;
    }
  }
  return best.move;
}

export function explainMove(view: PlayerView, move: Move): Explain {
  if (move.kind === 'swap') {
    return {
      key: 'hint.swap',
      params: { n: move.hand.length },
    };
  }
  if (move.kind === 'pass') return { key: 'hint.pass' };
  const pseudo = positionFromView(view);
  const preview = previewMove(pseudo, move);
  if (!preview) return { key: 'hint.play', params: { points: 0, n: move.placements.length } };
  if (preview.score.bloomCount > 0) {
    return {
      key: 'hint.bloom',
      params: { points: preview.score.points, n: preview.score.bloomCount },
    };
  }
  return {
    key: 'hint.play',
    params: { points: preview.score.points, n: move.placements.length },
  };
}
