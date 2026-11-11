import { describe, expect, it } from 'vitest';
import { apply, invariants, legalMoves, result, rngForConfig, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { GameConfig } from '../src/game/types';

function config(n: 2 | 3 | 4, game: number): GameConfig {
  return {
    playerCount: n,
    seats: Array.from({ length: n }, (_, i) => ({
      name: `P${i + 1}`,
      kind: 'human' as const,
      level: 'normal' as const,
    })),
    seed: `sim-${n}-${game}`,
  };
}

function runGame(n: 2 | 3 | 4, game: number): void {
  const cfg = config(n, game);
  let state = setup(cfg, rngForConfig(cfg));
  let guard = 0;
  while (state.status === 'playing' && guard++ < 600) {
    const moves = legalMoves(state, state.current);
    expect(moves.length).toBeGreaterThan(0);
    const rng = mulberry32(game * 7919 + guard * 104729 + n);
    const move = moves[Math.floor(rng() * moves.length)];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error(`${out.reason} in game ${game}`);
    state = out.state;
    expect(invariants(state)).toEqual([]);
  }
  expect(state.status).toBe('ended');
  expect(state.winners.length).toBeGreaterThan(0);
  expect(result(state)).not.toBeNull();
}

describe('random full-game simulation', () => {
  it('plays 40 two-player games to a legal end', () => {
    for (let game = 0; game < 40; game++) runGame(2, game);
  });

  it('plays 40 three-player games to a legal end', () => {
    for (let game = 0; game < 40; game++) runGame(3, game);
  });

  it('plays 40 four-player games to a legal end', () => {
    for (let game = 0; game < 40; game++) runGame(4, game);
  });
});
