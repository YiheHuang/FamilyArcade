import { describe, expect, it } from 'vitest';
import { chooseMove, hintMove } from '../src/ai/ai';
import {
  CELLS,
  COLS,
  apply,
  applySeat,
  colOf,
  columnHeight,
  dropRow,
  indexAt,
  legalColumns,
  lineThrough,
  replay,
  rowOf,
  setup,
  view,
  winningLine,
} from '../src/game/four';

/** Known legal finish with no four-in-a-line for either player. */
const DRAW_GAME = [
  4, 5, 1, 4, 0, 4, 5, 3, 6, 1, 5, 5, 4, 0, 3, 2, 6, 2, 5, 5, 1, 0, 4, 1, 1, 0, 2, 6, 1, 2, 6,
  2, 3, 6, 2, 4, 0, 6, 3, 3, 3, 0,
];

const HORIZONTAL_WIN = [0, 0, 1, 0, 2, 0, 3];
const VERTICAL_WIN = [0, 1, 0, 1, 0, 1, 0];
const DIAGONAL_DOWN = [0, 1, 1, 2, 2, 3, 2, 3, 3, 0, 3];
const DIAGONAL_UP = [2, 0, 2, 0, 0, 1, 0, 1, 1, 0, 3];

function play(columns: number[]) {
  return replay(columns);
}

describe('Four engine', () => {
  it('starts with 42 empty slots and red to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(CELLS);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('R');
    expect(state.status).toBe('playing');
    expect(state.moves).toHaveLength(0);
    expect(legalColumns(state)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('honours a yellow opening when asked', () => {
    const state = setup('Y');
    expect(state.turn).toBe('Y');
    expect(state.first).toBe('Y');
  });

  it('drops a disc to the lowest slot in a column', () => {
    const result = apply(setup(), 3);
    expect(result.ok).toBe(true);
    expect(dropRow(result.state.board, 3)).toBe(4);
    expect(result.state.board[indexAt(5, 3)]).toBe('R');
    expect(result.state.last).toBe(indexAt(5, 3));
    expect(result.state.board[indexAt(4, 3)]).toBeNull();
  });

  it('stacks discs and reports column height', () => {
    const state = play([3, 3, 3]);
    expect(columnHeight(state.board, 3)).toBe(3);
    expect(state.board[indexAt(5, 3)]).toBe('R');
    expect(state.board[indexAt(4, 3)]).toBe('Y');
    expect(state.board[indexAt(3, 3)]).toBe('R');
    expect(dropRow(state.board, 3)).toBe(2);
  });

  it('alternates red and yellow', () => {
    const first = apply(setup(), 0);
    expect(first.state.turn).toBe('Y');
    const second = apply(first.state, 1);
    expect(second.state.turn).toBe('R');
    expect(second.state.moves).toEqual([0, 1]);
  });

  it('rejects columns outside 0–6 and non-integers', () => {
    for (const col of [-1, 7, 1.5, Number.NaN]) {
      const result = apply(setup(), col);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('bad-column');
    }
  });

  it('rejects a full column without changing state', () => {
    const state = play([0, 0, 0, 0, 0, 0]);
    expect(columnHeight(state.board, 0)).toBe(6);
    expect(dropRow(state.board, 0)).toBe(-1);
    const result = apply(state, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('full-column');
    expect(result.state).toBe(state);
  });

  it('detects a horizontal four', () => {
    const state = play(HORIZONTAL_WIN);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.line).toHaveLength(4);
    expect(state.line?.every((index) => rowOf(index) === 5)).toBe(true);
    expect(state.line?.map(colOf).sort()).toEqual([0, 1, 2, 3]);
  });

  it('detects a vertical four', () => {
    const state = play(VERTICAL_WIN);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.line?.every((index) => colOf(index) === 0)).toBe(true);
    expect(state.line?.map(rowOf).sort()).toEqual([2, 3, 4, 5]);
  });

  it('detects a diagonal four going down-right', () => {
    const state = play(DIAGONAL_DOWN);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.line).toEqual([indexAt(2, 3), indexAt(3, 2), indexAt(4, 1), indexAt(5, 0)]);
  });

  it('detects a diagonal four going up-right', () => {
    const state = play(DIAGONAL_UP);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.line).toEqual([indexAt(2, 0), indexAt(3, 1), indexAt(4, 2), indexAt(5, 3)]);
  });

  it('detects a yellow win and sets the winner correctly', () => {
    const state = play([6, 0, 6, 1, 6, 2, 5, 3]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('Y');
    expect(state.line).toHaveLength(4);
  });

  it('does not report a line when a gap breaks it', () => {
    const board = Array(CELLS).fill(null);
    board[indexAt(5, 0)] = 'R';
    board[indexAt(5, 1)] = 'R';
    board[indexAt(5, 3)] = 'R';
    board[indexAt(5, 4)] = 'R';
    expect(winningLine(board)).toBeNull();
    expect(lineThrough(board, indexAt(5, 1))).toBeNull();
  });

  it('finds a four through the last drop and only that line', () => {
    const state = play(HORIZONTAL_WIN);
    const last = state.last;
    expect(last).not.toBeNull();
    const line = lineThrough(state.board, last as number);
    expect(line).toEqual([indexAt(5, 0), indexAt(5, 1), indexAt(5, 2), indexAt(5, 3)]);
    expect(state.line?.slice().sort()).toEqual(line?.slice().sort());
  });

  it('ends the game on a win and refuses more moves', () => {
    const state = play(HORIZONTAL_WIN);
    const result = apply(state, 6);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('game-over');
    expect(legalColumns(state)).toEqual([]);
  });

  it('fills the board to a draw with no four', () => {
    const state = replay(DRAW_GAME);
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
    expect(state.line).toBeNull();
    expect(state.moves).toHaveLength(42);
    expect(state.board.every(Boolean)).toBe(true);
    expect(winningLine(state.board)).toBeNull();
    expect(apply(state, 0).error).toBe('game-over');
  });

  it('maps row and column helpers consistently', () => {
    for (let index = 0; index < CELLS; index++) {
      expect(indexAt(rowOf(index), colOf(index))).toBe(index);
    }
    expect(colOf(41)).toBe(6);
    expect(rowOf(41)).toBe(5);
    expect(colOf(0)).toBe(0);
    expect(rowOf(0)).toBe(0);
  });

  it('limits a seat to its own disc', () => {
    const state = setup();
    const wrong = applySeat(state, 1, 0);
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe('wrong-turn');
    const red = applySeat(state, 0, 3);
    expect(red.ok).toBe(true);
    const yellow = applySeat(red.state, 1, 3);
    expect(yellow.ok).toBe(true);
    expect(yellow.state.board[indexAt(4, 3)]).toBe('Y');
  });

  it('gives each seat its own view and canMove flag', () => {
    expect(view(setup(), 0).disc).toBe('R');
    expect(view(setup(), 1).disc).toBe('Y');
    expect(view(setup(), 0).canMove).toBe(true);
    expect(view(setup(), 1).canMove).toBe(false);
    const after = apply(setup(), 2).state;
    expect(view(after, 0).canMove).toBe(false);
    expect(view(after, 1).canMove).toBe(true);
    expect(view(after, 1).board).not.toBe(after.board);
    expect(view(after, 1).board).toEqual(after.board);
    expect(view(after, 1).last).toBe(after.last);
    expect(view(after, 1).moveCount).toBe(1);
  });

  it('replays a sequence exactly like successive applies', () => {
    let state = setup();
    for (const col of HORIZONTAL_WIN) state = apply(state, col).state;
    const replayed = replay(HORIZONTAL_WIN);
    expect(replayed).toEqual(state);
  });

  it('keeps every move in the replay inside the board', () => {
    const state = replay(DRAW_GAME);
    expect(state.moves.every((col) => col >= 0 && col < COLS)).toBe(true);
    expect(new Set(state.board)).toEqual(new Set(['R', 'Y']));
  });
});

