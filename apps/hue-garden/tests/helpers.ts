import { rngForConfig, setup } from '../src/game/engine';
import { makeTile } from '../src/game/tiles';
import type { GameConfig, GameState } from '../src/game/types';

export function seats(n: 2 | 3 | 4, kind: 'human' | 'ai' = 'human') {
  return Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    kind,
    level: 'normal' as const,
  }));
}

export function config(n: 2 | 3 | 4 = 2, seed = 1): GameConfig {
  return { playerCount: n, seats: seats(n), seed: `test-${n}-${seed}` };
}

export function fresh(n: 2 | 3 | 4 = 2, seed = 1): GameState {
  const cfg = config(n, seed);
  return setup(cfg, rngForConfig(cfg));
}

/** A hand-built position for one rule at a time. The tile bag stays non-empty so
 *  a play does not accidentally trigger the clear-hand ending. */
export function bare(n: 2 | 3 | 4 = 2): GameState {
  const cfg = config(n);
  const state = setup(cfg, rngForConfig(cfg));
  state.board = [];
  state.hands = Array.from({ length: n }, () => []);
  state.bag = [makeTile(5, 5)];
  state.current = 0;
  state.turn = 1;
  state.scores = new Array(n).fill(0);
  state.blooms = new Array(n).fill(0);
  state.status = 'playing';
  state.endReason = null;
  state.winners = [];
  state.moves = [];
  state.lastMove = null;
  state.lastScore = null;
  state.consecutivePasses = 0;
  state.totalPasses = 0;
  return state;
}

export function put(state: GameState, x: number, y: number, tile: number): void {
  state.board.push({ x, y, tile });
}

export function tile(color: number, shape: number): number {
  return makeTile(color, shape);
}

export function play(seat: number, ...placements: { x: number; y: number; tile: number }[]) {
  return { kind: 'play' as const, seat, placements };
}
