import { describe, expect, it } from 'vitest';
import {
  analyseMove,
  candidateMoves,
  chooseMove,
  evaluateBoard,
  type AiLevel,
} from '../src/ai/ai';
import { describe as describeHint, hintFor } from '../src/ai/hint';
import {
  CELLS,
  CENTER,
  SIZE,
  apply,
  applySeat,
  colOf,
  indexOf,
  legal,
  legalMoves,
  lineThrough,
  resultText,
  rowOf,
  setup,
  view,
  winningLine,
  wouldWin,
  type Cell,
  type GameState,
  type Mark,
} from '../src/game/gomoku';

function play(moves: number[], first: Mark = 'B'): GameState {
  let state = setup(first);
  for (const move of moves) {
    const result = apply(state, move);
    if (!result.ok) throw new Error(`illegal test move ${move}: ${result.error}`);
    state = result.state;
  }
  return state;
}

function boardWith(stones: [number, Mark][], turn: Mark = 'W'): GameState {
  const board = Array<Cell>(CELLS).fill(null);
  for (const [index, mark] of stones) board[index] = mark;
  return { ...setup(turn), board, turn };
}

const DRAW_PATTERN: Cell[] = Array.from({ length: CELLS }, (_, index) => {
  const value = (rowOf(index) * 2 + colOf(index)) % 4;
  return value < 2 ? 'B' : 'W';
});

describe('Gomoku engine · board and turns', () => {
  it('creates a 15×15 empty board with Black to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(225);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('B');
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.line).toBeNull();
    expect(state.moves).toEqual([]);
    expect(legalMoves(state)).toHaveLength(225);
  });

  it('supports a chosen first player without changing the board size', () => {
    const state = setup('W');
    expect(state.first).toBe('W');
    expect(state.turn).toBe('W');
    expect(state.board).toHaveLength(CELLS);
  });

  it('maps row-major indices and board edges correctly', () => {
    expect(rowOf(0)).toBe(0);
    expect(colOf(0)).toBe(0);
    expect(rowOf(14)).toBe(0);
    expect(colOf(14)).toBe(14);
    expect(indexOf(7, 7)).toBe(CENTER);
    expect(rowOf(224)).toBe(14);
    expect(colOf(224)).toBe(14);
    expect(SIZE).toBe(15);
  });

  it('alternates Black and White and records moves', () => {
    const first = apply(setup(), CENTER);
    expect(first.ok).toBe(true);
    expect(first.state.board[CENTER]).toBe('B');
    expect(first.state.turn).toBe('W');
    expect(first.state.moves).toEqual([CENTER]);

    const second = apply(first.state, CENTER + 1);
    expect(second.state.board[CENTER + 1]).toBe('W');
    expect(second.state.turn).toBe('B');
    expect(second.state.moves).toEqual([CENTER, CENTER + 1]);
  });

  it('rejects occupied points, out-of-range points and fractional points', () => {
    const first = apply(setup(), 10);
    expect(apply(first.state, 10).error).toBe('occupied');
    expect(apply(first.state, -1).error).toBe('bad-cell');
    expect(apply(first.state, CELLS).error).toBe('bad-cell');
    expect(apply(first.state, 5.5).error).toBe('bad-cell');
    expect(apply(first.state, Number.NaN).error).toBe('bad-cell');
  });

  it('does not mutate the previous state or board', () => {
    const state = setup();
    const board = state.board.slice();
    apply(state, 20);
    expect(state.board).toEqual(board);
    expect(state.moves).toEqual([]);
    expect(state.turn).toBe('B');
  });

  it('ends the game and refuses every later move', () => {
    const state = play([0, 15, 1, 16, 2, 17, 3, 18, 4]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe('B');
    expect(apply(state, 100).error).toBe('game-over');
    expect(legal(state, 100)).toBe(false);
    expect(legalMoves(state)).toEqual([]);
  });

  it('accepts any empty opening point, not only the centre', () => {
    expect(apply(setup(), 0).ok).toBe(true);
    expect(apply(setup(), 224).ok).toBe(true);
    expect(apply(setup(), 143).ok).toBe(true);
  });
});

