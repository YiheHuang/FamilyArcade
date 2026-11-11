import { describe, expect, it } from 'vitest';
import { chooseMove, moveReason } from '../src/ai/ai';
import {
  apply,
  applySeat,
  legalMoves,
  oppositePit,
  pitNumber,
  previewMove,
  rowSum,
  setup,
  stateOf,
  storeOf,
  view,
  type GameState,
} from '../src/game/sowing';

function pitsFrom(south: number[], north: number[]): number[] {
  const pits = Array<number>(14).fill(0);
  south.forEach((value, index) => { pits[index] = value; });
  north.forEach((value, index) => { pits[index + 7] = value; });
  return pits;
}

function custom(
  south: number[],
  north: number[],
  stores: [number, number] = [0, 0],
  turn: 0 | 1 = 0,
): GameState {
  return stateOf({ pits: pitsFrom(south, north), stores, turn });
}

function total(state: GameState): number {
  return state.pits.reduce((sum, value) => sum + value, 0) + state.stores[0] + state.stores[1];
}

describe('Sowing engine: setup and legality', () => {
  it('sets up twelve pits with four seeds and empty stores', () => {
    const state = setup();
    expect(state.pits).toHaveLength(14);
    expect(state.pits.filter((_, slot) => slot !== 6 && slot !== 13).every((value) => value === 4)).toBe(true);
    expect(state.pits[6]).toBe(0);
    expect(state.pits[13]).toBe(0);
    expect(state.stores).toEqual([0, 0]);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.last).toBeNull();
    expect(total(state)).toBe(48);
  });

  it('honours the requested first player', () => {
    expect(setup(1).turn).toBe(1);
    expect(setup(1).first).toBe(1);
  });

  it('offers only the mover own non-empty pits as legal moves', () => {
    const state = custom([0, 1, 0, 2, 0, 3], [4, 0, 0, 0, 0, 0]);
    expect(legalMoves(state)).toEqual([1, 3, 5]);
    expect(legalMoves({ ...state, turn: 1 })).toEqual([7]);
    expect(legalMoves({ ...state, status: 'ended' })).toEqual([]);
  });

  it('maps local pit numbers and opposite pits', () => {
    expect(pitNumber(0, 0)).toBe(1);
    expect(pitNumber(0, 5)).toBe(6);
    expect(pitNumber(1, 7)).toBe(1);
    expect(pitNumber(1, 12)).toBe(6);
    expect(oppositePit(0)).toBe(12);
    expect(oppositePit(5)).toBe(7);
    expect(oppositePit(7)).toBe(5);
    expect(oppositePit(6)).toBe(-1);
    expect(storeOf(0)).toBe(6);
    expect(storeOf(1)).toBe(13);
  });

  it('rejects out-of-range, store and opponent pits', () => {
    const state = setup();
    expect(apply(state, -1).error).toBe('bad-pit');
    expect(apply(state, 6).error).toBe('bad-pit');
    expect(apply(state, 13).error).toBe('bad-pit');
    expect(apply(state, 1.5).error).toBe('bad-pit');
    expect(apply(state, 7).error).toBe('not-yours');
    expect(apply(state, 0).ok).toBe(true);
  });

  it('rejects an empty pit', () => {
    expect(apply(stateOf(), 0).error).toBe('empty');
  });

  it('rejects moves after the game has ended', () => {
    const ended = stateOf({ status: 'ended', winner: 0 });
    expect(apply(ended, 0).error).toBe('game-over');
    expect(applySeat(ended, 1, 7).error).toBe('wrong-turn');
  });
});

describe('Sowing engine: sowing', () => {
  it('sows one seed per pit and does not mutate the input', () => {
    const state = setup();
    const before = state.pits.slice();
    const result = apply(state, 0);
    expect(result.ok).toBe(true);
    expect(state.pits).toEqual(before);
    expect(result.state.pits[0]).toBe(0);
    expect(result.state.pits[1]).toBe(5);
    expect(result.state.turn).toBe(1);
    expect(result.state.moves).toEqual([0]);
    expect(result.state.last).toEqual({ pit: 0, path: [1, 2, 3, 4], capture: 0, extra: false });
  });

  it('grants another turn when the last seed lands in the store', () => {
    const state = custom([1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0]);
    const result = apply(state, 5);
    expect(result.ok).toBe(true);
    expect(result.state.stores[0]).toBe(1);
    expect(result.state.turn).toBe(0);
    expect(result.state.last?.extra).toBe(true);
    expect(result.state.status).toBe('playing');
  });

  it('skips the opponent store while sowing', () => {
    const state = custom([1, 1, 0, 0, 0, 9], [1, 0, 0, 0, 0, 0]);
    const result = apply(state, 5);
    expect(result.ok).toBe(true);
    expect(result.state.last?.path).toContain(0);
    expect(result.state.last?.path).not.toContain(13);
    expect(result.state.last?.path).toEqual([6, 7, 8, 9, 10, 11, 12, 0, 1]);
    expect(result.state.pits[13]).toBe(0);
    expect(result.state.turn).toBe(1);
  });

  it('sows a full lap back into the starting row', () => {
    const state = custom([0, 0, 0, 0, 1, 12], [2, 2, 2, 2, 2, 2]);
    const result = apply(state, 5);
    const path = result.state.last?.path ?? [];
    expect(path).toHaveLength(12);
    expect(result.state.pits[5]).toBe(0);
    expect(result.state.pits[0]).toBe(1);
    expect(result.state.pits[4]).toBe(2);
    expect(result.state.turn).toBe(1);
  });
});

