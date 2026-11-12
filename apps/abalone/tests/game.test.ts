import { describe, expect, it } from 'vitest';
import { chooseMove, hintFor } from '../src/ai/ai';
import {
  CAPTURES_TO_WIN,
  apply,
  applySeat,
  indexAt,
  legalMoves,
  lineOrder,
  moveDestinations,
  moveKey,
  neighbor,
  setup,
  view,
  type GameState,
  type Move,
  type Player,
} from '../src/game/abalone';

function emptyState(turn: Player = 'B'): GameState {
  const state = setup(turn);
  state.board = Array<Player | null>(61).fill(null);
  state.captured = { B: 0, W: 0 };
  state.moves = [];
  return state;
}

function place(state: GameState, entries: [number, Player][]): GameState {
  for (const [index, player] of entries) state.board[index] = player;
  return state;
}

function hasMove(moves: Move[], cells: number[], dir: Move['dir']): boolean {
  return moves.some(
    (move) => move.dir === dir && move.cells.length === cells.length && move.cells.every((cell, i) => cell === cells[i]),
  );
}

function seeded(seed = 0.42): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

describe('Abalone setup and coordinates', () => {
  it('builds a 61-point board with 14 marbles each', () => {
    const state = setup('B');
    expect(state.board).toHaveLength(61);
    expect(state.board.filter((cell) => cell === 'B')).toHaveLength(14);
    expect(state.board.filter((cell) => cell === 'W')).toHaveLength(14);
    expect(state.board.filter((cell) => cell === null)).toHaveLength(33);
    expect(state.turn).toBe('B');
    expect(state.status).toBe('playing');
  });

  it('has the standard nine rows and neighbours', () => {
    expect(indexAt(0, 0)).toBe(30);
    const rows = new Map<number, number>();
    for (const r of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
      let count = 0;
      for (let q = -4; q <= 4; q += 1) if (indexAt(q, r) >= 0) count += 1;
      rows.set(r, count);
    }
    expect([...rows.values()]).toEqual([5, 6, 7, 8, 9, 8, 7, 6, 5]);
    expect(neighbor(32, 'E')).toBe(33);
    expect(neighbor(32, 'W')).toBe(31);
    expect(neighbor(34, 'E')).toBe(-1);
    expect(neighbor(indexAt(0, 0), 'NE')).toBe(indexAt(1, -1));
  });

  it('recognises contiguous one-to-three marble lines', () => {
    expect(lineOrder([32, 33])).toEqual([32, 33]);
    expect(lineOrder([33, 32])).toEqual([32, 33]);
    expect(lineOrder([32, 33, 34])).toEqual([32, 33, 34]);
    expect(lineOrder([32, 34])).toBeNull();
    expect(lineOrder([32, 33, 26])).toBeNull();
    expect(lineOrder([31, 32, 33, 34])).toBeNull();
    expect(lineOrder([32, 32])).toBeNull();
  });
});