describe('Gomoku engine · winning lines', () => {
  const wins: [string, number[]][] = [
    ['horizontal', [0, 1, 2, 3, 4]],
    ['vertical', [0, 15, 30, 45, 60]],
    ['diagonal down-right', [0, 16, 32, 48, 64]],
    ['diagonal down-left', [4, 18, 32, 46, 60]],
    ['edge horizontal', [210, 211, 212, 213, 214]],
    ['edge vertical', [14, 29, 44, 59, 74]],
  ];

  for (const [name, sequence] of wins) {
    it(`detects a ${name} five`, () => {
      let clean = setup();
      for (let i = 0; i < sequence.length; i += 1) {
        clean = apply(clean, sequence[i]).state;
        if (i < sequence.length - 1) clean = apply(clean, 220 - i).state;
      }
      expect(clean.status).toBe('won');
      expect(clean.winner).toBe('B');
      expect(clean.line).toHaveLength(5);
      expect(new Set(clean.line)).toEqual(new Set(sequence));
      expect(resultText(clean)).toBe('black');
    });
  }

  it('counts an overline of six or more as a win in freestyle', () => {
    const state = boardWith(
      [
        [105, 'B'],
        [106, 'B'],
        [107, 'B'],
        [109, 'B'],
        [110, 'B'],
        [0, 'W'],
        [40, 'W'],
        [80, 'W'],
        [120, 'W'],
      ],
      'B',
    );
    const result = apply(state, 108);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.line).toHaveLength(6);
    expect(lineThrough(result.state.board, 108, 'B')).toEqual([105, 106, 107, 108, 109, 110]);
  });

  it('does not win with four, a gap, or a non-contiguous row', () => {
    const four = boardWith([
      [0, 'B'],
      [1, 'B'],
      [2, 'B'],
      [3, 'B'],
    ]);
    expect(winningLine(four.board)).toBeNull();

    const gap = boardWith([
      [0, 'B'],
      [1, 'B'],
      [2, 'B'],
      [3, 'B'],
      [5, 'B'],
    ]);
    expect(winningLine(gap.board)).toBeNull();

    const wrap = boardWith([
      [13, 'B'],
      [14, 'B'],
      [15, 'B'],
      [16, 'B'],
      [17, 'B'],
    ]);
    expect(winningLine(wrap.board)).toBeNull();
  });

  it('does not wrap a row into the next row', () => {
    const state = boardWith([
      [13, 'B'],
      [14, 'B'],
      [15, 'B'],
      [16, 'B'],
      [17, 'B'],
    ]);
    expect(winningLine(state.board)).toBeNull();
    expect(wouldWin(state.board, 12, 'B')).toBe(false);
  });

  it('detects a five through a gap once the gap is filled', () => {
    const state = boardWith([
      [0, 'B'],
      [1, 'B'],
      [2, 'B'],
      [4, 'B'],
      [5, 'B'],
    ], 'B');
    expect(winningLine(state.board)).toBeNull();
    expect(wouldWin(state.board, 3, 'B')).toBe(true);
    const result = apply(state, 3);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
  });

  it('finds all five directions with the winningLine scanner', () => {
    const horizontal = boardWith([0, 1, 2, 3, 4].map((i) => [i, 'W'] as [number, Mark]));
    const vertical = boardWith([15, 30, 45, 60, 75].map((i) => [i, 'B'] as [number, Mark]));
    expect(winningLine(horizontal.board)?.length).toBe(5);
    expect(winningLine(vertical.board)?.length).toBe(5);
  });

  it('wouldWin rejects occupied and out-of-bounds points', () => {
    const state = boardWith([[CENTER, 'B']]);
    expect(wouldWin(state.board, CENTER, 'B')).toBe(false);
    expect(wouldWin(state.board, -1, 'B')).toBe(false);
    expect(wouldWin(state.board, CELLS, 'B')).toBe(false);
    expect(wouldWin(state.board, CENTER, 'W')).toBe(false);
  });
});