describe('Sowing engine: capturing', () => {
  it('captures the landing seed and the opposite pit', () => {
    const state = custom([2, 0, 0, 0, 0, 0], [1, 0, 0, 3, 0, 0], [0, 0]);
    const result = apply(state, 0);
    expect(result.state.last?.capture).toBe(4);
    expect(result.state.stores[0]).toBe(4);
    expect(result.state.pits[2]).toBe(0);
    expect(result.state.pits[10]).toBe(0);
    expect(result.state.status).toBe('playing');
  });

  it('captures the single seed even when the opposite pit is empty', () => {
    const state = custom([2, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]);
    const result = apply(state, 0);
    expect(result.state.last?.capture).toBe(1);
    expect(result.state.stores[0]).toBe(1);
    expect(result.state.pits[2]).toBe(0);
  });

  it('does not capture when the landing pit already held seeds', () => {
    const state = custom([3, 0, 0, 1, 0, 0], [1, 0, 0, 0, 0, 0]);
    const result = apply(state, 0);
    expect(result.state.last?.capture).toBe(0);
    expect(result.state.stores[0]).toBe(0);
    expect(result.state.pits[3]).toBe(2);
  });

  it('does not capture on the opponent side', () => {
    const state = custom([8, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]);
    const result = apply(state, 0);
    expect(result.state.last?.capture).toBe(0);
    expect(result.state.stores[0]).toBe(1);
    expect(result.state.last?.path[result.state.last.path.length - 1]).toBe(8);
    expect(result.state.pits[8]).toBe(1);
  });
});

describe('Sowing engine: ending and scoring', () => {
  it('ends when a row empties and sweeps the remaining seeds', () => {
    const state = custom([0, 0, 0, 0, 0, 1], [2, 3, 0, 0, 0, 0], [0, 0]);
    const result = apply(state, 5);
    expect(result.state.status).toBe('ended');
    expect(result.state.pits.every((value) => value === 0)).toBe(true);
    expect(result.state.stores).toEqual([1, 5]);
    expect(result.state.winner).toBe(1);
    expect(total(result.state)).toBe(total(state));
  });

  it('declares a draw when both stores finish equal', () => {
    const state = custom([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0], [10, 10]);
    const result = apply(state, 5);
    expect(result.state.status).toBe('ended');
    expect(result.state.stores).toEqual([11, 11]);
    expect(result.state.winner).toBeNull();
  });

  it('awards the win to the bigger store', () => {
    const state = custom([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0], [15, 10]);
    const result = apply(state, 5);
    expect(result.state.winner).toBe(0);
    expect(result.state.stores).toEqual([16, 11]);
  });

  it('does not keep the turn once the final move ends the game', () => {
    const state = custom([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0], [10, 10]);
    const result = apply(state, 5);
    expect(result.state.last?.extra).toBe(true);
    expect(result.state.status).toBe('ended');
    expect(result.state.winner).toBeNull();
    expect(apply(result.state, 0).error).toBe('game-over');
  });

  it('can end the game by capturing the opponent row empty', () => {
    const state = custom([2, 0, 0, 0, 0, 1], [0, 0, 0, 1, 0, 0], [20, 5]);
    const result = apply(state, 0);
    expect(result.state.last?.capture).toBe(2);
    expect(result.state.status).toBe('ended');
    expect(result.state.stores).toEqual([24, 5]);
    expect(result.state.winner).toBe(0);
    expect(result.state.pits.every((value) => value === 0)).toBe(true);
    expect(total(result.state)).toBe(29);
  });
});