describe('Abalone movement', () => {
  it('moves one marble in six directions', () => {
    const state = place(emptyState('B'), [[30, 'B']]);
    for (const dir of ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const) {
      expect(apply(state, { cells: [30], dir }).ok).toBe(true);
    }
    const moved = apply(state, { cells: [30], dir: 'E' }).state;
    expect(moved.board[30]).toBeNull();
    expect(moved.board[31]).toBe('B');
    expect(moved.turn).toBe('W');
    expect(moved.moves).toHaveLength(1);
  });

  it('slides a two-marble line broadside into empty points', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'B'],
    ]);
    const move: Move = { cells: [32, 33], dir: 'NE' };
    const result = apply(state, move);
    expect(result.ok).toBe(true);
    expect(result.state.board[32]).toBeNull();
    expect(result.state.board[33]).toBeNull();
    expect(result.state.board[24]).toBe('B');
    expect(result.state.board[25]).toBe('B');
    expect(result.state.captured).toEqual({ B: 0, W: 0 });
  });

  it('refuses a broadside move into an occupied point', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'B'],
      [24, 'W'],
    ]);
    expect(apply(state, { cells: [32, 33], dir: 'NE' }).error).toBe('bad-move');
  });

  it('refuses a broadside move that leaves the board', () => {
    const state = place(emptyState('B'), [
      [33, 'B'],
      [34, 'B'],
    ]);
    expect(apply(state, { cells: [33, 34], dir: 'NE' }).error).toBe('bad-move');
  });

  it('advances a line in-line into empty space', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
    ]);
    const result = apply(state, { cells: [30, 31], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.board[30]).toBeNull();
    expect(result.state.board[31]).toBe('B');
    expect(result.state.board[32]).toBe('B');
  });

  it('retreats a line in-line when the rear point is empty', () => {
    const state = place(emptyState('B'), [
      [31, 'B'],
      [32, 'B'],
    ]);
    const result = apply(state, { cells: [31, 32], dir: 'W' });
    expect(result.ok).toBe(true);
    expect(result.state.board[30]).toBe('B');
    expect(result.state.board[31]).toBe('B');
    expect(result.state.board[32]).toBeNull();
  });

  it('refuses a retreat when another marble is behind the line', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'B'],
    ]);
    expect(apply(state, { cells: [31, 32], dir: 'W' }).error).toBe('bad-move');
  });

  it('rejects a four-marble line', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'B'],
      [33, 'B'],
    ]);
    expect(apply(state, { cells: [30, 31, 32, 33], dir: 'E' }).error).toBe('bad-move');
  });

  it('only moves the side to play', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'W'],
    ]);
    expect(apply(state, { cells: [33], dir: 'E' }).error).toBe('bad-move');
  });
});

describe('Abalone pushing and captures', () => {
  it('pushes one weaker marble with a two-marble line', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'W'],
    ]);
    const result = apply(state, { cells: [30, 31], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.board[31]).toBe('B');
    expect(result.state.board[32]).toBe('B');
    expect(result.state.board[33]).toBe('W');
    expect(result.state.board[30]).toBeNull();
    expect(result.state.captured).toEqual({ B: 0, W: 0 });
  });

  it('does not push when the lines are equal', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'W'],
      [33, 'W'],
    ]);
    expect(apply(state, { cells: [30, 31], dir: 'E' }).error).toBe('bad-move');
  });

  it('refuses a single marble push', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'W'],
    ]);
    expect(apply(state, { cells: [32], dir: 'E' }).error).toBe('bad-move');
  });

  it('pushes a two-marble line with three marbles and captures the end marble', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'B'],
      [33, 'W'],
      [34, 'W'],
    ]);
    const result = apply(state, { cells: [30, 31, 32], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.captured).toEqual({ B: 1, W: 0 });
    expect(result.state.board[31]).toBe('B');
    expect(result.state.board[32]).toBe('B');
    expect(result.state.board[33]).toBe('B');
    expect(result.state.board[34]).toBe('W');
    expect(result.state.board.filter((cell) => cell === 'W')).toHaveLength(1);
  });

  it('captures exactly one marble when pushing two off the edge', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'B'],
      [33, 'W'],
      [34, 'W'],
    ]);
    const result = apply(state, { cells: [30, 31, 32], dir: 'E' });
    expect(result.state.captured.B).toBe(1);
    expect(result.state.captured.W).toBe(0);
    expect(result.state.status).toBe('playing');
  });

  it('refuses to push into a marble behind the opponent', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [32, 'W'],
      [33, 'B'],
    ]);
    expect(apply(state, { cells: [30, 31], dir: 'E' }).error).toBe('bad-move');
  });

  it('refuses to push three with three', () => {
    const state = place(emptyState('B'), [
      [29, 'B'],
      [30, 'B'],
      [31, 'B'],
      [32, 'W'],
      [33, 'W'],
      [34, 'W'],
    ]);
    expect(apply(state, { cells: [29, 30, 31], dir: 'E' }).error).toBe('bad-move');
  });

  it('counts captures for the side that pushed', () => {
    const state = place(emptyState('W'), [
      [32, 'W'],
      [33, 'W'],
      [34, 'B'],
    ]);
    const result = apply(state, { cells: [32, 33], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.captured).toEqual({ B: 0, W: 1 });
    expect(result.state.board[34]).toBe('W');
  });

  it('does not win at five captures', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'B'],
      [34, 'W'],
    ]);
    state.captured.B = CAPTURES_TO_WIN - 2;
    const result = apply(state, { cells: [32, 33], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.captured.B).toBe(CAPTURES_TO_WIN - 1);
    expect(result.state.status).toBe('playing');
    expect(result.state.winner).toBeNull();
  });

  it('wins on the sixth capture', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'B'],
      [34, 'W'],
    ]);
    state.captured.B = CAPTURES_TO_WIN - 1;
    const result = apply(state, { cells: [32, 33], dir: 'E' });
    expect(result.ok).toBe(true);
    expect(result.state.captured.B).toBe(CAPTURES_TO_WIN);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('B');
    expect(apply(result.state, { cells: [30], dir: 'E' }).error).toBe('game-over');
  });

  it('points a push at the victim', () => {
    const move: Move = { cells: [32, 33], dir: 'E' };
    expect(moveDestinations(move)).toEqual([34]);
  });
});

