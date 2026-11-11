import { describe, expect, it } from 'vitest';
import { chooseMove, hintMove } from '../src/ai/ai';
import { legalMoves, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameConfig } from '../src/game/types';

const config: GameConfig = {
  playerCount: 2,
  seats: [
    { name: 'A', kind: 'human', level: 'normal' },
    { name: 'B', kind: 'ai', level: 'normal' },
  ],
};

function containsMove(state: ReturnType<typeof setup>, seat: number, move: unknown): boolean {
  return legalMoves(state, seat).some((m) => JSON.stringify(m) === JSON.stringify(move));
}

describe('AI', () => {
  for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
    it(`returns a legal move at ${level}`, () => {
      const state = setup(config);
      const move = chooseMove(state, 0, { level, budgetMs: 120, rng: mulberry32(42) });
      expect(move).not.toBeNull();
      expect(containsMove(state, 0, move)).toBe(true);
    });
  }

  it('is deterministic with the same seed', () => {
    const state = setup(config);
    const a = chooseMove(state, 0, { level: 'normal', budgetMs: 120, rng: mulberry32(7) });
    const b = chooseMove(state, 0, { level: 'normal', budgetMs: 120, rng: mulberry32(7) });
    expect(a).toEqual(b);
  });

  it('returns null when it is not the seat turn', () => {
    const state = setup(config);
    const move = chooseMove(state, 1, { level: 'easy', budgetMs: 50, rng: mulberry32(1) });
    expect(move).toBeNull();
  });

  it('provides a hint on the current turn', () => {
    const state = setup(config);
    const move = hintMove(state, 0);
    expect(move).not.toBeNull();
    expect(containsMove(state, 0, move)).toBe(true);
  });

  it('does not target the opponent in companion mode', () => {
    // Companion still advances its own marbles; it must never return an
    // illegal "capture" (Chinese Checkers has no captures at all).
    const state = setup(config);
    const move = chooseMove(state, 0, { level: 'companion', budgetMs: 80, rng: mulberry32(3) });
    expect(move).not.toBeNull();
    expect(state.board[move!.to]).toBe(0);
  });
});