describe('Four AI', () => {
  it('returns a legal column for every level', () => {
    const state = play([3, 3, 4, 2, 6]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(legalColumns(state)).toContain(chooseMove(state, level, () => 0.42));
    }
  });

  it('returns -1 when the game is over', () => {
    const state = play(HORIZONTAL_WIN);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, () => 0.5)).toBe(-1);
    }
  });

  it('takes an immediate win on normal and hard', () => {
    const state = play([0, 0, 1, 0, 2, 0]);
    expect(chooseMove(state, 'normal', () => 0.9)).toBe(3);
    expect(chooseMove(state, 'hard', () => 0.9)).toBe(3);
  });

  it('takes a win on companion when the RNG agrees', () => {
    const state = play([0, 0, 1, 0, 2, 0]);
    expect(chooseMove(state, 'companion', () => 0.1)).toBe(3);
  });

  it('declines a non-central win on companion when the RNG says so', () => {
    const state = play([1, 4, 2, 6, 3, 6]);
    expect(chooseMove(state, 'companion', () => 0.1)).toBe(0);
    expect(chooseMove(state, 'companion', () => 0.9)).not.toBe(0);
  });

  it('blocks an immediate loss on normal and hard', () => {
    const state = play([6, 0, 5, 1, 6, 2]);
    expect(chooseMove(state, 'normal', () => 0.9)).toBe(3);
    expect(chooseMove(state, 'hard', () => 0.9)).toBe(3);
  });

  it('blocks an immediate loss on companion most of the time', () => {
    const state = play([6, 0, 5, 1, 6, 2]);
    expect(chooseMove(state, 'companion', () => 0.1)).toBe(3);
    expect(chooseMove(state, 'companion', () => 0.9)).not.toBe(3);
  });

  it('easy is random but deterministic with an injected RNG', () => {
    const state = setup();
    expect(chooseMove(state, 'easy', () => 0)).toBe(0);
    expect(chooseMove(state, 'easy', () => 0.999)).toBe(6);
    expect(chooseMove(state, 'easy', () => 0.42)).toBe(chooseMove(state, 'easy', () => 0.42));
  });

  it('normal and hard repeat the same move with the same RNG', () => {
    const state = play([3, 3, 2, 4, 6, 2]);
    expect(chooseMove(state, 'normal', () => 0.37)).toBe(chooseMove(state, 'normal', () => 0.37));
    expect(chooseMove(state, 'hard', () => 0.37)).toBe(chooseMove(state, 'hard', () => 0.37));
  });

  it('hard prefers the centre on an empty board', () => {
    expect(chooseMove(setup(), 'hard')).toBe(3);
    expect(chooseMove(setup(), 'normal')).toBe(3);
  });

  it('hints at a winning column and says why', () => {
    expect(hintMove(play([0, 0, 1, 0, 2, 0]))).toEqual({ column: 3, reason: 'win' });
  });

  it('hints at a block and says why', () => {
    expect(hintMove(play([6, 0, 5, 1, 6, 2]))).toEqual({ column: 3, reason: 'block' });
  });

  it('hints at a building move on an open board', () => {
    const advice = hintMove(setup());
    expect(advice.reason).toBe('build');
    expect(advice.column).toBe(3);
  });

  it('never suggests an illegal column', () => {
    const state = play([0, 0, 0, 0, 0, 0, 1]);
    for (let i = 0; i < 5; i++) {
      const advice = hintMove(state);
      expect(legalColumns(state)).toContain(advice.column);
    }
  });
});
