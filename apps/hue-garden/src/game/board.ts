import type { ErrorCode, PlacedTile, TileId } from './types';
import { isValidTile, tileColor, tileShape } from './tiles';

export type Axis = 0 | 1; // 0 = row (east/west), 1 = column (north/south)

export interface Cell {
  x: number;
  y: number;
}

export function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function boardMap(board: readonly PlacedTile[]): Map<string, TileId> {
  const map = new Map<string, TileId>();
  for (const placed of board) map.set(key(placed.x, placed.y), placed.tile);
  return map;
}

export const AXIS_DELTA: Record<Axis, Cell> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
};

export function axisName(axis: Axis): 'row' | 'col' {
  return axis === 0 ? 'row' : 'col';
}

export function lineCells(
  map: Map<string, TileId>,
  x: number,
  y: number,
  axis: Axis,
): Cell[] {
  if (!map.has(key(x, y))) return [];
  const d = AXIS_DELTA[axis];
  let sx = x;
  let sy = y;
  while (map.has(key(sx - d.x, sy - d.y))) {
    sx -= d.x;
    sy -= d.y;
  }
  const cells: Cell[] = [];
  let cx = sx;
  let cy = sy;
  while (map.has(key(cx, cy))) {
    cells.push({ x: cx, y: cy });
    cx += d.x;
    cy += d.y;
  }
  return cells;
}

export function lineTiles(map: Map<string, TileId>, cells: readonly Cell[]): TileId[] {
  return cells.map((c) => map.get(key(c.x, c.y)) as TileId);
}

/** A complete, maximal line must be one attribute with no repeats. */
export function lineError(tiles: readonly TileId[]): ErrorCode | null {
  if (tiles.length > 6) return 'line-too-long';
  if (tiles.length <= 1) return null;
  if (tiles.some((t) => !isValidTile(t))) return 'unknown-tile';

  const colors = new Set(tiles.map(tileColor));
  const shapes = new Set(tiles.map(tileShape));
  const combos = new Set(tiles);

  const sameColor = colors.size === 1 && shapes.size === tiles.length;
  const sameShape = shapes.size === 1 && colors.size === tiles.length;
  if (sameColor || sameShape) return null;
  if (combos.size < tiles.length) return 'line-duplicate';
  return 'line-mixed';
}

export function lineIsValid(tiles: readonly TileId[]): boolean {
  return lineError(tiles) === null;
}

export interface LineRef {
  axis: Axis;
  cells: Cell[];
}

export function lineKey(axis: Axis, cells: readonly Cell[]): string {
  const a = cells[0];
  const b = cells[cells.length - 1];
  return `${axis}:${a.x},${a.y}-${b.x},${b.y}`;
}

/** All maximal lines that pass through the touched cells, de-duplicated. */
export function touchedLines(
  map: Map<string, TileId>,
  touched: readonly Cell[],
): LineRef[] {
  const out = new Map<string, LineRef>();
  for (const cell of touched) {
    for (const axis of [0, 1] as const) {
      const cells = lineCells(map, cell.x, cell.y, axis);
      if (cells.length === 0) continue;
      const k = lineKey(axis, cells);
      if (!out.has(k)) out.set(k, { axis, cells });
    }
  }
  return [...out.values()];
}

export function boardBounds(board: readonly PlacedTile[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (board.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of board) {
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
  }
  return { minX, maxX, minY, maxY };
}

export function neighbours(cell: Cell): Cell[] {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ];
}

export function isConnectedBoard(board: readonly PlacedTile[]): boolean {
  if (board.length <= 1) return true;
  const map = boardMap(board);
  const start = board[0];
  const seen = new Set<string>([key(start.x, start.y)]);
  const queue: Cell[] = [{ x: start.x, y: start.y }];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const n of neighbours(cell)) {
      const k = key(n.x, n.y);
      if (map.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size === board.length;
}
