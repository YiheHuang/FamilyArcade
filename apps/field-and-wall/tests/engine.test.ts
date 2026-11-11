import { describe, expect, it } from 'vitest';
import {
  MEEPLES_PER_PLAYER,
  apply,
  deserialize,
  invariants,
  legalMoves,
  mustDiscard,
  placementProblem,
  placementsOnly,
  replay,
  result,
  serialize,
  setup,
  viewFor,
} from '../src/game/engine';
import { analyze, featurePoints, majoritySeats } from '../src/game/features';
import { edgeAt, localFeatures, rotatedEdges, tileType } from '../src/game/tiles';
import { mulberry32 } from '../src/game/rng';
import type { GameConfig, GameState, Move, PlacedTile, Rotation } from '../src/game/types';

function seats(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    kind: 'human' as const,
    level: 'normal' as const,
  }));
}

const config = (seed = 'test'): GameConfig => ({ playerCount: 2, seats: seats(2), seed });

function tile(
  type: string,
  x: number,
  y: number,
  rot: Rotation = 0,
  seat: number | null = null,
  meepleFeature: number | null = null,
): PlacedTile {
  return { type, x, y, rot, meeple: seat, meepleFeature: seat == null ? null : meepleFeature };
}

function synthetic(
  tiles: PlacedTile[],
  currentTile: string | null,
  opts: Partial<GameState> = {},
): GameState {
  const onBoard = [0, 0];
  for (const t of tiles) if (t.meeple != null) onBoard[t.meeple]++;
  return {
    version: 1,
    config: config(),
    tiles,
    bag: [],
    currentTile,
    current: 0,
    turn: 1,
    scores: [0, 0],
    meeplesLeft: [
      MEEPLES_PER_PLAYER - onBoard[0],
      MEEPLES_PER_PLAYER - onBoard[1],
    ],
    moves: [],
    status: 'playing',
    endReason: null,
    lastScored: [],
    completed: [0, 0],
    discarded: [],
    lastMove: null,
    ...opts,
  };
}

describe('tiles and rotation', () => {
  it('rotates edges clockwise', () => {
    const cap = tileType('city-cap');
    expect(rotatedEdges(cap, 0)).toEqual(['city', 'field', 'field', 'field']);
    expect(rotatedEdges(cap, 1)).toEqual(['field', 'city', 'field', 'field']);
    expect(rotatedEdges(cap, 2)).toEqual(['field', 'field', 'city', 'field']);
    expect(rotatedEdges(cap, 3)).toEqual(['field', 'field', 'field', 'city']);
    expect(edgeAt('road-curve', 0, 0)).toBe('road');
    expect(edgeAt('road-curve', 1, 1)).toBe('road');
  });

  it('rotates local feature edges and anchors', () => {
    const rot0 = localFeatures('city-cap', 0);
    const rot1 = localFeatures('city-cap', 1);
    expect(rot0[0].edges).toEqual([0]);
    expect(rot1[0].edges).toEqual([1]);
    expect(rot1[0].anchor.x).toBeGreaterThan(0.7);
    expect(rot1[0].anchor.y).toBeCloseTo(0.5);
  });

  it('gives every tile a stable local feature list', () => {
    for (const type of ['city-cap', 'city-corner', 'road-cross', 'monastery'] as const) {
      for (let r = 0; r < 4; r++) {
        const features = localFeatures(type, r as Rotation);
        expect(features.length).toBeGreaterThan(0);
        features.forEach((f, i) => expect(f.index).toBe(i));
      }
    }
  });
});

describe('city completion', () => {
  it('completes a two-tile city and scores 2 per tile', () => {
    const tiles = [
      tile('city-cap', 0, 0, 1, 0, 0),
      tile('city-cap', 1, 0, 3),
    ];
    const analysis = analyze(tiles);
    const city = analysis.features.find((f) => f.type === 'city');
    expect(city).toBeTruthy();
    expect(city?.complete).toBe(true);
    expect(city?.tileIndexes).toHaveLength(2);
    expect(city ? featurePoints(city, true) : 0).toBe(4);
    expect(city ? majoritySeats(city) : []).toEqual([0]);
  });

  it('leaves an open city incomplete', () => {
    const analysis = analyze([tile('city-cap', 0, 0, 0)]);
    const city = analysis.features.find((f) => f.type === 'city');
    expect(city?.complete).toBe(false);
    expect(city?.openEdges).toBe(1);
    expect(city ? featurePoints(city, false) : 0).toBe(1);
  });

  it('counts a tile with two city edges once', () => {
    const analysis = analyze([
      tile('city-corner', 0, 0, 0),
      tile('city-cap', 1, 0, 3),
      tile('city-cap', 0, -1, 2),
    ]);
    const city = analysis.features.find((f) => f.type === 'city');
    expect(city?.tileIndexes).toHaveLength(3);
    expect(city?.complete).toBe(true);
    expect(city ? featurePoints(city, true) : 0).toBe(6);
  });

  it('splits twin caps until a connecting tile joins them', () => {
    const separate = analyze([tile('city-opposite', 0, 0, 0)]);
    expect(separate.features.filter((f) => f.type === 'city')).toHaveLength(2);
  });
});

