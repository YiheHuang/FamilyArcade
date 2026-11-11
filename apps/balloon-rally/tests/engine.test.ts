import { describe, expect, it } from 'vitest';
import {
  apply,
  invariants,
  legalMoves,
  result,
  score,
  setup,
  view,
} from '../src/game/engine';
import { deserialize, replay, serialize } from '../src/game/replay';
import { mulberry32, seedFromString } from '../src/game/rng';
import { BALLOON_COUNT, ROUNDS, TRACK_LENGTH, WIND_CARDS } from '../src/game/data';
import type { GameConfig, GameState, Move, RoundRecord } from '../src/game/types';

function makeConfig(playerCount = 3, seed = 'test-rally'): GameConfig {
  return {
    playerCount,
    seed,
    seats: Array.from({ length: playerCount }, (_, index) => ({
      name: `P${index + 1}`,
      kind: index === 0 ? ('human' as const) : ('ai' as const),
      level: ('normal' as const),
    })),
  };
}

function start(playerCount = 3, seed = 'test-rally'): GameState {
  return setup(makeConfig(playerCount, seed), mulberry32(seedFromString(seed)));
}

function support(state: GameState, balloon: number, tailwind = false): GameState {
  const out = apply(state, { kind: 'support', seat: state.current, balloon, tailwind });
  if (!out.ok) throw new Error(`support failed: ${out.reason}`);
  return out.state;
}

function advance(state: GameState): GameState {
  const out = apply(state, { kind: 'advance' });
  if (!out.ok) throw new Error(`advance failed: ${out.reason}`);
  return out.state;
}

function finishRound(state: GameState, supports: number[], tails: boolean[] = []): GameState {
  let current = state;
  supports.forEach((balloon, index) => {
    current = support(current, balloon, tails[index] ?? false);
  });
  return current;
}

function rigWind(state: GameState, round: number, wind: number[]): GameState {
  const windPlan = state.windPlan.map((row, index) => (index === round - 1 ? [...wind] : row));
  return { ...state, windPlan };
}

function playFull(supportsPerRound: number[][], tailsPerRound: boolean[][] = []): GameState {
  let state = start(3);
  for (let round = 0; round < ROUNDS; round++) {
    state = finishRound(state, supportsPerRound[round], tailsPerRound[round] ?? []);
    if (round < ROUNDS - 1) state = advance(state);
  }
  return advance(state);
}

function fakeRound(
  round: number,
  supports: number[],
  leaders: number[],
  points: number[],
  overallPoints: number[] | null = null,
): RoundRecord {
  return {
    round,
    supports,
    tailwinds: supports.map(() => false),
    wind: [1, 1, 1, 1, 1],
    positionsBefore: [0, 0, 0, 0, 0],
    positionsAfter: [1, 1, 1, 1, 1],
    leaders,
    seconds: [],
    points,
    overallLeaders: overallPoints ? leaders : null,
    overallPoints,
  };
}

describe('setup and data', () => {
  it('starts five balloons at zero, four rounds, and two tailwind tokens each', () => {
    const state = start(4);
    expect(state.positions).toEqual([0, 0, 0, 0, 0]);
    expect(state.tokensLeft).toEqual([2, 2, 2, 2]);
    expect(state.round).toBe(1);
    expect(state.phase).toBe('support');
    expect(state.windPlan).toHaveLength(ROUNDS);
    expect(invariants(state)).toEqual([]);
  });

  it('uses the exact wind deck in every round', () => {
    const state = start(2, 'deck-seed');
    const expected = [...WIND_CARDS].sort((a, b) => a - b).join(',');
    for (const row of state.windPlan) {
      expect([...row].sort((a, b) => a - b).join(',')).toBe(expected);
      expect(row.every((value) => value >= 1 && value <= 3)).toBe(true);
    }
  });

  it('is deterministic for the same seed and moves', () => {
    const a = start(3, 'same-seed');
    const b = start(3, 'same-seed');
    expect(a.windPlan).toEqual(b.windPlan);
    const a1 = support(a, 1, true);
    const b1 = support(b, 1, true);
    expect(a1).toEqual(b1);
  });

  it('rejects bad seat counts', () => {
    expect(() => setup({ ...makeConfig(2), playerCount: 7 }, mulberry32(1))).toThrow();
    expect(() =>
      setup({ ...makeConfig(2), seats: [] }, mulberry32(1)),
    ).toThrow();
  });
});

