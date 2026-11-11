import { describe, expect, it } from 'vitest';
import { PIECES, PIECE_COUNT, TOTAL_CELLS } from '../src/game/pieces';

/** canonical orientation counts of the 21 standard Blokus pieces */
const EXPECTED_ORIENTATIONS: Record<string, number> = {
  I1: 1,
  I2: 2,
  I3: 2,
  L3: 4,
  I4: 2,
  O4: 1,
  T4: 4,
  L4: 8,
  S4: 4,
  F5: 8,
  I5: 2,
  L5: 8,
  N5: 8,
  P5: 8,
  T5: 4,
  U5: 4,
  V5: 4,
  W5: 4,
  X5: 1,
  Y5: 8,
  Z5: 4,
};

describe('棋子库', () => {
  it('有 21 块棋子、共 89 格', () => {
    expect(PIECE_COUNT).toBe(21);
    expect(TOTAL_CELLS).toBe(89);
  });

  it('尺寸分布为标准 Blokus：1×1 + 1×2 + 2×3 + 5×4 + 12×5', () => {
    const bySize = new Map<number, number>();
    for (const p of PIECES) bySize.set(p.size, (bySize.get(p.size) ?? 0) + 1);
    expect(bySize.get(1)).toBe(1);
    expect(bySize.get(2)).toBe(1);
    expect(bySize.get(3)).toBe(2);
    expect(bySize.get(4)).toBe(5);
    expect(bySize.get(5)).toBe(12);
  });

  it('每块棋子的朝向数与标准一致，总计 91 种', () => {
    let total = 0;
    for (const p of PIECES) {
      expect(EXPECTED_ORIENTATIONS[p.id], p.id).toBeDefined();
      expect(p.orientations.length, p.id).toBe(EXPECTED_ORIENTATIONS[p.id]);
      total += p.orientations.length;
    }
    expect(total).toBe(91);
  });

  it('所有朝向均已归一化、无重复、格数与棋子尺寸一致', () => {
    for (const p of PIECES) {
      const seen = new Set<string>();
      for (const or of p.orientations) {
        expect(or.cells.length, p.id).toBe(p.size * 2);
        let minX = Infinity;
        let minY = Infinity;
        for (let i = 0; i < or.cells.length; i += 2) {
          minX = Math.min(minX, or.cells[i]);
          minY = Math.min(minY, or.cells[i + 1]);
        }
        expect(minX, p.id).toBe(0);
        expect(minY, p.id).toBe(0);
        expect(seen.has(or.key), `${p.id} duplicate ${or.key}`).toBe(false);
        seen.add(or.key);
        // bounding box matches declared w/h
        let maxX = 0;
        let maxY = 0;
        for (let i = 0; i < or.cells.length; i += 2) {
          maxX = Math.max(maxX, or.cells[i]);
          maxY = Math.max(maxY, or.cells[i + 1]);
        }
        expect(maxX + 1, p.id).toBe(or.w);
        expect(maxY + 1, p.id).toBe(or.h);
      }
    }
  });

  it('棋子索引顺序按尺寸排序（协议稳定性）', () => {
    const sizes = PIECES.map((p) => p.size);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
});
