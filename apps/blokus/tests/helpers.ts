import { PIECES } from '../src/game/pieces';
import type { PassMove, PlaceMove } from '../src/game/types';

export function pieceIndexOf(id: string): number {
  const i = PIECES.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`unknown piece ${id}`);
  return i;
}

/** find the exact orientation index for a cell layout (offsets, any translation) */
export function orientationOf(id: string, cells: Array<[number, number]>): number {
  const i = pieceIndexOf(id);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const key = cells
    .map(([x, y]) => [x - minX, y - minY] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([x, y]) => `${x},${y}`)
    .join(';');
  const o = PIECES[i].orientations.findIndex((or) => or.key === key);
  if (o < 0) throw new Error(`unknown orientation of ${id}: ${JSON.stringify(cells)}`);
  return o;
}

export function place(
  p: number,
  id: string,
  cells: Array<[number, number]>,
  x: number,
  y: number,
): PlaceMove {
  return { kind: 'place', p, piece: pieceIndexOf(id), o: orientationOf(id, cells), x, y };
}

export function pass(p: number): PassMove {
  return { kind: 'pass', p };
}
