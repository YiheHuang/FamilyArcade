import { describe, expect, it } from 'vitest';
import { PIECES } from '../src/game/pieces';
import { RING_STEP_ANGLE, computeRing, inRing, ringSteps } from '../src/ui/ring';

const CELL = 50;
const LEFT = 100;
const TOP = 200;

function ringOf(pieceId: string, o: number, x: number, y: number) {
  const piece = PIECES.findIndex((p) => p.id === pieceId);
  return computeRing({ piece, o, x, y, cell: CELL, left: LEFT, top: TOP });
}

describe('旋转环几何', () => {
  it('环心在棋子包围盒中心', () => {
    // I2 horizontal at (0,0): bbox 2×1 → centre (1.0, 0.5) cells
    const g = ringOf('I2', PIECES.find((p) => p.id === 'I2')!.orientations.findIndex((o) => o.w === 2), 0, 0);
    expect(g.cx).toBeCloseTo(LEFT + 1.0 * CELL);
    expect(g.cy).toBeCloseTo(TOP + 0.5 * CELL);
  });

  it('环半径不覆盖棋子本体（包围盒外接圆之外）且有最小半径', () => {
    for (const piece of PIECES) {
      for (let o = 0; o < piece.orientations.length; o++) {
        const g = ringOf(piece.id, o, 3, 3);
        const minR = CELL * 1.45;
        expect(g.r).toBeGreaterThanOrEqual(minR - 1e-6);
        // every occupied cell's farthest point from the centre is inside the ring
        const or = piece.orientations[o];
        const gx = (g.cx - LEFT) / CELL;
        const gy = (g.cy - TOP) / CELL;
        for (let i = 0; i < or.cells.length; i += 2) {
          const cx = 3 + or.cells[i];
          const cy = 3 + or.cells[i + 1];
          // farthest cell corner from the ring centre (in cell units)
          const corners: Array<[number, number]> = [
            [cx, cy],
            [cx + 1, cy],
            [cx, cy + 1],
            [cx + 1, cy + 1],
          ];
          for (const [qx, qy] of corners) {
            const d = Math.hypot(qx - gx, qy - gy) * CELL;
            expect(d, `${piece.id}/${o} corner`).toBeLessThanOrEqual(g.r + 1e-6);
          }
        }
      }
    }
  });

  it('带内/带外判定', () => {
    const g = ringOf('I2', 0, 0, 0);
    const mid = g.r + g.band / 2;
    expect(inRing(g, g.cx + mid, g.cy)).toBe(true);
    expect(inRing(g, g.cx + g.r - 20, g.cy)).toBe(false); // inside the ring (piece area)
    expect(inRing(g, g.cx + g.r + g.band + 40, g.cy)).toBe(false); // far outside
  });

  it('45° 一步、余量保留', () => {
    const a = ringSteps(RING_STEP_ANGLE * 1.2);
    expect(a.steps).toBe(1);
    expect(a.rest).toBeCloseTo(RING_STEP_ANGLE * 0.2);
    const b = ringSteps(-RING_STEP_ANGLE * 2.5);
    expect(b.steps).toBe(-2);
    expect(b.rest).toBeCloseTo(-RING_STEP_ANGLE * 0.5);
    const c = ringSteps(RING_STEP_ANGLE * 0.9);
    expect(c.steps).toBe(0);
  });
});