describe('support privacy', () => {
  it('keeps the first player support out of the next player view', () => {
    let state = start(3, 'privacy');
    state = support(state, 3, true);
    const next = view(state, 1);
    expect(next.mySupport).toBeNull();
    expect(next.submitted).toEqual([true, false, false]);
    expect(next.history).toHaveLength(0);
    expect(JSON.stringify(next)).not.toContain('windPlan');
    expect(JSON.stringify(next)).not.toContain('"supports"');
    expect(next.mySeat).toBe(1);
  });

  it('lets a player see only their own locked support', () => {
    let state = start(3, 'privacy-own');
    state = support(state, 3, false);
    const own = view(state, 0);
    expect(own.mySupport).toBe(3);
    expect(view(state, 2).mySupport).toBeNull();
  });

  it('reveals all supports and winds in the round summary', () => {
    let state = start(3, 'privacy-summary');
    state = finishRound(state, [0, 2, 4], [true, false, true]);
    const summary = view(state, 1);
    expect(summary.lastRound?.supports).toEqual([0, 2, 4]);
    expect(summary.lastRound?.wind).toHaveLength(BALLOON_COUNT);
    expect(summary.lastRound?.tailwinds).toEqual([true, false, true]);
    expect(summary.history).toHaveLength(1);
  });
});

describe('apply errors', () => {
  it('returns stable reason codes', () => {
    const state = start(3);
    expect(apply(state, { kind: 'support', seat: 1, balloon: 0, tailwind: false })).toEqual({
      ok: false,
      reason: 'not-your-turn',
    });
    expect(apply(state, { kind: 'support', seat: 0, balloon: 9, tailwind: false })).toEqual({
      ok: false,
      reason: 'bad-balloon',
    });
    expect(apply(state, { kind: 'support', seat: 9, balloon: 0, tailwind: false })).toEqual({
      ok: false,
      reason: 'bad-seat',
    });
    expect(apply(state, { kind: 'advance' })).toEqual({ ok: false, reason: 'wrong-phase' });
    expect(apply(state, { kind: 'nope' } as unknown as Move)).toEqual({
      ok: false,
      reason: 'bad-move',
    });
  });

  it('rejects a tailwind when none is left', () => {
    const state = start(2);
    const empty = { ...state, tokensLeft: [0, 2] };
    expect(apply(empty, { kind: 'support', seat: 0, balloon: 1, tailwind: true })).toEqual({
      ok: false,
      reason: 'no-tailwind',
    });
  });

  it('rejects a seat that has already locked', () => {
    const state = start(2);
    const rigged = { ...state, supports: [1, null] as (number | null)[] };
    expect(apply(rigged, { kind: 'support', seat: 0, balloon: 2, tailwind: false })).toEqual({
      ok: false,
      reason: 'already-supported',
    });
  });

  it('rejects every action after the rally ends', () => {
    const ended = playFull([
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ]);
    expect(ended.phase).toBe('ended');
    expect(apply(ended, { kind: 'advance' })).toEqual({ ok: false, reason: 'game-over' });
    expect(apply(ended, { kind: 'support', seat: 0, balloon: 0, tailwind: false })).toEqual({
      ok: false,
      reason: 'game-over',
    });
  });
});

describe('legal moves', () => {
  it('offers five balloons and both tailwind choices when tokens remain', () => {
    const state = start(3);
    expect(legalMoves(state, 0)).toHaveLength(10);
    expect(legalMoves(state, 1)).toHaveLength(0);
    const noTokens = { ...state, tokensLeft: [0, 2, 2] };
    expect(legalMoves(noTokens, 0)).toHaveLength(5);
  });
});

