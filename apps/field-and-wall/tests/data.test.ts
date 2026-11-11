import { describe, expect, it } from 'vitest';
import { placementProblem, setup, viewFor } from '../src/game/engine';
import { analyze } from '../src/game/features';
import {
  TILE_DATA,
  allTileTypes,
  localFeatures,
  rotatedEdges,
  tileType,
  totalTiles,
} from '../src/game/tiles';
import type { GameConfig, PlacedTile, Rotation } from '../src/game/types';

const config: GameConfig = {
  playerCount: 2,
  seats: [
    { name: 'A', kind: 'human', level: 'normal' },
    { name: 'B', kind: 'human', level: 'normal' },
  ],
  seed: 'data-test',
};

const start: PlacedTile[] = [
  { x: 0, y: 0, type: TILE_DATA.startTile.type, rot: TILE_DATA.startTile.rot, meeple: null, meepleFeature: null },
];

describe('tile data', () => {
  it('has 54 tiles and a coherent count', () => {
    expect(TILE_DATA.version).toBe(1);
    expect(TILE_DATA.count).toBe(54);
    expect(totalTiles()).toBe(54);
    expect(allTileTypes().reduce((n, t) => n + t.copies, 0)).toBe(54);
  });

  it('has unique ids, bilingual names and four edges', () => {
    const ids = new Set<string>();
    for (const type of allTileTypes()) {
      expect(ids.has(type.id)).toBe(false);
      ids.add(type.id);
      expect(type.name.zh.length).toBeGreaterThan(0);
      expect(type.name.en.length).toBeGreaterThan(0);
      expect(type.edges).toHaveLength(4);
      expect(type.copies).toBeGreaterThan(0);
      for (const edge of type.edges) expect(['city', 'road', 'field']).toContain(edge);
      expect(['city', 'road', 'monastery', 'field']).toContain(type.center);
    }
  });

  it('references a start tile that offers all three edge types', () => {
    const type = tileType(TILE_DATA.startTile.type);
    expect(new Set(type.edges)).toEqual(new Set(['city', 'road', 'field']));
    expect(type.copies).toBeGreaterThanOrEqual(1);
  });

  it('gives every tile type at least one legal fit beside the start tile', () => {
    for (const type of allTileTypes()) {
      let fits = false;
      for (const cell of [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
      ]) {
        for (let r = 0; r < 4; r++) {
          if (!placementProblem(start, type.id, r as Rotation, cell.x, cell.y)) {
            fits = true;
            break;
          }
        }
        if (fits) break;
      }
      expect(fits, `${type.id} cannot fit beside the start tile`).toBe(true);
    }
  });

  it('produces local features for every rotation', () => {
    for (const type of allTileTypes()) {
      for (let r = 0; r < 4; r++) {
        const rot = r as Rotation;
        const edges = rotatedEdges(type, rot);
        const features = localFeatures(type.id, rot);
        for (const feature of features) {
          for (const edge of feature.edges) {
            expect(['city', 'road']).toContain(edges[edge]);
          }
          expect(feature.anchor.x).toBeGreaterThan(0);
          expect(feature.anchor.x).toBeLessThan(1);
          expect(feature.anchor.y).toBeGreaterThan(0);
          expect(feature.anchor.y).toBeLessThan(1);
        }
        if (type.center === 'field' && type.edges.every((e) => e === 'field')) {
          expect(features).toHaveLength(0);
        }
      }
    }
  });

  it('can put a meeple on at least one feature of every non-field tile', () => {
    for (const type of allTileTypes()) {
      if (type.center === 'field' && !type.edges.some((e) => e !== 'field')) continue;
      const placed: PlacedTile[] = [
        { x: 0, y: 0, type: type.id, rot: 0, meeple: null, meepleFeature: null },
      ];
      const features = analyze(placed).features;
      expect(features.length, `${type.id} has no claimable feature`).toBeGreaterThan(0);
    }
  });

  it('starts from the data start tile', () => {
    const state = setup(config);
    expect(state.tiles[0].type).toBe(TILE_DATA.startTile.type);
    expect(state.tiles[0].rot).toBe(TILE_DATA.startTile.rot);
    expect(viewFor(state).bagCount).toBe(52);
  });
});
