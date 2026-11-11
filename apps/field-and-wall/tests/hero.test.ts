import { describe, expect, it } from 'vitest';
import { analyze } from '../src/game/features';
import { edgeAt, localFeatures } from '../src/game/tiles';
import { OPPOSITE, DX, DY, type Rotation } from '../src/game/types';
import { HERO_TILES } from '../src/ui/heroTiles';

describe('home-screen board', () => {
  it('is a fully edge-legal board', () => {
    const occupied = new Map(HERO_TILES.map((t) => [`${t.x},${t.y}`, t]));
    expect(HERO_TILES.length).toBeGreaterThanOrEqual(12);
    for (const tile of HERO_TILES) {
      for (let dir = 0; dir < 4; dir++) {
        const neighbour = occupied.get(`${tile.x + DX[dir]},${tile.y + DY[dir]}`);
        if (!neighbour) continue;
        expect(edgeAt(tile.type, tile.rot, dir)).toBe(
          edgeAt(neighbour.type, neighbour.rot, OPPOSITE[dir]),
        );
      }
    }
  });

  it('has visible meeples on claimable features', () => {
    const withMeeples = HERO_TILES.filter((t) => t.meeple != null);
    expect(withMeeples.length).toBeGreaterThanOrEqual(4);
    for (const tile of withMeeples) {
      expect(tile.meepleFeature).not.toBeNull();
      const features = localFeatures(tile.type, tile.rot);
      const feature = features[tile.meepleFeature as number];
      expect(feature).toBeTruthy();
      expect(feature.type).not.toBe('field');
    }
  });

  it('contains at least one city and one road feature', () => {
    const analysis = analyze(HERO_TILES);
    expect(analysis.features.some((f) => f.type === 'city')).toBe(true);
    expect(analysis.features.some((f) => f.type === 'road')).toBe(true);
    expect(analysis.features.some((f) => f.type === 'monastery')).toBe(true);
  });

  it('uses only valid rotations', () => {
    for (const tile of HERO_TILES) {
      expect([0, 1, 2, 3]).toContain(tile.rot as Rotation);
    }
  });
});
