import { describe, expect, it } from 'vitest';
import {
  apply,
  MEEPLES_PER_PLAYER,
  placementProblem,
  setup,
} from '../src/game/engine';
import type { GameConfig, GameState, Move, PlacedTile, Rotation } from '../src/game/types';

const config: GameConfig = {
  playerCount: 2,
  seats: [
    { name: 'A', kind: 'human', level: 'normal' },
    { name: 'B', kind: 'human', level: 'normal' },
  ],
  seed: 'errors',
};

const baseMove: Move = { seat: 0, kind: 'place', x: 1, y: 0, rot: 3, meeple: null };

function tile(type: string, x: number, y: number, rot: Rotation, seat: number | null = null, feature: number | null = null): PlacedTile {
  return { type, x, y, rot, meeple: seat, meepleFeature: seat == null ? null : feature };
}

function synthetic(tiles: PlacedTile[], currentTile: string | null, overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    config,
    tiles,
    bag: [],
    currentTile,
    current: 0,
    turn: 1,
    scores: [0, 0],
    meeplesLeft: [MEEPLES_PER_PLAYER, MEEPLES_PER_PLAYER],
    moves: [],
    status: 'playing',
    endReason: null,
    lastScored: [],
    completed: [0, 0],
    discarded: [],
    lastMove: null,
    ...overrides,
  };
}

describe('stable error codes', () => {
  it('game-over', () => {
    const state = setup(config);
    expect(apply({ ...state, status: 'ended' }, baseMove)).toEqual({
      ok: false,
      reason: 'game-over',
    });
  });

  it('not-your-turn', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, seat: 1 })).toEqual({
      ok: false,
      reason: 'not-your-turn',
    });
  });

  it('bad-seat', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, seat: 9 })).toEqual({ ok: false, reason: 'bad-seat' });
  });

  it('bad-config', () => {
    expect(() => setup({ ...config, playerCount: 1 as 2 })).toThrow(/playerCount/);
    expect(() => setup({ ...config, seats: [config.seats[0]] })).toThrow(/seat count/);
  });

  it('no-current-tile', () => {
    const state = setup(config);
    expect(apply({ ...state, currentTile: null }, baseMove)).toEqual({
      ok: false,
      reason: 'no-current-tile',
    });
  });

  it('unknown-tile', () => {
    expect(placementProblem([], 'not-a-tile', 0, 0, 0)).toEqual({
      reason: 'unknown-tile',
    });
  });

  it('occupied', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, x: 0, y: 0 })).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('not-adjacent', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, x: 9, y: 9 })).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
  });

  it('edge-mismatch', () => {
    expect(placementProblem([tile('road-end', 0, 0, 0)], 'field', 0, 0, -1)).toEqual({
      reason: 'edge-mismatch',
      params: { dir: 2, mine: 'field', theirs: 'road' },
    });
  });

  it('bad-rotation', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, rot: 7 as Rotation })).toEqual({
      ok: false,
      reason: 'bad-rotation',
    });
  });

  it('bad-meeple', () => {
    const state = synthetic([tile('city-cap', 0, 0, 1)], 'city-cap', { current: 0 });
    // city-cap rot3 at (1,0) has one city edge; feature 99 is invalid
    expect(apply(state, { ...baseMove, rot: 3, meeple: 99 })).toEqual({
      ok: false,
      reason: 'bad-meeple',
    });
  });

  it('no-meeples', () => {
    const state = synthetic([tile('city-cap', 0, 0, 1)], 'city-cap', {
      meeplesLeft: [0, 7],
    });
    expect(apply(state, { ...baseMove, rot: 3, meeple: 0 })).toEqual({
      ok: false,
      reason: 'no-meeples',
    });
  });

  it('feature-occupied', () => {
    const tiles = [
      tile('city-cap', 0, 0, 1, 0, 0),
      tile('city-cap', 2, 0, 3, 1, 0),
    ];
    const state = synthetic(tiles, 'city-three', { current: 0 });
    // city-three rot1 = [F,C,C,C]; it joins both occupied caps.
    expect(apply(state, { seat: 0, kind: 'place', x: 1, y: 0, rot: 1, meeple: 0 })).toEqual({
      ok: false,
      reason: 'feature-occupied',
    });
  });

  it('feature-complete', () => {
    const state = synthetic([tile('city-cap', 0, 0, 1)], 'city-cap');
    expect(apply(state, { ...baseMove, rot: 3, meeple: 0 })).toEqual({
      ok: false,
      reason: 'feature-complete',
    });
  });

  it('cannot-discard', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, kind: 'discard' })).toEqual({
      ok: false,
      reason: 'cannot-discard',
    });
  });

  it('bad-move', () => {
    const state = setup(config);
    expect(apply(state, { ...baseMove, kind: 'teleport' as 'place' })).toEqual({
      ok: false,
      reason: 'bad-move',
    });
  });
});
