import { describe, expect, it } from 'vitest';
import {
  ADJ,
  CENTER_COUNT,
  CENTRAL,
  HOLE_COUNT,
  HOLES,
  JUMP,
  ROW_LENGTHS,
  TRIANGLES,
  TRIANGLE_IDS,
  TRIANGLE_SIZE,
  targetHoles,
  startHoles,
} from '../src/game/board';

describe('board geometry', () => {
  it('has 121 holes and the classic row lengths', () => {
    expect(HOLES).toHaveLength(HOLE_COUNT);
    expect(ROW_LENGTHS.reduce((a, b) => a + b, 0)).toBe(HOLE_COUNT);
    expect(ROW_LENGTHS[0]).toBe(1);
    expect(ROW_LENGTHS[8]).toBe(9);
  });

  it('has six disjoint 10-hole triangles and a 61-hole centre', () => {
    const all = new Set<number>();
    for (const id of TRIANGLE_IDS) {
      expect(TRIANGLES[id]).toHaveLength(TRIANGLE_SIZE);
      for (const h of TRIANGLES[id]) {
        expect(all.has(h)).toBe(false);
        all.add(h);
      }
    }
    expect(CENTRAL).toHaveLength(CENTER_COUNT);
    expect(all.size + CENTRAL.length).toBe(HOLE_COUNT);
    expect(new Set([...all, ...CENTRAL]).size).toBe(HOLE_COUNT);
  });

  it('has symmetric adjacency and at most six neighbours', () => {
    for (let a = 0; a < HOLE_COUNT; a++) {
      expect(ADJ[a].length).toBeGreaterThan(0);
      expect(ADJ[a].length).toBeLessThanOrEqual(6);
      for (const b of ADJ[a]) expect(ADJ[b]).toContain(a);
    }
  });

  it('only jumps to real holes directly beyond an occupied neighbour', () => {
    for (let a = 0; a < HOLE_COUNT; a++) {
      for (const b of ADJ[a]) {
        const c = JUMP[a][b];
        if (c >= 0) {
          expect(ADJ[b]).toContain(c);
          expect(c).not.toBe(a);
        }
      }
    }
  });

  it('maps opposite triangles', () => {
    expect(targetHoles(2, 0)).toEqual(TRIANGLES.bottom);
    expect(targetHoles(2, 1)).toEqual(TRIANGLES.top);
    expect(startHoles(2, 0)).toEqual(TRIANGLES.top);
    expect(startHoles(4, 1)).toEqual(TRIANGLES['upper-right']);
  });
});
