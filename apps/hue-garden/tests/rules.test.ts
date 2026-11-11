import { describe, expect, it } from 'vitest';
import { apply, legalMoves, setup, validatePlay } from '../src/game/engine';
import { bare, config, fresh, play, put, tile } from './helpers';

describe('setup', () => {
  it('deals six tiles per seat and keeps 108 tiles in play for 2–4 seats', () => {
    for (const n of [2, 3, 4] as const) {
      const state = setup(config(n), () => 0.42);
      expect(state.status).toBe('playing');
      expect(state.current).toBe(0);
      expect(state.turn).toBe(1);
      expect(state.hands).toHaveLength(n);
      for (const hand of state.hands) expect(hand).toHaveLength(6);
      expect(state.bag).toHaveLength(108 - n * 6);
      expect(state.scores).toEqual(new Array(n).fill(0));
      expect(state.blooms).toEqual(new Array(n).fill(0));
    }
  });

  it('rejects malformed configurations', () => {
    expect(() => setup({ playerCount: 5 as never, seats: [], seed: 'x' }, () => 0.5)).toThrow();
    expect(() =>
      setup({ playerCount: 4, seats: config(2).seats, seed: 'x' }, () => 0.5),
    ).toThrow();
    expect(() =>
      setup(
        {
          playerCount: 2,
          seats: [
            { name: 'A', kind: 'human', level: 'normal' },
            { name: '', kind: 'human', level: 'normal' },
          ],
          seed: 'x',
        },
        () => 0.5,
      ),
    ).toThrow();
  });

  it('is deterministic for the same seed', () => {
    const a = fresh(2, 99);
    const b = fresh(2, 99);
    expect(a).toEqual(b);
    const c = fresh(2, 100);
    expect(a.hands).not.toEqual(c.hands);
  });
});

describe('line legality', () => {
  it('accepts same colour with different shapes', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1)];
    const out = apply(state, play(0, { x: 1, y: 0, tile: tile(0, 1) }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.scores[0]).toBe(2);
  });

  it('accepts same shape with different colours', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(3, 0)];
    const out = apply(state, play(0, { x: 1, y: 0, tile: tile(3, 0) }));
    expect(out.ok).toBe(true);
  });

  it('rejects a mixed line', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(3, 1)];
    const out = apply(state, play(0, { x: 1, y: 0, tile: tile(3, 1) }));
    expect(out).toEqual({ ok: false, reason: 'line-mixed' });
  });

  it('rejects a duplicate colour/shape combination in a line', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 0)];
    const out = apply(state, play(0, { x: 1, y: 0, tile: tile(0, 0) }));
    expect(out).toEqual({ ok: false, reason: 'line-duplicate' });
  });

  it('rejects diagonal and gapped placements', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1), tile(0, 2), tile(0, 3)];
    expect(
      apply(
        state,
        play(0, { x: 1, y: 0, tile: tile(0, 1) }, { x: 2, y: 1, tile: tile(0, 2) }),
      ),
    ).toEqual({ ok: false, reason: 'not-in-line' });
    expect(
      apply(
        state,
        play(0, { x: 2, y: 0, tile: tile(0, 1) }, { x: 4, y: 0, tile: tile(0, 2) }),
      ),
    ).toEqual({ ok: false, reason: 'not-contiguous' });
  });

  it('requires a new play to touch the courtyard', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1)];
    expect(apply(state, play(0, { x: 5, y: 5, tile: tile(0, 1) }))).toEqual({
      ok: false,
      reason: 'not-connected',
    });
  });

  it('opens on the courtyard origin', () => {
    const state = bare();
    state.hands[0] = [tile(0, 1)];
    expect(apply(state, play(0, { x: 1, y: 0, tile: tile(0, 1) }))).toEqual({
      ok: false,
      reason: 'opening-origin',
    });
    expect(apply(state, play(0, { x: 0, y: 0, tile: tile(0, 1) })).ok).toBe(true);
  });

  it('allows an opening line of up to three tiles', () => {
    const state = bare();
    state.hands[0] = [tile(0, 0), tile(0, 1), tile(0, 2), tile(0, 3)];
    const ok = apply(
      state,
      play(
        0,
        { x: -1, y: 0, tile: tile(0, 0) },
        { x: 0, y: 0, tile: tile(0, 1) },
        { x: 1, y: 0, tile: tile(0, 2) },
      ),
    );
    expect(ok.ok).toBe(true);
    const tooMany = apply(
      state,
      play(
        0,
        { x: 0, y: 0, tile: tile(0, 0) },
        { x: 1, y: 0, tile: tile(0, 1) },
        { x: 2, y: 0, tile: tile(0, 2) },
        { x: 3, y: 0, tile: tile(0, 3) },
      ),
    );
    expect(tooMany).toEqual({ ok: false, reason: 'too-many-tiles', params: { max: 3 } });
  });

  it('rejects an occupied cell and a tile that is not in hand', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1)];
    expect(apply(state, play(0, { x: 0, y: 0, tile: tile(0, 1) }))).toEqual({
      ok: false,
      reason: 'cell-occupied',
    });
    expect(apply(state, play(0, { x: 1, y: 0, tile: tile(0, 4) }))).toEqual({
      ok: false,
      reason: 'tile-not-in-hand',
    });
  });

  it('rejects inserting a tile between two existing tiles', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    put(state, 2, 0, tile(0, 1));
    state.hands[0] = [tile(0, 2)];
    expect(apply(state, play(0, { x: 1, y: 0, tile: tile(0, 2) }))).toEqual({
      ok: false,
      reason: 'cannot-insert',
    });
  });

  it('rejects a seventh tile in a line', () => {
    const state = bare();
    for (let shape = 0; shape < 6; shape++) put(state, shape, 0, tile(0, shape));
    state.hands[0] = [tile(0, 0)];
    const out = apply(state, play(0, { x: 6, y: 0, tile: tile(0, 0) }));
    expect(out).toEqual({ ok: false, reason: 'line-too-long' });
  });

  it('checks the perpendicular line too', () => {
    const state = bare();
    put(state, 1, 0, tile(0, 0));
    put(state, 1, 1, tile(0, 1));
    state.hands[0] = [tile(3, 1)];
    const out = apply(state, play(0, { x: 1, y: 2, tile: tile(3, 1) }));
    expect(out).toEqual({ ok: false, reason: 'line-mixed' });
  });

  it('enumerates only legal plays and never mutates the state', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1), tile(3, 0), tile(4, 4)];
    const snapshot = JSON.stringify(state);
    const moves = legalMoves(state, 0);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      if (move.kind === 'play') {
        const check = validatePlay(state, move);
        expect(check.ok).toBe(true);
      }
    }
  });
});