describe('tailwind and movement', () => {
  it('spends one token and adds exactly one space', () => {
    let state = rigWind(start(3, 'tailwind'), 1, [2, 2, 1, 3, 3]);
    state = support(state, 0, true);
    expect(state.tokensLeft[0]).toBe(1);
    state = finishRound(state, [1, 2]);
    const record = state.history[0];
    expect(record.positionsAfter[0]).toBe(3);
    expect(record.tailwinds[0]).toBe(true);
    expect(record.positionsAfter[1]).toBe(state.windPlan[0][1]);
    expect(invariants(state)).toEqual([]);
  });

  it('stacks tailwinds from two supporters on the same balloon', () => {
    let state = rigWind(start(2, 'stack'), 1, [1, 1, 1, 1, 1]);
    state = support(state, 0, true);
    state = support(state, 0, true);
    expect(state.history[0].positionsAfter[0]).toBe(3);
    expect(state.tokensLeft).toEqual([1, 1]);
  });

  it('caps a balloon at the finish line', () => {
    let state = start(2, 'finish');
    state = { ...state, positions: [19, 0, 0, 0, 0] };
    state = rigWind(state, 1, [3, 1, 1, 1, 1]);
    state = support(state, 0, true);
    state = support(state, 1, false);
    expect(state.history[0].positionsAfter[0]).toBe(TRACK_LENGTH);
  });

  it('moves every balloon by its own wind card', () => {
    let state = rigWind(start(2, 'movement'), 1, [3, 1, 2, 2, 3]);
    state = finishRound(state, [0, 1]);
    expect(state.history[0].wind).toEqual([3, 1, 2, 2, 3]);
    expect(state.history[0].positionsAfter).toEqual([3, 1, 2, 2, 3]);
    expect(state.positions).toEqual([3, 1, 2, 2, 3]);
  });
});

describe('round scoring', () => {
  it('scores the leader 3 and the next distinct balloon 1', () => {
    let state = rigWind(start(3, 'score'), 1, [3, 2, 1, 2, 1]);
    state = finishRound(state, [0, 1, 2]);
    const record = state.history[0];
    expect(record.leaders).toEqual([0]);
    expect(record.seconds).toEqual([1, 3]);
    expect(record.points).toEqual([3, 1, 0]);
    expect(score(state)[0].roundPoints).toBe(3);
    expect(score(state)[0].overallPoints).toBe(0);
  });

  it('gives every tied leader 3 points and every tied second 1 point', () => {
    let state = rigWind(start(4, 'ties'), 1, [3, 3, 2, 2, 1]);
    state = finishRound(state, [0, 1, 2, 3]);
    const record = state.history[0];
    expect(record.leaders).toEqual([0, 1]);
    expect(record.seconds).toEqual([2, 3]);
    expect(record.points).toEqual([3, 3, 1, 1]);
  });

  it('has no second place when every balloon ties for the lead', () => {
    let state = rigWind(start(2, 'all-tied'), 1, [1, 1, 1, 1, 1]);
    state = finishRound(state, [0, 1]);
    expect(state.history[0].leaders).toEqual([0, 1, 2, 3, 4]);
    expect(state.history[0].seconds).toEqual([]);
    expect(state.history[0].points).toEqual([3, 3]);
  });
});