describe('Gomoku engine · draw, seats and views', () => {
  it('declares a full board with no five a draw', () => {
    expect(winningLine(DRAW_PATTERN)).toBeNull();
    const last = CELLS - 1;
    const board = DRAW_PATTERN.slice();
    board[last] = null;
    const state: GameState = {
      ...setup('W'),
      board,
      turn: 'W',
      moves: Array.from({ length: CELLS - 1 }, (_, index) => index),
    };
    const result = apply(state, last);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.winner).toBeNull();
    expect(result.state.line).toBeNull();
    expect(resultText(result.state)).toBe('draw');
  });

  it('maps seats to Black and White', () => {
    const start = setup();
    expect(applySeat(start, 0, 0).ok).toBe(true);
    const afterBlack = applySeat(start, 0, 0).state;
    expect(applySeat(afterBlack, 1, 1).ok).toBe(true);
    expect(applySeat(afterBlack, 0, 2).error).toBe('wrong-turn');
    expect(applySeat(start, 2, 0).error).toBe('bad-seat');
    expect(applySeat(start, -1, 0).error).toBe('bad-seat');
  });

  it('gives each seat its own public view and canMove flag', () => {
    const after = apply(setup(), 10).state;
    const black = view(after, 0);
    const white = view(after, 1);
    expect(black.mark).toBe('B');
    expect(white.mark).toBe('W');
    expect(black.canMove).toBe(false);
    expect(white.canMove).toBe(true);
    expect(black.moveCount).toBe(1);
    expect(white.last).toBe(10);
    expect(white.seat).toBe(1);
  });

  it('returns copies in views so a guest cannot mutate the host board', () => {
    const state = apply(setup(), 10).state;
    const black = view(state, 0);
    black.board[0] = 'W';
    state.line && black.line?.push(0);
    expect(state.board[0]).toBeNull();
    expect(state.line).toBeNull();
  });

  it('reports results for both colours and a running game', () => {
    expect(resultText(setup())).toBeNull();
    expect(resultText(play([0, 15, 1, 16, 2, 17, 3, 18, 4]))).toBe('black');
    const white = play([0, 15, 2, 16, 4, 17, 6, 18, 8, 19]);
    expect(white.status).toBe('won');
    expect(white.winner).toBe('W');
    expect(resultText(white)).toBe('white');
  });

  it('tracks the last move for both seats', () => {
    let state = setup();
    state = apply(state, 30).state;
    state = apply(state, 31).state;
    expect(view(state, 0).last).toBe(31);
    expect(view(state, 1).last).toBe(31);
  });
});

