import { ORI_MAPS, PIECES } from '../game/pieces';

export type TransformKind = 'cw' | 'ccw' | 'mirror';

/**
 * After rotating/flipping a piece, map a cell coordinate (in the source
 * orientation's frame) to the corresponding cell in the target orientation's
 * frame — so the cell the user grabbed stays under the pointer.
 */
export function transformCell(
  piece: number,
  fromO: number,
  kind: TransformKind,
  cell: [number, number],
): [number, number] {
  const or = PIECES[piece].orientations[fromO];
  const map = (x: number, y: number): [number, number] =>
    kind === 'cw'
      ? [or.h - 1 - y, x]
      : kind === 'ccw'
        ? [y, or.w - 1 - x]
        : [or.w - 1 - x, y];

  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i < or.cells.length; i += 2) {
    const [tx, ty] = map(or.cells[i], or.cells[i + 1]);
    if (tx < minX) minX = tx;
    if (ty < minY) minY = ty;
  }
  const [x, y] = map(cell[0], cell[1]);
  return [x - minX, y - minY];
}

/** the target orientation index for a rotation/flip of `fromO` */
export function transformOrientation(
  piece: number,
  fromO: number,
  kind: TransformKind,
): number {
  const maps = ORI_MAPS[piece];
  const table = kind === 'cw' ? maps.rotCw : kind === 'ccw' ? maps.rotCcw : maps.mirror;
  return table[fromO];
}

/** clamp a board cell into the piece's bounding box (for grab offsets) */
export function clampIntoPiece(
  piece: number,
  o: number,
  dx: number,
  dy: number,
): [number, number] {
  const or = PIECES[piece].orientations[o];
  return [
    Math.min(Math.max(dx, 0), or.w - 1),
    Math.min(Math.max(dy, 0), or.h - 1),
  ];
}