describe('Sowing engine: seats, views and previews', () => {
  it('enforces the seat and the turn', () => {
    const state = setup();
    expect(applySeat(state, 1, 7).error).toBe('wrong-turn');
    const after = applySeat(state, 0, 0);
    expect(after.ok).toBe(true);
    expect(applySeat(after.state, 1, 7).ok).toBe(true);
    expect(applySeat(after.state, 2, 0).error).toBe('wrong-turn');
  });

  it('gives each seat a public view with canMove', () => {
    const state = setup();
    const zero = view(state, 0);
    const one = view(state, 1);
    expect(zero.seat).toBe(0);
    expect(one.seat).toBe(1);
    expect(zero.canMove).toBe(true);
    expect(one.canMove).toBe(false);
    zero.pits[0] = 99;
    zero.stores[0] = 99;
    expect(state.pits[0]).toBe(4);
    expect(state.stores[0]).toBe(0);
  });

  it('previews a move without changing the state', () => {
    const state = custom([2, 0, 0, 0, 0, 0], [1, 0, 0, 3, 0, 0]);
    const preview = previewMove(state, 0);
    expect(preview?.capture).toBe(4);
    expect(preview?.storeGain).toBe(4);
    expect(preview?.extra).toBe(false);
    expect(preview?.next.stores[0]).toBe(4);
    expect(state.stores[0]).toBe(0);
    expect(previewMove(state, 7)).toBeNull();
  });

  it('reasons about captures, extra turns and quiet moves', () => {
    const capture = custom([2, 0, 0, 0, 0, 0], [1, 0, 0, 3, 0, 0]);
    const afterCapture = apply(capture, 0).state;
    expect(moveReason(capture, afterCapture)).toBe('capture');

    const extra = custom([1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0]);
    const afterExtra = apply(extra, 5).state;
    expect(moveReason(extra, afterExtra)).toBe('extra');

    const quiet = custom([4, 0, 0, 0, 1, 0], [1, 0, 0, 0, 0, 0]);
    const afterQuiet = apply(quiet, 0).state;
    expect(moveReason(quiet, afterQuiet)).toBe('quiet');

    const finish = custom([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0]);
    const afterFinish = apply(finish, 5).state;
    expect(moveReason(finish, afterFinish)).toBe('finish');
  });

  it('keeps 48 seeds through a complete deterministic game', () => {
    let state = setup();
    let moves = 0;
    while (state.status === 'playing' && moves < 600) {
      expect(total(state)).toBe(48);
      const legal = legalMoves(state);
      expect(legal.length).toBeGreaterThan(0);
      state = apply(state, legal[0]).state;
      moves += 1;
    }
    expect(state.status).toBe('ended');
    expect(total(state)).toBe(48);
    expect(state.pits.every((value) => value === 0)).toBe(true);
    expect(rowSum(state.pits, 0) + rowSum(state.pits, 1)).toBe(0);
  });
});

describe('Sowing AI', () => {
  function midgame(): GameState {
    let state = setup();
    for (const pit of [0, 7, 2, 9, 4, 11]) state = apply(state, pit).state;
    return state;
  }

  it('only returns legal moves on every level', () => {
    const state = midgame();
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.4);
      expect(legal).toContain(move);
    }
  });

  it('returns -1 when there is no legal move', () => {
    expect(chooseMove(stateOf(), 'hard')).toBe(-1);
  });

  it('is deterministic with the same injected RNG on every level', () => {
    const state = midgame();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const first = chooseMove(state, level, () => 0.42);
      const second = chooseMove(state, level, () => 0.42);
      expect(second).toBe(first);
    }
  });

  it('Companion favours a quiet sowing over a capture and an extra turn', () => {
    // Pit 0 captures 4, pit 5 earns an extra turn, pit 4 is a plain sowing.
    const state = custom([2, 0, 0, 0, 1, 1], [1, 0, 0, 3, 0, 0]);
    expect(chooseMove(state, 'companion', () => 0.99)).toBe(4);
  });

  it('Hard takes a move that ends the game as a win', () => {
    // Pit 0 captures the last northern seed and ends the game; pit 5 delays.
    const state = custom([2, 0, 0, 0, 0, 1], [0, 0, 0, 1, 0, 0], [20, 5]);
    const move = chooseMove(state, 'hard', () => 0.5);
    const preview = previewMove(state, move);
    expect(move).toBe(0);
    expect(preview?.next.status).toBe('ended');
    expect(preview?.next.winner).toBe(0);
  });

  it('plays a whole Normal vs Normal game to a finish', () => {
    let state = setup();
    let moves = 0;
    let seed = 7;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    while (state.status === 'playing' && moves < 600) {
      const move = chooseMove(state, 'normal', rng);
      expect(move).toBeGreaterThanOrEqual(0);
      state = apply(state, move).state;
      moves += 1;
    }
    expect(state.status).toBe('ended');
    expect(total(state)).toBe(48);
  });
});
