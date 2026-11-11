import type { PlacedTile } from '../game/types';

/** A curated, fully edge-legal board used on the home screen. It is a real
 *  board analysed by the same engine (see tests/hero.test.ts), just posed. */
export const HERO_TILES: PlacedTile[] = [
  { x: 0, y: 0, type: 'city-gate', rot: 0, meeple: null, meepleFeature: null },
  { x: 0, y: -1, type: 'city-cap', rot: 2, meeple: 0, meepleFeature: 0 },
  { x: 1, y: 0, type: 'road-end', rot: 3, meeple: null, meepleFeature: null },
  { x: 0, y: 1, type: 'road-curve', rot: 2, meeple: null, meepleFeature: null },
  { x: -1, y: 0, type: 'city-cap', rot: 3, meeple: 1, meepleFeature: 0 },
  { x: 2, y: 0, type: 'monastery-road', rot: 1, meeple: 0, meepleFeature: 0 },
  { x: 0, y: -2, type: 'city-corner', rot: 0, meeple: null, meepleFeature: null },
  { x: -2, y: 0, type: 'city-corner', rot: 1, meeple: null, meepleFeature: null },
  { x: 0, y: 2, type: 'road-straight', rot: 1, meeple: 1, meepleFeature: 0 },
  { x: 1, y: 1, type: 'field', rot: 0, meeple: null, meepleFeature: null },
  { x: 3, y: 0, type: 'road-curve', rot: 0, meeple: 1, meepleFeature: 0 },
  { x: -2, y: -1, type: 'field', rot: 0, meeple: null, meepleFeature: null },
  { x: -1, y: 1, type: 'road-end', rot: 1, meeple: null, meepleFeature: null },
  { x: 0, y: 3, type: 'road-end', rot: 0, meeple: 0, meepleFeature: 0 },
  { x: 1, y: -1, type: 'field', rot: 0, meeple: null, meepleFeature: null },
];