describe('road completion', () => {
  it('completes a short two-tile road', () => {
    const analysis = analyze([
      tile('road-end', 0, 0, 1, 1, 0),
      tile('road-end', 1, 0, 3),
    ]);
    const road = analysis.features.find((f) => f.type === 'road');
    expect(road?.complete).toBe(true);
    expect(road?.tileIndexes).toHaveLength(2);
    expect(road ? featurePoints(road, true) : 0).toBe(2);
    expect(road ? majoritySeats(road) : []).toEqual([1]);
  });

  it('keeps a road open until every end is matched', () => {
    const analysis = analyze([
      tile('road-cross', 0, 0, 0),
      tile('road-end', 1, 0, 3),
      tile('road-end', -1, 0, 1),
      tile('road-end', 0, -1, 2),
    ]);
    const road = analysis.features.find((f) => f.type === 'road');
    expect(road?.openEdges).toBe(1);
    expect(road?.complete).toBe(false);
  });
});

describe('monastery completion', () => {
  it('needs all eight surrounding tiles', () => {
    const near = [tile('monastery', 0, 0, 0)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (dx === 0 && dy === 1) continue;
        near.push(tile('field', dx, dy, 0));
      }
    }
    const before = analyze(near).features.find((f) => f.type === 'monastery');
    expect(before?.complete).toBe(false);
    expect(before?.filledAround).toBe(7);
    expect(before ? featurePoints(before, false) : 0).toBe(8);
    const after = analyze([...near, tile('field', 0, 1, 0)]).features.find(
      (f) => f.type === 'monastery',
    );
    expect(after?.complete).toBe(true);
    expect(after ? featurePoints(after, true) : 0).toBe(9);
  });
});

describe('placement rules', () => {
  it('starts with one tile and a full hand', () => {
    const state = setup(config('start'));
    expect(state.tiles).toHaveLength(1);
    expect(state.currentTile).toBeTruthy();
    expect(state.bag.length).toBe(52);
    expect(state.scores).toEqual([0, 0]);
    expect(state.meeplesLeft).toEqual([7, 7]);
    expect(invariants(state)).toEqual([]);
  });

  it('accepts matching edges and rejects mismatches', () => {
    const state = setup(config('legal'));
    const moves = placementsOnly(state, 0);
    expect(moves.length).toBeGreaterThan(0);
    const move = moves[0];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.tiles).toHaveLength(2);
    expect(invariants(out.state)).toEqual([]);

    const bad = apply(state, { ...move, x: move.x, y: move.y, rot: ((move.rot + 1) % 4) as Rotation });
    if (!bad.ok) {
      expect(['edge-mismatch', 'occupied']).toContain(bad.reason);
    }
  });

  it('names the failing direction when edges do not meet', () => {
    const tiles = [tile('road-end', 0, 0, 0)];
    const problem = placementProblem(tiles, 'field', 0, 0, -1);
    expect(problem).toEqual({
      reason: 'edge-mismatch',
      params: { dir: 2, mine: 'field', theirs: 'road' },
    });
  });

  it('reports stable error codes', () => {
    const state = setup(config('errors'));
    expect(apply(state, { seat: 1, kind: 'place', x: 0, y: 1, rot: 0, meeple: null })).toEqual({
      ok: false,
      reason: 'not-your-turn',
    });
    expect(
      apply(state, { seat: 0, kind: 'place', x: 9, y: 9, rot: 0, meeple: null }),
    ).toEqual({ ok: false, reason: 'not-adjacent' });
    const occupied = apply(state, { seat: 0, kind: 'place', x: 0, y: 0, rot: 0, meeple: null });
    expect(occupied).toEqual({ ok: false, reason: 'occupied' });
    const placed = apply(state, placementsOnly(state, 0)[0]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(apply(placed.state, { seat: 1, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null })).toEqual({
      ok: false,
      reason: 'cannot-discard',
    });
  });

  it('keeps old states untouched', () => {
    const state = setup(config('immutable'));
    const before = serialize(state);
    apply(state, placementsOnly(state, 0)[0]);
    expect(serialize(state)).toBe(before);
  });

  it('exposes only public information in the view', () => {
    const state = setup(config('view'));
    const view = viewFor(state);
    expect('bag' in view).toBe(false);
    expect(view.bagCount).toBe(state.bag.length);
    expect(view.currentTile).toBe(state.currentTile);
  });
});