describe('overall scoring, ties and end', () => {
  it('awards the final overall leader bonus after four rounds', () => {
    let state = start(3, 'overall');
    const winds = [
      [3, 3, 2, 2, 1],
      [3, 2, 3, 2, 1],
      [3, 2, 2, 3, 1],
      [3, 2, 2, 1, 3],
    ];
    for (let round = 1; round <= 4; round++) {
      state = rigWind(state, round, winds[round - 1]);
      state = finishRound(state, [0, 1, 2]);
      if (round < 4) state = advance(state);
    }
    expect(state.phase).toBe('summary');
    const record = state.history[3];
    expect(record.overallLeaders).toEqual([0]);
    expect(record.overallPoints).toEqual([5, 0, 0]);
    state = advance(state);
    expect(state.phase).toBe('ended');
    const final = result(state);
    expect(final?.winners).toEqual([0]);
    expect(final?.ranking[0].overallPoints).toBe(5);
    expect(invariants(state)).toEqual([]);
  });

  it('adds one point per unused tailwind token', () => {
    const ended = playFull([
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ], [
      [true, false, false],
      [true, false, false],
      [false, false, false],
      [false, false, false],
    ]);
    expect(ended.tokensLeft).toEqual([0, 2, 2]);
    const rows = score(ended);
    expect(rows.find((row) => row.seat === 0)?.tailwindPoints).toBe(0);
    expect(rows.find((row) => row.seat === 1)?.tailwindPoints).toBe(2);
    expect(invariants(ended)).toEqual([]);
  });

  it('breaks ties by correct rounds, then remaining tailwind, then shares', () => {
    const state = start(4, 'tiebreak');
    const history: RoundRecord[] = [
      fakeRound(1, [0, 0, 0, 0], [0], [3, 3, 3, 3]),
      fakeRound(2, [0, 0, 0, 0], [0], [3, 3, 3, 3]),
      fakeRound(3, [1, 1, 1, 1], [0], [0, 0, 0, 0]),
      fakeRound(4, [1, 1, 1, 1], [0], [0, 0, 0, 0]),
    ];
    // Seat 0 and seat 3 share the exact top key; seat 1 has fewer correct rounds.
    const custom: GameState = {
      ...state,
      phase: 'ended',
      current: -1,
      round: 4,
      history,
      tokensLeft: [1, 0, 0, 1],
      positions: [1, 1, 1, 1, 1],
      overallLeaders: [0],
    };
    const rows = score(custom);
    expect(rows[0].seat).toBe(0);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].total).toBe(7);
    expect(rows[0].correctSupports).toBe(2);
    expect(rows.find((row) => row.seat === 3)?.rank).toBe(1);
    expect(rows.find((row) => row.seat === 1)?.rank).toBe(3);
    expect(result(custom)?.winners).toEqual([0, 3]);
  });

  it('declares shared winners when every tie-break matches', () => {
    const state = start(2, 'shared');
    const custom: GameState = {
      ...state,
      phase: 'ended',
      current: -1,
      round: 4,
      history: [
        fakeRound(1, [0, 0], [0], [3, 3]),
        fakeRound(2, [0, 0], [0], [3, 3]),
        fakeRound(3, [0, 0], [0], [0, 0]),
        fakeRound(4, [0, 0], [0], [0, 0]),
      ],
      tokensLeft: [1, 1],
      positions: [1, 1, 1, 1, 1],
      overallLeaders: [0],
    };
    expect(result(custom)?.winners).toEqual([0, 1]);
    expect(score(custom).every((row) => row.rank === 1)).toBe(true);
  });
});

describe('round flow and serialization', () => {
  it('moves from support to summary to the next round', () => {
    let state = start(3);
    state = finishRound(state, [0, 1, 2]);
    expect(state.phase).toBe('summary');
    expect(state.round).toBe(1);
    expect(state.current).toBe(-1);
    state = advance(state);
    expect(state.phase).toBe('support');
    expect(state.round).toBe(2);
    expect(state.current).toBe(0);
    expect(state.supports).toEqual([null, null, null]);
    expect(state.history).toHaveLength(1);
    expect(invariants(state)).toEqual([]);
  });

  it('serializes, sanitizes and replays the same rally', () => {
    let state = start(4, 'serial');
    state = finishRound(state, [0, 1, 2, 3], [false, true, false, false]);
    state = advance(state);
    state = finishRound(state, [3, 2, 1, 0]);
    state = advance(state);
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).toEqual(state);
    expect(invariants(restored)).toEqual([]);
    const replayState = replay(makeConfig(4, 'serial'), restored.moves);
    expect(replayState).toEqual(restored);
  });

  it('rejects corrupted saves', () => {
    expect(() => deserialize('not json')).toThrow(/valid JSON/);
    expect(() => deserialize(JSON.stringify({ version: 99 }))).toThrow(/version/);
    const state = start(2);
    expect(() => deserialize(JSON.stringify({ ...state, positions: [0] }))).toThrow(/track/);
  });

  it('keeps the invariant clean through a complete scripted rally', () => {
    let state = start(5, 'full');
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 40) {
      expect(invariants(state)).toEqual([]);
      if (state.phase === 'summary') {
        state = advance(state);
      } else {
        const moves = legalMoves(state, state.current);
        expect(moves.length).toBeGreaterThan(0);
        const out = apply(state, moves[0]);
        expect(out.ok).toBe(true);
        if (!out.ok) break;
        state = out.state;
      }
    }
    expect(state.phase).toBe('ended');
    expect(state.history).toHaveLength(4);
    expect(invariants(state)).toEqual([]);
  });
});
