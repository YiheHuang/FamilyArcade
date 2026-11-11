import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { apply, legalMoves, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameConfig, GameState } from '../src/game/types';

const seats = (n: number, ai: boolean) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    kind: ai ? ('ai' as const) : ('human' as const),
    level: 'easy' as AiLevel,
  }));

function invariant(state: GameState): void {
  expect(state.board).toHaveLength(121);
  for (let seat = 0; seat < state.config.playerCount; seat++) {
    expect(state.board.filter((v) => v === seat + 1)).toHaveLength(10);
  }
  expect(state.moves.length).toBeLessThan(400);
}

describe('full-game simulation', () => {
  it('plays 60 random legal games to completion', () => {
    for (let g = 0; g < 60; g++) {
      const config: GameConfig = { playerCount: 2, seats: seats(2, false) };
      let state = setup(config);
      let guard = 0;
      while (state.status === 'playing' && guard++ < 400) {
        const moves = legalMoves(state, state.current);
        if (moves.length === 0) {
          const out = apply(state, { seat: state.current, from: -1, to: -1, path: [], kind: 'pass' });
          expect(out.ok).toBe(true);
          if (!out.ok) break;
          state = out.state;
          continue;
        }
        const move = moves[Math.floor(mulberry32(g * 7919 + guard)() * moves.length)];
        const out = apply(state, move);
        expect(out.ok).toBe(true);
        if (!out.ok) break;
        state = out.state;
        invariant(state);
      }
      expect(state.status).toBe('ended');
    }
  });

  it('plays AI vs AI games to completion', () => {
    for (let g = 0; g < 2; g++) {
      const config: GameConfig = { playerCount: 2, seats: seats(2, true) };
      let state = setup(config);
      let guard = 0;
      while (state.status === 'playing' && guard++ < 400) {
        const move = chooseMove(state, state.current, {
          level: state.current === 0 ? 'normal' : 'easy',
          budgetMs: 20,
          rng: mulberry32(g * 31 + guard),
        });
        if (!move) {
          const out = apply(state, { seat: state.current, from: -1, to: -1, path: [], kind: 'pass' });
          expect(out.ok).toBe(true);
          if (!out.ok) break;
          state = out.state;
          continue;
        }
        const out = apply(state, move);
        expect(out.ok).toBe(true);
        if (!out.ok) break;
        state = out.state;
      }
      expect(state.status).toBe('ended');
    }
  });
});
