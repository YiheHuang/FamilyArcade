import { PIECES } from '../game/pieces';

/** the rotation ring drawn around a parked piece (client coordinates) */
export interface RingGeometry {
  cx: number;
  cy: number;
  /** radius of the ring line */
  r: number;
  /** grab band width outside the ring line */
  band: number;
}

export interface RingInput {
  piece: number;
  o: number;
  /** piece origin in board cells */
  x: number;
  y: number;
  /** board cell size in css px */
  cell: number;
  /** canvas client position */
  left: number;
  top: number;
}

/**
 * The ring is a circle around the piece's bounding box (never overlapping
 * it), with a minimum radius so even the monomino gets a comfortable band.
 */
export function computeRing(input: RingInput): RingGeometry {
  const or = PIECES[input.piece].orientations[input.o];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < or.cells.length; i += 2) {
    const cx = input.x + or.cells[i];
    const cy = input.y + or.cells[i + 1];
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  const wPx = (maxX - minX + 1) * input.cell;
  const hPx = (maxY - minY + 1) * input.cell;
  const circum = Math.hypot(wPx, hPx) / 2;
  const pad = Math.max(6, input.cell * 0.22);
  const r = Math.max(circum + pad, input.cell * 1.45);
  const band = Math.max(18, input.cell * 0.42);
  return {
    cx: input.left + (minX + maxX + 1) * 0.5 * input.cell,
    cy: input.top + (minY + maxY + 1) * 0.5 * input.cell,
    r,
    band,
  };
}

/** is the point inside the ring's grab band? */
export function inRing(g: RingGeometry, px: number, py: number, slop = 6): boolean {
  const d = Math.hypot(px - g.cx, py - g.cy);
  return d >= g.r - slop && d <= g.r + g.band + slop;
}

/** how many rotation steps a ring drag of `delta` radians represents (45° each) */
export const RING_STEP_ANGLE = Math.PI / 4;

export function ringSteps(deltaAccum: number): { steps: number; rest: number } {
  const steps = Math.trunc(deltaAccum / RING_STEP_ANGLE);
  return { steps, rest: deltaAccum - steps * RING_STEP_ANGLE };
}