describe('turn protection and swaps', () => {
  it('rejects the wrong seat and a finished game', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1)];
    state.hands[1] = [tile(0, 2)];
    expect(apply(state, play(1, { x: 1, y: 0, tile: tile(0, 1) }))).toEqual({
      ok: false,
      reason: 'not-your-turn',
    });
    state.status = 'ended';
    state.endReason = 'blocked';
    state.winners = [0];
    expect(apply(state, play(0, { x: 1, y: 0, tile: tile(0, 1) }))).toEqual({
      ok: false,
      reason: 'game-over',
    });
  });

  it('swaps one to three tiles and advances the turn', () => {
    const state = bare();
    state.hands[0] = [tile(0, 0), tile(0, 1), tile(0, 2)];
    state.bag = [tile(1, 0), tile(1, 1), tile(1, 2)];
    const before = [...state.hands[0]];
    const bagBefore = [...state.bag];
    const out = apply(state, { kind: 'swap', seat: 0, hand: [0, 2] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.current).toBe(1);
    expect(out.state.hands[0]).toHaveLength(3);
    expect(out.state.hands[0]).toContain(bagBefore[2]);
    expect(out.state.hands[0]).toContain(bagBefore[1]);
    expect(out.state.bag).toContain(before[0]);
    expect(out.state.bag).toContain(before[2]);
    expect(out.state.bag).toHaveLength(3);
    expect(out.state.moves.at(-1)?.kind).toBe('swap');
  });

  it('rejects a swap when the bag is too small or indices are stale', () => {
    const state = bare();
    state.hands[0] = [tile(0, 0), tile(0, 1)];
    state.bag = [tile(1, 0)];
    expect(apply(state, { kind: 'swap', seat: 0, hand: [0, 1] })).toEqual({
      ok: false,
      reason: 'bag-too-small',
    });
    expect(apply(state, { kind: 'swap', seat: 0, hand: [0, 5] })).toEqual({
      ok: false,
      reason: 'hand-index',
    });
  });

  it('allows pass only when nothing can be played or swapped', () => {
    const state = bare();
    state.hands[0] = [tile(0, 0)];
    state.bag = [tile(1, 0)];
    put(state, 0, 0, tile(0, 0));
    expect(apply(state, { kind: 'pass', seat: 0 })).toEqual({
      ok: false,
      reason: 'pass-not-allowed',
    });
  });
});
