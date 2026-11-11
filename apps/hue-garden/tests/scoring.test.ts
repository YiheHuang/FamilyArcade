import { describe, expect, it } from 'vitest';
import { apply, previewMove, score } from '../src/game/engine';
import { bare, play, put, tile } from './helpers';

describe('scoring', () => {
  it('scores one point per tile in the extended line', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    put(state, 1, 0, tile(0, 1));
    state.hands[0] = [tile(0, 2)];
    const preview = previewMove(state, play(0, { x: 2, y: 0, tile: tile(0, 2) }));
    expect(preview?.score.points).toBe(3);
    expect(preview?.score.lines).toHaveLength(1);
    const out = apply(state, play(0, { x: 2, y: 0, tile: tile(0, 2) }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.scores[0]).toBe(3);
      expect(out.state.blooms[0]).toBe(0);
    }
  });

  it('scores the row and the perpendicular line when a tile joins both', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    put(state, 1, 0, tile(0, 1));
    put(state, 2, -1, tile(3, 2));
    state.hands[0] = [tile(0, 2)];
    const move = play(0, { x: 2, y: 0, tile: tile(0, 2) });
    const preview = previewMove(state, move);
    expect(preview?.score.points).toBe(5);
    expect(preview?.score.lines.map((l) => l.length).sort()).toEqual([2, 3]);
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.scores[0]).toBe(5);
  });

  it('scores a six-tile bloom as 6 + 6 and counts it', () => {
    const state = bare();
    for (let shape = 0; shape < 5; shape++) put(state, shape, 0, tile(0, shape));
    state.hands[0] = [tile(0, 5)];
    const move = play(0, { x: 5, y: 0, tile: tile(0, 5) });
    const preview = previewMove(state, move);
    expect(preview?.score.points).toBe(12);
    expect(preview?.score.bloomCount).toBe(1);
    expect(preview?.score.lines[0].bloom).toBe(true);
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.scores[0]).toBe(12);
      expect(out.state.blooms[0]).toBe(1);
    }
  });

  it('can bloom two lines with one tile', () => {
    const state = bare();
    // Row: five terracotta shapes, missing flower at (5,0).
    for (let shape = 0; shape < 5; shape++) put(state, shape, 0, tile(0, shape));
    // Column: five flower tiles of other colours, missing terracotta at (5,0).
    for (let color = 1; color < 6; color++) put(state, 5, -color, tile(color, 5));
    state.hands[0] = [tile(0, 5)];
    const move = play(0, { x: 5, y: 0, tile: tile(0, 5) });
    const preview = previewMove(state, move);
    expect(preview?.score.points).toBe(24);
    expect(preview?.score.bloomCount).toBe(2);
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.scores[0]).toBe(24);
      expect(out.state.blooms[0]).toBe(2);
    }
  });

  it('scores an opening single tile as one', () => {
    const state = bare();
    state.hands[0] = [tile(2, 2)];
    const preview = previewMove(state, play(0, { x: 0, y: 0, tile: tile(2, 2) }));
    expect(preview?.score.points).toBe(1);
    expect(preview?.score.lines[0].length).toBe(1);
  });

  it('scores a new line of three once', () => {
    const state = bare();
    state.hands[0] = [tile(1, 0), tile(1, 1), tile(1, 2)];
    const move = play(
      0,
      { x: -1, y: 0, tile: tile(1, 0) },
      { x: 0, y: 0, tile: tile(1, 1) },
      { x: 1, y: 0, tile: tile(1, 2) },
    );
    const preview = previewMove(state, move);
    expect(preview?.score.points).toBe(3);
    expect(preview?.score.lines).toHaveLength(1);
  });

  it('does not double-count a line touched by several new tiles', () => {
    const state = bare();
    put(state, 0, 0, tile(0, 0));
    state.hands[0] = [tile(0, 1), tile(0, 2)];
    const move = play(
      0,
      { x: 1, y: 0, tile: tile(0, 1) },
      { x: 2, y: 0, tile: tile(0, 2) },
    );
    const preview = previewMove(state, move);
    expect(preview?.score.points).toBe(3);
    expect(preview?.score.lines).toHaveLength(1);
  });

  it('reports live ranks without mutating the score', () => {
    const state = bare(3);
    state.scores = [4, 9, 4];
    state.blooms = [1, 0, 0];
    state.hands = [[], [tile(0, 0)], [tile(0, 1), tile(0, 2)]];
    const rows = score(state);
    expect(rows[0]).toMatchObject({ seat: 1, points: 9, rank: 1 });
    expect(rows.find((r) => r.seat === 0)?.rank).toBe(2);
    expect(rows.find((r) => r.seat === 2)?.rank).toBe(3);
  });
});