describe('Gomoku AI', () => {
  const levels: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

  it('places in the centre on an empty board at Hard', () => {
    expect(chooseMove(setup(), 'hard', () => 0.5)).toBe(CENTER);
  });

  it('only considers nearby points once stones exist', () => {
    const board = Array<Cell>(CELLS).fill(null);
    board[CENTER] = 'B';
    const moves = candidateMoves(board);
    expect(moves).not.toContain(0);
    expect(moves).not.toContain(224);
    expect(moves).toContain(CENTER - 1);
    expect(moves.every((index) => board[index] === null)).toBe(true);
  });

  it('takes an immediate win on every level', () => {
    const state = play([0, 15, 1, 16, 2, 17, 3, 18]);
    for (const level of levels) {
      expect(chooseMove(state, level, () => 0.9)).toBe(4);
    }
  });

  it('blocks an immediate loss on Normal, Hard and Companion', () => {
    const state = play([31, 0, 32, 40, 33, 80, 34, 120, 200]);
    for (const level of ['companion', 'normal', 'hard'] as const) {
      expect([30, 35]).toContain(chooseMove(state, level, () => 0.5));
    }
  });

  it('blocks a one-ended four on Hard', () => {
    const state = play([16, 15, 17, 40, 18, 80, 19, 120, 200]);
    // Black has 16..19; White sits on 15, so only 20 completes the line.
    expect(chooseMove(state, 'hard', () => 0.5)).toBe(20);
  });

  it('returns a legal move on every level from a busy board', () => {
    const state = play([112, 97, 113, 98, 96, 99, 127, 84, 111, 100]);
    for (const level of levels) {
      const move = chooseMove(state, level, () => 0.37);
      expect(move).toBeGreaterThanOrEqual(0);
      expect(legalMoves(state)).toContain(move);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = play([112, 97, 113, 98, 111, 96, 114, 99]);
    for (const level of levels) {
      const a = chooseMove(state, level, () => 0.42);
      const b = chooseMove(state, level, () => 0.42);
      expect(a).toBe(b);
    }
  });

  it('returns -1 when the game is over or the board is full', () => {
    const won = play([0, 15, 1, 16, 2, 17, 3, 18, 4]);
    for (const level of levels) expect(chooseMove(won, level, () => 0.5)).toBe(-1);
  });

  it('reads an open four as two winning points', () => {
    const state = boardWith([
      [111, 'B'],
      [112, 'B'],
      [113, 'B'],
      [0, 'W'],
      [1, 'W'],
      [2, 'W'],
    ], 'B');
    const read = analyseMove(state.board, 114, 'B');
    expect(read.winNow).toBe(false);
    expect(read.winningPoints).toEqual([110, 115]);
    expect(read.score).toBeGreaterThan(0);
  });

  it('prefers a stronger board for the side to move', () => {
    const openFour = boardWith([
      [111, 'B'],
      [112, 'B'],
      [113, 'B'],
      [114, 'B'],
      [0, 'W'],
      [1, 'W'],
      [2, 'W'],
      [3, 'W'],
    ], 'B');
    const scattered = boardWith([
      [0, 'B'],
      [16, 'B'],
      [48, 'B'],
      [64, 'B'],
      [111, 'W'],
      [112, 'W'],
      [113, 'W'],
      [114, 'W'],
    ], 'B');
    expect(evaluateBoard(openFour.board, 'B')).toBeGreaterThan(evaluateBoard(scattered.board, 'B'));
  });
});

describe('Gomoku hints', () => {
  it('explains an immediate win', () => {
    const state = play([0, 15, 1, 16, 2, 17, 3, 18]);
    const hint = hintFor(state);
    expect(hint?.move).toBe(4);
    expect(hint?.kind).toBe('win');
  });

  it('explains a necessary block and names the opponent', () => {
    const state = play([31, 0, 32, 40, 33, 80, 34, 120, 200]);
    const hint = hintFor(state);
    expect([30, 35]).toContain(hint?.move);
    expect(hint?.kind).toBe('block');
    expect(hint?.threat).toBe('B');
  });

  it('suggests the centre on an empty board', () => {
    const hint = hintFor(setup());
    expect(hint).toEqual({ move: CENTER, kind: 'center' });
  });

  it('recognises an open three', () => {
    const state = boardWith([
      [111, 'B'],
      [113, 'B'],
      [0, 'W'],
      [1, 'W'],
    ], 'B');
    expect(describeHint(state, 112)?.kind).toBe('openThree');
  });

  it('recognises an open four', () => {
    const state = boardWith([
      [111, 'B'],
      [112, 'B'],
      [113, 'B'],
      [0, 'W'],
      [1, 'W'],
    ], 'B');
    expect(describeHint(state, 114)?.kind).toBe('openFour');
  });

  it('recognises a closed four', () => {
    const state = boardWith([
      [110, 'W'],
      [111, 'B'],
      [112, 'B'],
      [113, 'B'],
      [0, 'B'],
      [1, 'W'],
    ], 'B');
    expect(describeHint(state, 114)?.kind).toBe('four');
  });

  it('returns null when the game is over', () => {
    const state = play([0, 15, 1, 16, 2, 17, 3, 18, 4]);
    expect(hintFor(state)).toBeNull();
    expect(describeHint(state, 100)).toBeNull();
  });
});
