import { describe, expect, it } from 'vitest';
import {
  apply,
  deserialize,
  invariants,
  legalMoves,
  MAX_TURNS,
  replay,
  result,
  serialize,
} from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { Move } from '../src/game/types';
import { bare, fresh, play, put, tile } from './helpers';

describe('game ending', () => {
  it('ends with a +6 bonus when the bag is empty and a hand is emptied', () => {
    const state = bare();
    for (let shape = 0; shape < 5; shape++) put(state, shape, 0, tile(0, shape));
    state.hands[0] = [tile(0, 5)];
    state.bag = [];
    const out = apply(state, play(0, { x: 5, y: 0, tile: tile(0, 5) }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.endReason).toBe('cleared');
    expect(out.state.scores[0]).toBe(18);
    expect(out.state.lastScore?.endBonus).toBe(6);
    expect(out.state.winners).toEqual([0]);
    expect(result(out.state)?.reason).toBe('cleared');
  });

  it('ends by mutual block after a full cycle of passes', () => {
    const state = bare();
    state.hands = [[], []];
    state.bag = [];
    const first = apply(state, { kind: 'pass', seat: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.consecutivePasses).toBe(1);
    const second = apply(first.state, { kind: 'pass', seat: 1 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.status).toBe('ended');
    expect(second.state.endReason).toBe('blocked');
    expect(second.state.winners).toEqual([0, 1]);
    expect(result(second.state)?.winner).toBeNull();
  });

  it('has a hard turn cap so a game always ends', () => {
    const state = bare();
    state.hands[0] = [tile(0, 0)];
    state.turn = MAX_TURNS;
    const out = apply(state, play(0, { x: 0, y: 0, tile: tile(0, 0) }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.endReason).toBe('cap');
  });

  it('breaks ties by blooms, then by fewest tiles left, then shares the win', () => {
    const state = bare(3);
    state.status = 'ended';
    state.endReason = 'blocked';
    state.scores = [10, 10, 8];
    state.blooms = [0, 2, 0];
    state.hands = [[tile(0, 0)], [tile(0, 1)], [tile(0, 2)]];
    const byBloom = result(state);
    expect(byBloom?.winner).toBe(1);

    state.scores = [10, 10, 8];
    state.blooms = [1, 1, 0];
    state.hands = [[tile(0, 0)], [tile(0, 1), tile(0, 2)], [tile(0, 3)]];
    const byHand = result(state);
    expect(byHand?.winner).toBe(0);

    state.hands = [[tile(0, 0)], [tile(0, 1)], [tile(0, 3)]];
    const shared = result(state);
    expect(shared?.winner).toBeNull();
    expect(shared?.winners.sort()).toEqual([0, 1]);
    expect(shared?.ranking.filter((r) => r.rank === 1)).toHaveLength(2);
  });
});

describe('serialization, replay and invariants', () => {
  function playSome(seed = 12, count = 10) {
    let state = fresh(3, seed);
    for (let i = 0; i < count; i++) {
      const moves = legalMoves(state, state.current);
      const move = moves[Math.floor(mulberry32(seed * 100 + i)() * moves.length)];
      const out = apply(state, move);
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      state = out.state;
    }
    return state;
  }

  it('round-trips a live game with version', () => {
    const state = playSome();
    const copy = deserialize(serialize(state));
    expect(copy).toEqual(state);
    expect(deserialize(serialize(state)).version).toBe(1);
  });

  it('rejects old or damaged saves', () => {
    const state = playSome();
    const old = JSON.parse(serialize(state));
    old.version = 0;
    expect(() => deserialize(JSON.stringify(old))).toThrow(/save-version/);
    expect(() => deserialize('{oops')).toThrow(/save-corrupt/);
    const broken = JSON.parse(serialize(state));
    broken.hands[0].push(999);
    expect(() => deserialize(JSON.stringify(broken))).toThrow(/save-corrupt/);
  });

  it('replays the same moves to the same state', () => {
    const state = playSome(77, 18);
    const replayed = replay(state.config, state.moves);
    expect(replayed.board).toEqual(state.board);
    expect(replayed.hands).toEqual(state.hands);
    expect(replayed.bag).toEqual(state.bag);
    expect(replayed.scores).toEqual(state.scores);
    expect(replayed.current).toBe(state.current);
  });

  it('keeps invariants clean after every move', () => {
    let state = fresh(4, 5);
    for (let i = 0; i < 30 && state.status === 'playing'; i++) {
      const moves = legalMoves(state, state.current);
      const move = moves[Math.floor(mulberry32(500 + i)() * moves.length)];
      const out = apply(state, move);
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      state = out.state;
      expect(invariants(state)).toEqual([]);
    }
  });

  it('rejects stale and malformed moves with stable codes', () => {
    const state = fresh(2, 3);
    const moves = legalMoves(state, 0);
    const playMove = moves.find((m) => m.kind === 'play');
    expect(playMove).toBeDefined();
    if (!playMove || playMove.kind !== 'play') return;
    const stale: Move = {
      ...playMove,
      placements: playMove.placements.map((p) => ({ ...p, tile: 35 })),
    };
    expect(apply(state, stale)).toMatchObject({ ok: false, reason: 'tile-not-in-hand' });
    expect(apply(state, { kind: 'swap', seat: 0, hand: [0, 0] })).toEqual({
      ok: false,
      reason: 'hand-index',
    });
    expect(apply(state, { kind: 'play', seat: 9, placements: [] })).toEqual({
      ok: false,
      reason: 'bad-seat',
    });
    expect(apply(state, { kind: 'play', seat: 0, placements: [] })).toEqual({
      ok: false,
      reason: 'no-tiles',
    });
  });
});
