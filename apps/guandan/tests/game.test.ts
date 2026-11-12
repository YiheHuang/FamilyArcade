import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { apply, applySeat, legalMoves, setup, view, winningLine } from '../src/game/guandan';

function play(moves: number[]) {
  let state = setup('X');
  for (const move of moves) state = apply(state, move).state;
  return state;
}

describe('Guandan engine', () => {
  it('has nine empty cells and X starts', () => {
    const state = setup('X');
    expect(state.board).toHaveLength(9);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('X');
    expect(legalMoves(state)).toHaveLength(9);
  });

  it('alternates turns and rejects occupied cells', () => {
    const first = apply(setup('X'), 4);
    expect(first.ok).toBe(true);
    expect(first.state.turn).toBe('O');
    const again = apply(first.state, 4);
    expect(again.ok).toBe(false);
    expect(again.error).toBe('occupied');
    expect(apply(first.state, 9).error).toBe('bad-cell');
  });

  it('detects rows, columns and diagonals', () => {
    expect(winningLine(['X', 'X', 'X', null, null, null, null, null, null])).toEqual([0, 1, 2]);
    expect(winningLine(['O', null, null, 'O', null, null, 'O', null, null])).toEqual([0, 3, 6]);
    expect(winningLine(['X', null, null, null, 'X', null, null, null, 'X'])).toEqual([0, 4, 8]);
    expect(winningLine([null, null, null, null, null, null, null, null, null])).toBeNull();
  });

  it('ends on a win and refuses more moves', () => {
    const state = play([0, 3, 1, 4, 2]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('X');
    expect(state.line).toEqual([0, 1, 2]);
    expect(apply(state, 8).error).toBe('game-over');
  });

  it('ends in a draw when the board fills', () => {
    const state = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
  });

  it('enforces the seat mark', () => {
    const state = setup('X');
    expect(applySeat(state, 1, 0).error).toBe('wrong-turn');
    const after = applySeat(state, 0, 4);
    expect(after.ok).toBe(true);
    expect(applySeat(after.state, 1, 0).ok).toBe(true);
  });

  it('gives each seat its own public view', () => {
    const state = apply(setup('X'), 4).state;
    expect(view(state, 0).mark).toBe('X');
    expect(view(state, 1).mark).toBe('O');
    expect(view(state, 1).canMove).toBe(true);
    expect(view(state, 0).canMove).toBe(false);
  });
});

describe('Guandan AI', () => {
  it('takes an immediate win on every level except easy sometimes', () => {
    const state = play([0, 3, 1, 4]);
    expect(chooseMove(state, 'hard', () => 0.9)).toBe(2);
    expect(chooseMove(state, 'normal', () => 0.9)).toBe(2);
    expect(chooseMove(state, 'companion', () => 0.9)).toBe(2);
  });

  it('blocks an immediate loss on hard and companion', () => {
    const state = play([0, 3, 1]);
    expect(chooseMove(state, 'hard', () => 0.9)).toBe(2);
    expect(chooseMove(state, 'companion', () => 0.9)).toBe(2);
  });

  it('only returns legal moves', () => {
    const state = play([0, 1, 2, 3]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(legalMoves(state)).toContain(chooseMove(state, level, () => 0.4));
    }
  });
});
