import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import { apply, applySeat, legalMoves, setup, view, winningLine } from '../src/game/triple';
import { addResult, EMPTY_RECORD, normalizeRecord } from '../src/storage';

function play(moves: number[]) {
  let state = setup('X');
  for (const move of moves) state = apply(state, move).state;
  return state;
}

describe('Triple engine', () => {
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

  it('never mutates the state passed into apply', () => {
    const before = setup('X');
    const snapshot = JSON.stringify(before);
    apply(before, 4);
    expect(JSON.stringify(before)).toBe(snapshot);
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

  it('reports the last move, including after a LAN view', () => {
    const state = play([0, 3, 1]);
    expect(view(state, 1).last).toBe(1);
    expect(view(state, 1).moveCount).toBe(3);
    expect(view(setup('X'), 0).last).toBeNull();
  });
});

describe('Triple AI', () => {
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

describe('Triple hints', () => {
  it('explains an immediate win', () => {
    const state = play([0, 3, 1, 4]);
    expect(hintFor(state)).toEqual({ move: 2, kind: 'win' });
  });

  it('explains an immediate block', () => {
    const state = play([0, 3, 1]);
    expect(hintFor(state)).toMatchObject({ move: 2, kind: 'block', threat: 'X' });
  });

  it('returns a legal opening hint with a useful reason', () => {
    const state = setup('X');
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(legalMoves(state)).toContain(hint?.move);
    expect(['center', 'corner']).toContain(hint?.kind);
  });

  it('has no hint after the game ends', () => {
    expect(hintFor(play([0, 3, 1, 4, 2]))).toBeNull();
  });
});

describe('Triple family record', () => {
  const xWin = play([0, 3, 1, 4, 2]);
  const oWin = play([0, 3, 1, 4, 8, 5]);
  const draw = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);

  it('counts X, O and draw results with a mode', () => {
    const first = addResult(EMPTY_RECORD, xWin, { mode: 'local' }, 1000);
    const second = addResult(first, oWin, { mode: 'ai', level: 'normal' }, 2000);
    const third = addResult(second, draw, { mode: 'lan' }, 3000);
    expect(third.games).toBe(3);
    expect([third.winsX, third.winsO, third.draws]).toEqual([1, 1, 1]);
    expect(third.byMode).toEqual({ ai: 1, local: 1, lan: 1 });
    expect(third.recent.map((entry) => entry.winner)).toEqual(['draw', 'O', 'X']);
    expect(third.recent[1].level).toBe('normal');
    expect(third.recent[0].moves).toBe(9);
  });

  it('tracks the current and best same-winner streak', () => {
    const first = addResult(EMPTY_RECORD, xWin, { mode: 'local' }, 1000);
    const second = addResult(first, xWin, { mode: 'ai' }, 2000);
    const third = addResult(second, draw, { mode: 'local' }, 3000);
    expect(first.streak).toBe(1);
    expect(second.streak).toBe(2);
    expect(second.bestStreak).toBe(2);
    expect(third.streak).toBe(1);
    expect(third.bestStreak).toBe(2);
    expect(third.lastWinner).toBe('draw');
  });

  it('keeps only the eight most recent games', () => {
    let record = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addResult(record, xWin, { mode: 'local' }, 1000 + index);
    }
    expect(record.games).toBe(11);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
  });

  it('normalizes a legacy record without mode or recent fields', () => {
    const record = normalizeRecord({
      games: 4,
      winsX: 3,
      winsO: 0,
      draws: 1,
      streak: 2,
      lastWinner: 'X',
    });
    expect(record.games).toBe(4);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
    expect(record.recent).toEqual([]);
    expect(record.bestStreak).toBe(0);
  });
});
