import { describe, expect, it } from 'vitest';
import { TILE_DATA, TILE_SPECS, COLORS, SHAPES, COMBO_COUNT, fullBag } from '../src/game/tiles';

describe('tile data', () => {
  it('has 108 physical tiles and three copies of every combination', () => {
    expect(TILE_DATA.version).toBe(1);
    expect(TILE_DATA.count).toBe(108);
    expect(TILE_DATA.items).toHaveLength(36);
    expect(COMBO_COUNT).toBe(36);
    expect(TILE_SPECS).toHaveLength(36);
    expect(fullBag()).toHaveLength(108);
    for (const spec of TILE_SPECS) {
      expect(spec.copies).toBe(3);
    }
  });

  it('is balanced across colours and shapes', () => {
    for (const color of COLORS) {
      const count = TILE_SPECS.filter((t) => t.color === color).reduce((sum, t) => sum + t.copies, 0);
      expect(count).toBe(18);
    }
    for (const shape of SHAPES) {
      const count = TILE_SPECS.filter((t) => t.shape === shape).reduce((sum, t) => sum + t.copies, 0);
      expect(count).toBe(18);
    }
  });
});