describe('Abalone seats, views and purity', () => {
  it('enforces the seat colour', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [40, 'W'],
    ]);
    expect(applySeat(state, 1, { cells: [30], dir: 'E' }).error).toBe('wrong-turn');
    const after = applySeat(state, 0, { cells: [30], dir: 'E' });
    expect(after.ok).toBe(true);
    expect(applySeat(after.state, 0, { cells: [40], dir: 'E' }).error).toBe('wrong-turn');
    expect(applySeat(after.state, 1, { cells: [40], dir: 'E' }).ok).toBe(true);
  });

  it('gives each seat a view with its own mark and canMove', () => {
    const state = place(emptyState('B'), [[30, 'B'], [40, 'W']]);
    const black = view(state, 0);
    const white = view(state, 1);
    expect(black.mark).toBe('B');
    expect(black.canMove).toBe(true);
    expect(white.mark).toBe('W');
    expect(white.canMove).toBe(false);
    expect(black.board).not.toBe(state.board);
  });

  it('leaves the previous state untouched', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
    ]);
    const before = state.board.slice();
    const capturedBefore = { ...state.captured };
    apply(state, { cells: [30, 31], dir: 'E' });
    expect(state.board).toEqual(before);
    expect(state.captured).toEqual(capturedBefore);
    expect(state.moves).toEqual([]);
  });

  it('rejects malformed moves', () => {
    const state = place(emptyState('B'), [[30, 'B']]);
    expect(apply(state, { cells: [], dir: 'E' }).error).toBe('bad-move');
    expect(apply(state, { cells: [30], dir: 'X' as never }).error).toBe('bad-move');
    expect(apply(state, { cells: [30, 30], dir: 'E' }).error).toBe('bad-move');
  });
});

describe('Abalone AI and hints', () => {
  it('returns each legal move exactly once', () => {
    const keys = legalMoves(setup('B')).map(moveKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers only legal moves and a legal hint', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [40, 'W'],
      [41, 'W'],
    ]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, seeded(0.31));
      expect(move).not.toBeNull();
      expect(hasMove(legalMoves(state), move!.cells, move!.dir)).toBe(true);
    }
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(hasMove(legalMoves(state), hint!.move.cells, hint!.move.dir)).toBe(true);
  });

  it('takes a winning capture on hard and companion', () => {
    const state = place(emptyState('B'), [
      [32, 'B'],
      [33, 'B'],
      [34, 'W'],
    ]);
    state.captured.B = CAPTURES_TO_WIN - 1;
    const hard = chooseMove(state, 'hard', () => 0.9);
    const companion = chooseMove(state, 'companion', () => 0.9);
    expect(hard).not.toBeNull();
    expect(companion).not.toBeNull();
    expect(apply(state, hard!).state.status).toBe('won');
    expect(apply(state, companion!).state.status).toBe('won');
  });

  it('is deterministic with the same injected RNG', () => {
    const state = place(emptyState('B'), [
      [30, 'B'],
      [31, 'B'],
      [40, 'W'],
      [41, 'W'],
    ]);
    const first = chooseMove(state, 'normal', seeded(0.77));
    const second = chooseMove(state, 'normal', seeded(0.77));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(moveKey(first!)).toBe(moveKey(second!));
  });

  it('returns nothing on a finished game', () => {
    const state = emptyState('B');
    state.status = 'won';
    state.winner = 'B';
    expect(chooseMove(state, 'hard', () => 0.5)).toBeNull();
    expect(hintFor(state)).toBeNull();
  });
});
