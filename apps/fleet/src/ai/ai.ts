import {
  BOARD_SIZE,
  FLEET,
  cellCol,
  cellRow,
  coordLabel,
  type Rng,
  type SeatView,
} from '../game/fleet';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason = 'target' | 'parity' | 'density' | 'search';

export interface Hint {
  cell: number;
  reason: HintReason;
  label: string;
}

interface Knowledge {
  unknown: number[];
  misses: Set<number>;
  hits: number[];
  sunk: Set<number>;
  remaining: number[];
}

function readView(view: SeatView): Knowledge {
  const misses = new Set<number>();
  const hits: number[] = [];
  const sunk = new Set<number>();
  const shot = new Set<number>();
  for (const item of view.enemyBoardShots) {
    shot.add(item.cell);
    if (item.result === 'miss') misses.add(item.cell);
    else if (item.result === 'hit') hits.push(item.cell);
  }
  for (const ship of view.enemyShips) {
    for (const cell of ship.cells) {
      sunk.add(cell);
      shot.add(cell);
    }
  }
  const unknown: number[] = [];
  for (let cell = 0; cell < BOARD_SIZE * BOARD_SIZE; cell += 1) {
    if (!shot.has(cell)) unknown.push(cell);
  }
  return {
    unknown,
    misses,
    hits: hits.filter((cell) => !sunk.has(cell)),
    sunk,
    remaining: view.enemyFleet.filter((ship) => !ship.sunk).map((ship) => ship.length),
  };
}

function neighborCells(cell: number): number[] {
  const row = cellRow(cell);
  const col = cellCol(cell);
  const cells: number[] = [];
  if (row > 0) cells.push(cell - BOARD_SIZE);
  if (row < BOARD_SIZE - 1) cells.push(cell + BOARD_SIZE);
  if (col > 0) cells.push(cell - 1);
  if (col < BOARD_SIZE - 1) cells.push(cell + 1);
  return cells;
}

function pick(rng: Rng, cells: number[]): number {
  if (cells.length === 0) return -1;
  const raw = Math.floor(rng() * cells.length);
  return cells[Math.max(0, Math.min(cells.length - 1, raw))];
}

