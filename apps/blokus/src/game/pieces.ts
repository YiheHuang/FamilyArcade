/**
 * The 21 standard Blokus pieces (polyominoes of size 1–5, 89 squares total).
 *
 * Every piece carries its deduplicated set of orientations (4 rotations ×
 * mirror = at most 8). Cells are stored as flat [dx,dy,...] pairs normalized
 * so that min dx = 0 and min dy = 0. Across all 21 pieces there are exactly
 * 91 distinct orientations — tests assert this.
 */

export interface Orientation {
  /** flat [dx0,dy0,dx1,dy1,...], normalized to min = 0 */
  cells: readonly number[];
  w: number;
  h: number;
  /** canonical identity of this shape orientation */
  key: string;
}

export interface PieceDef {
  id: string;
  size: number;
  orientations: readonly Orientation[];
}

/** Base shapes, one `#` per square. Shapes are the canonical free polyominoes. */
const SHAPES: Record<string, string[]> = {
  I1: ['#'],
  I2: ['##'],
  I3: ['###'],
  L3: ['#.', '##'],
  I4: ['####'],
  O4: ['##', '##'],
  T4: ['###', '.#.'],
  L4: ['###', '#..'],
  S4: ['.##', '##.'],
  F5: ['.##', '##.', '.#.'],
  I5: ['#####'],
  L5: ['####', '#...'],
  N5: ['..##', '###.'],
  P5: ['##', '##', '#.'],
  T5: ['###', '.#.', '.#.'],
  U5: ['#.#', '###'],
  V5: ['#..', '#..', '###'],
  W5: ['#..', '##.', '.##'],
  X5: ['.#.', '###', '.#.'],
  Y5: ['####', '.#..'],
  Z5: ['##.', '.#.', '.##'],
};

function parseShape(rows: string[]): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') cells.push([x, y]);
    });
  });
  return cells;
}

/** Translate so min = 0 and produce the canonical key. */
function normalize(cells: Array<[number, number]>): {
  cells: number[];
  w: number;
  h: number;
  key: string;
} {
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  const shifted = cells
    .map(([x, y]) => [x - minX, y - minY] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let w = 0;
  let h = 0;
  for (const [x, y] of shifted) {
    if (x + 1 > w) w = x + 1;
    if (y + 1 > h) h = y + 1;
  }
  const key = shifted.map(([x, y]) => `${x},${y}`).join(';');
  const flat: number[] = [];
  for (const [x, y] of shifted) flat.push(x, y);
  return { cells: flat, w, h, key };
}

/** Rotate 90° clockwise: (x, y) -> (maxY - y, x). */
function rotate(cells: Array<[number, number]>, maxY: number): Array<[number, number]> {
  return cells.map(([x, y]) => [maxY - y, x]);
}

/** Mirror horizontally: (x, y) -> (maxX - x, y). */
function mirror(cells: Array<[number, number]>, maxX: number): Array<[number, number]> {
  return cells.map(([x, y]) => [maxX - x, y]);
}

function maxOf(cells: Array<[number, number]>, axis: 0 | 1): number {
  let m = 0;
  for (const c of cells) if (c[axis] > m) m = c[axis];
  return m;
}

function orientationsOf(rows: string[]): Orientation[] {
  const base = parseShape(rows);
  const seen = new Map<string, Orientation>();
  for (const start of [base, mirror(base, maxOf(base, 0))]) {
    let rot = start;
    for (let r = 0; r < 4; r++) {
      const n = normalize(rot);
      if (!seen.has(n.key)) {
        seen.set(n.key, { cells: n.cells, w: n.w, h: n.h, key: n.key });
      }
      rot = rotate(rot, maxOf(rot, 1));
    }
  }
  return [...seen.values()].sort((a, b) => a.h - b.h || a.w - b.w || a.key.localeCompare(b.key));
}

function build(): PieceDef[] {
  const defs = Object.entries(SHAPES).map(([id, rows]) => {
    const orientations = orientationsOf(rows);
    const size = orientations[0].cells.length / 2;
    return { id, size, orientations };
  });
  // order pieces by size then id — stable indices are part of the protocol
  defs.sort((a, b) => a.size - b.size || a.id.localeCompare(b.id));
  return defs;
}

export const PIECES: readonly PieceDef[] = build();
export const PIECE_COUNT = PIECES.length;
export const TOTAL_CELLS = PIECES.reduce((s, p) => s + p.size, 0);
export const MONOMINO = PIECES.findIndex((p) => p.id === 'I1');
export const ALL_PIECES_MASK = (1 << PIECE_COUNT) - 1;

export function pieceName(index: number): string {
  return PIECES[index].id;
}

// ----------------------------------------------------------- orientation graph

function flatToPairs(cells: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < cells.length; i += 2) out.push([cells[i], cells[i + 1]]);
  return out;
}

export interface OriMaps {
  rotCw: Int8Array;
  rotCcw: Int8Array;
  mirror: Int8Array;
}

/**
 * Per piece: for each orientation, the index of the same shape rotated 90°
 * clockwise / counter-clockwise and mirrored. Used by the UI for R/F input.
 */
export const ORI_MAPS: readonly OriMaps[] = PIECES.map((p) => {
  const index = new Map<string, number>();
  p.orientations.forEach((or, i) => index.set(or.key, i));
  const n = p.orientations.length;
  const rotCw = new Int8Array(n);
  const rotCcw = new Int8Array(n);
  const mirror = new Int8Array(n);
  p.orientations.forEach((or, i) => {
    const pairs = flatToPairs(or.cells);
    const maxX = or.w - 1;
    const maxY = or.h - 1;
    const cw = normalize(pairs.map(([x, y]) => [maxY - y, x] as [number, number])).key;
    const ccw = normalize(pairs.map(([x, y]) => [y, maxX - x] as [number, number])).key;
    const mir = normalize(pairs.map(([x, y]) => [maxX - x, y] as [number, number])).key;
    rotCw[i] = index.get(cw) ?? -1;
    rotCcw[i] = index.get(ccw) ?? -1;
    mirror[i] = index.get(mir) ?? -1;
  });
  return { rotCw, rotCcw, mirror };
});