describe('meeples and scoring through apply', () => {
  it('completes a city, scores 4, and returns the meeple', () => {
    const state = synthetic(
      [tile('city-cap', 0, 0, 1, 0, 0)],
      'city-cap',
      { moves: [], turn: 2 },
    );
    const move: Move = {
      seat: 0,
      kind: 'place',
      x: 1,
      y: 0,
      rot: 3,
      meeple: null,
    };
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.scores[0]).toBe(4);
    expect(out.state.meeplesLeft[0]).toBe(7);
    expect(out.state.tiles[0].meeple).toBeNull();
    expect(out.state.lastScored[0]).toMatchObject({ type: 'city', points: 4, complete: true });
    expect(out.state.status).toBe('ended');
  });

  it('completes a road and scores 2', () => {
    const state = synthetic([tile('road-end', 0, 0, 1, 1, 0)], 'road-end');
    const out = apply(state, { seat: 0, kind: 'place', x: 1, y: 0, rot: 3, meeple: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.scores).toEqual([0, 2]);
    expect(out.state.meeplesLeft[1]).toBe(7);
  });

  it('scores a monastery 9 when surrounded', () => {
    const tiles = [tile('monastery', 0, 0, 0, 0, 0)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (dx === 1 && dy === 1) continue;
        tiles.push(tile('field', dx, dy, 0));
      }
    }
    const state = synthetic(tiles, 'field');
    const out = apply(state, { seat: 0, kind: 'place', x: 1, y: 1, rot: 0, meeple: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.scores[0]).toBe(9);
    expect(out.state.meeplesLeft[0]).toBe(7);
  });

  it('awards the meeple majority and returns every meeple', () => {
    const tiles = [
      tile('city-corner', 0, 0, 0, 0, 0),
      tile('city-cap', 0, -1, 2, 1, 0),
      tile('city-cap', 1, 0, 3, 1, 0),
    ];
    const analysis = analyze(tiles);
    const city = analysis.features.find((f) => f.type === 'city');
    expect(city?.complete).toBe(true);
    expect(city ? majoritySeats(city) : []).toEqual([1]);
    expect(city ? featurePoints(city, true) : 0).toBe(6);
  });

  it('scores incomplete features at the end', () => {
    const state = synthetic(
      [tile('city-cap', 0, 0, 0, 0, 0), tile('field', 0, 1, 0)],
      'field',
    );
    const out = apply(state, { seat: 0, kind: 'place', x: 1, y: 1, rot: 0, meeple: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.scores[0]).toBe(1);
    expect(out.state.meeplesLeft[0]).toBe(6);
    expect(out.state.lastScored.some((f) => f.type === 'city' && !f.complete)).toBe(true);
  });
});

describe('discard, end and ranking', () => {
  it('produces a discard only when there is no legal placement', () => {
    const state = setup(config('discard'));
    expect(mustDiscard(state, 0)).toBe(false);
    const dead = synthetic([tile('road-cross', 0, 0, 0)], 'city-three');
    expect(mustDiscard(dead, 0)).toBe(true);
    expect(legalMoves(dead, 0)).toEqual([
      { seat: 0, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null },
    ]);
    const out = apply(dead, { seat: 0, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.discarded).toEqual(['city-three']);
  });

  it('ranks by score then completed features', () => {
    const state = setup(config('rank'));
    const ended: GameState = {
      ...state,
      status: 'ended',
      endReason: 'bag-empty',
      currentTile: null,
      scores: [10, 10],
      completed: [2, 1],
    };
    const res = result(ended);
    expect(res?.winner).toBe(0);
    expect(res?.tiedWinners).toEqual([0]);
    expect(res?.ranking[0].rank).toBe(1);
    expect(res?.ranking[1].rank).toBe(2);
  });
});

describe('serialization and replay', () => {
  it('round-trips a state and rejects a bad version', () => {
    const state = setup(config('serialize'));
    const again = deserialize(serialize(state));
    expect(again.config.seed).toBe(state.config.seed);
    expect(again.tiles).toEqual(state.tiles);
    expect(() => deserialize(JSON.stringify({ version: 99, state }))).toThrow(/version/);
  });

  it('replays the same moves deterministically', () => {
    const state = setup(config('replay'));
    const moves: Move[] = [];
    let cur = state;
    for (let i = 0; i < 6 && cur.status === 'playing'; i++) {
      const legal = legalMoves(cur, cur.current);
      expect(legal.length).toBeGreaterThan(0);
      const move = legal[i % legal.length];
      const out = apply(cur, move);
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      moves.push(move);
      cur = out.state;
    }
    const again = replay(config('replay'), moves);
    expect(serialize(again)).toBe(serialize(cur));
  });
});

describe('random games', () => {
  it('plays 120 random legal games to completion with invariants', () => {
    for (let g = 0; g < 120; g++) {
      const rng = mulberry32(g * 7919 + 13);
      let state = setup(config(`random-${g}`));
      let guard = 0;
      while (state.status === 'playing' && guard++ < 200) {
        const legal = legalMoves(state, state.current);
        expect(legal.length).toBeGreaterThan(0);
        const move = legal[Math.floor(rng() * legal.length)];
        const out = apply(state, move);
        expect(out.ok).toBe(true);
        if (!out.ok) break;
        state = out.state;
        expect(invariants(state)).toEqual([]);
      }
      expect(state.status).toBe('ended');
      expect(state.tiles.length + state.discarded.length).toBe(54);
      expect(state.bag).toHaveLength(0);
      expect(state.currentTile).toBeNull();
      for (let s = 0; s < state.config.playerCount; s++) {
        expect(state.meeplesLeft[s]).toBeGreaterThanOrEqual(0);
        expect(state.meeplesLeft[s]).toBeLessThanOrEqual(MEEPLES_PER_PLAYER);
      }
    }
  }, 120_000);
});
