import { describe, expect, it } from 'vitest';
import { chooseMove, enumerateMoves, explainMove, stealPenalty } from '../src/ai/ai';
import { apply, legalMoves, setup, viewFor } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameConfig, GameState, PlacedTile, Rotation } from '../src/game/types';

function seats(ai: boolean) {
  return [
    { name: 'P1', kind: ai ? ('ai' as const) : ('human' as const), level: 'normal' as const },
    { name: 'P2', kind: ai ? ('ai' as const) : ('human' as const), level: 'normal' as const },
  ];
}

const config: GameConfig = { playerCount: 2, seats: seats(true), seed: 'ai-test' };

function midGame(): GameState {
  let state = setup(config);
  const rng = mulberry32(4242);
  for (let i = 0; i < 16 && state.status === 'playing'; i++) {
    const moves = legalMoves(state, state.current);
    const move = moves[Math.floor(rng() * moves.length)];
    const out = apply(state, move);
    if (!out.ok) throw new Error(out.reason);
    state = out.state;
  }
  return state;
}

function sameMove(a: { kind: string; x: number; y: number; rot: number; meeple: number | null }, b: { kind: string; x: number; y: number; rot: number; meeple: number | null }): boolean {
  return a.kind === b.kind && a.x === b.x && a.y === b.y && a.rot === b.rot && a.meeple === b.meeple;
}

function tile(type: string, x: number, y: number, rot: Rotation, seat: number | null = null, meepleFeature: number | null = null): PlacedTile {
  return { type, x, y, rot, meeple: seat, meepleFeature: seat == null ? null : meepleFeature };
}

describe('AI levels', () => {
  const state = midGame();
  const view = viewFor(state);

  for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
    it(`${level} returns a legal move deterministically`, () => {
      const legal = legalMoves(state, state.current);
      expect(legal.length).toBeGreaterThan(0);
      const a = chooseMove(view, view.current, { level, budgetMs: 250, rng: mulberry32(77) });
      const b = chooseMove(view, view.current, { level, budgetMs: 250, rng: mulberry32(77) });
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      if (!a || !b) return;
      expect(sameMove(a, b)).toBe(true);
      expect(legal.some((m) => sameMove(m, a))).toBe(true);
      expect(explainMove(view, view.current, a).key).toMatch(/^hint\./);
    });
  }

  it('hard stays inside its budget', () => {
    const start = performance.now();
    const move = chooseMove(view, view.current, {
      level: 'hard',
      budgetMs: 900,
      rng: mulberry32(9),
    });
    const elapsed = performance.now() - start;
    expect(move).not.toBeNull();
    expect(elapsed).toBeLessThan(900);
  });

  it('stays inside every level budget on a crowded board', () => {
    const budgets: Record<AiLevel, number> = {
      companion: 80,
      easy: 80,
      normal: 300,
      hard: 900,
    };
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const start = performance.now();
      const move = chooseMove(view, view.current, {
        level,
        budgetMs: budgets[level],
        rng: mulberry32(31),
      });
      const elapsed = performance.now() - start;
      expect(move).not.toBeNull();
      expect(elapsed).toBeLessThan(budgets[level] + 120);
    }
  });

  it('enumerates placements, rotations and meeple options', () => {
    const moves = enumerateMoves(view, view.current);
    expect(moves.length).toBeGreaterThan(1);
    expect(moves.every((m) => m.seat === view.current)).toBe(true);
  });
});

describe('companion restraint', () => {
  it('does not steal a sole claim when a merge would take the majority', () => {
    const before = [
      tile('city-cap', 0, 0, 1, 0, 0),
      tile('city-three', 1, 0, 3, 0, 0),
      tile('city-cap', 3, 0, 3, 1, 0),
    ];
    const after = [...before, tile('city-three', 2, 0, 1)];
    expect(stealPenalty(before, after, 0)).toBeGreaterThan(0);
    expect(stealPenalty(before, after, 1)).toBe(0);
  });

  it('does not penalise a fair merge that keeps the other claim', () => {
    const before = [
      tile('city-cap', 0, 0, 1, 0, 0),
      tile('city-cap', 2, 0, 3, 1, 0),
      tile('city-cap', 3, 0, 3, 1, 1),
    ];
    const after = [...before, tile('city-three', 1, 0, 1)];
    expect(stealPenalty(before, after, 0)).toBe(0);
  });
});