function adjacentUnknown(knowledge: Knowledge, origins: number[]): number[] {
  const seen = new Set<number>();
  for (const origin of origins) {
    for (const cell of neighborCells(origin)) {
      if (knowledge.unknown.includes(cell)) seen.add(cell);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Cells at either end of runs of two or more hits. */
function lineExtensions(knowledge: Knowledge): number[] {
  const hits = new Set([...knowledge.hits, ...knowledge.sunk]);
  const candidates = new Set<number>();
  for (const cell of knowledge.hits) {
    const col = cellCol(cell);
    // Walk left and right along the row.
    let left = cell;
    while (col > 0 && hits.has(left - 1) && cellCol(left - 1) === cellCol(left) - 1) left -= 1;
    let right = cell;
    while (col < BOARD_SIZE - 1 && hits.has(right + 1) && cellCol(right + 1) === cellCol(right) + 1) right += 1;
    if (right - left >= 1) {
      if (left % BOARD_SIZE > 0 && knowledge.unknown.includes(left - 1)) candidates.add(left - 1);
      if (right % BOARD_SIZE < BOARD_SIZE - 1 && knowledge.unknown.includes(right + 1)) candidates.add(right + 1);
    }
    // Walk up and down the column.
    let top = cell;
    while (top >= BOARD_SIZE && hits.has(top - BOARD_SIZE)) top -= BOARD_SIZE;
    let bottom = cell;
    while (bottom < BOARD_SIZE * (BOARD_SIZE - 1) && hits.has(bottom + BOARD_SIZE)) bottom += BOARD_SIZE;
    if (bottom - top >= BOARD_SIZE) {
      if (top >= BOARD_SIZE && knowledge.unknown.includes(top - BOARD_SIZE)) candidates.add(top - BOARD_SIZE);
      if (bottom < BOARD_SIZE * (BOARD_SIZE - 1) && knowledge.unknown.includes(bottom + BOARD_SIZE)) {
        candidates.add(bottom + BOARD_SIZE);
      }
    }
  }
  return [...candidates].sort((a, b) => a - b);
}

function allPlacements(length: number, blocked: Set<number>, requiredHits: Set<number>): number[][] {
  const placements: number[][] = [];
  for (let start = 0; start < BOARD_SIZE * BOARD_SIZE; start += 1) {
    for (const horizontal of [true, false]) {
      const row = cellRow(start);
      const col = cellCol(start);
      if (horizontal ? col + length > BOARD_SIZE : row + length > BOARD_SIZE) continue;
      const cells = Array.from({ length }, (_, index) => start + (horizontal ? index : index * BOARD_SIZE));
      if (cells.some((cell) => blocked.has(cell))) continue;
      if (requiredHits.size > 0 && !cells.some((cell) => requiredHits.has(cell))) continue;
      placements.push(cells);
    }
  }
  return placements;
}

function densityScores(knowledge: Knowledge): Map<number, number> {
  const scores = new Map<number, number>();
  const blocked = new Set([...knowledge.misses, ...knowledge.sunk]);
  const hits = new Set(knowledge.hits);
  for (const length of knowledge.remaining) {
    let placements = allPlacements(length, blocked, hits);
    if (placements.length === 0 && hits.size > 0) placements = allPlacements(length, blocked, new Set());
    for (const cells of placements) {
      const covered = cells.filter((cell) => hits.has(cell)).length;
      const weight = 1 + covered * 2;
      for (const cell of cells) {
        if (!knowledge.unknown.includes(cell)) continue;
        scores.set(cell, (scores.get(cell) ?? 0) + weight);
      }
    }
  }
  return scores;
}

function bestDensity(knowledge: Knowledge, rng: Rng): number {
  const scores = densityScores(knowledge);
  let best = -Infinity;
  let picks: number[] = [];
  for (const cell of knowledge.unknown) {
    const score = scores.get(cell) ?? 0;
    if (score > best) {
      best = score;
      picks = [cell];
    } else if (score === best) {
      picks.push(cell);
    }
  }
  return pick(rng, picks.length ? picks : knowledge.unknown);
}

function parityCells(knowledge: Knowledge): number[] {
  const parity = knowledge.unknown.filter((cell) => (cellRow(cell) + cellCol(cell)) % 2 === 0);
  return parity.length ? parity : knowledge.unknown;
}

export function chooseShot(view: SeatView, level: AiLevel, rng: Rng = () => 0.5): number {
  const knowledge = readView(view);
  if (knowledge.unknown.length === 0) return -1;

  if (level === 'easy') {
    return pick(rng, knowledge.unknown);
  }

  if (level === 'companion') {
    // Gentle: follow up sometimes, often sweep near its own misses, and never
    // obsess over the last enemy ship.
    if (knowledge.remaining.length === 1 && rng() < 0.4) {
      return pick(rng, knowledge.unknown);
    }
    if (knowledge.hits.length > 0 && rng() < 0.55) {
      const adjacent = adjacentUnknown(knowledge, knowledge.hits);
      if (adjacent.length) return pick(rng, adjacent);
    }
    if (rng() < 0.45) {
      const nearMisses = adjacentUnknown(knowledge, [...knowledge.misses]);
      if (nearMisses.length) return pick(rng, nearMisses);
    }
    if (rng() < 0.35) return pick(rng, parityCells(knowledge));
    return pick(rng, knowledge.unknown);
  }

  if (level === 'normal') {
    if (knowledge.hits.length > 0) {
      const line = lineExtensions(knowledge);
      if (line.length) return pick(rng, line);
      const adjacent = adjacentUnknown(knowledge, knowledge.hits);
      if (adjacent.length) return pick(rng, adjacent);
    }
    return pick(rng, parityCells(knowledge));
  }

  // Hard: probability density over every remaining hull, weighted toward the
  // unresolved hits. It only uses public shot results, never the full state.
  return bestDensity(knowledge, rng);
}

export function hint(view: SeatView, rng: Rng = () => 0.5): Hint | null {
  const knowledge = readView(view);
  if (knowledge.unknown.length === 0) return null;
  const cell = chooseShot(view, 'hard', rng);
  if (cell < 0) return null;
  let reason: HintReason = 'density';
  if (knowledge.hits.length > 0) reason = 'target';
  else if (parityCells(knowledge).includes(cell) && Math.min(...knowledge.remaining) <= 3) reason = 'parity';
  else if (knowledge.remaining.includes(5) && (cellRow(cell) === 0 || cellRow(cell) === BOARD_SIZE - 1)) {
    reason = 'search';
  }
  return { cell, reason, label: coordLabel(cell) };
}

/** Public helper for tests and teaching copy. */
export function shipName(id: string): string {
  return FLEET.find((ship) => ship.id === id)?.id ?? id;
}
