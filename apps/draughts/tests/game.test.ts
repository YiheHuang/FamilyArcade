import { describe, expect, it } from 'vitest';
import {
  apply,
  applySeat,
  countPieces,
  legalMoves,
  moveName,
  parseSquare,
  position,
  setup,
  squareName,
  view,
  type GameState,
  type Move,
  type Piece,
} from '../src/game/draughts';
import {
  chooseMove,
  chooseWithReason,
  evaluate,
  reasonFor,
  type AiLevel,
} from '../src/ai/ai';

const at = (row: number, col: number) => row * 8 + col;

function boardWith(pieces: [number, Piece][]): (Piece | null)[] {
  const board = Array<Piece | null>(64).fill(null);
  for (const [square, piece] of pieces) board[square] = piece;
  return board;
}

function moveBetween(state: GameState, from: number, to: number): Move {
  const move = legalMoves(state).find(
    (candidate) => candidate.from === from && candidate.to === to,
  );
  expect(move, `expected a move ${squareName(from)}-${squareName(to)}`).toBeDefined();
  return move as Move;
}

function play(state: GameState, from: number, to: number): GameState {
  const result = apply(state, moveBetween(state, from, to));
  expect(result.ok).toBe(true);
  return result.state;
}

function seeded(seed = 27): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

describe('Draughts setup and geometry', () => {
  it('places twelve men per side on the dark squares and gives Red the first turn', () => {
    const state = setup();
    expect(state.board).toHaveLength(64);
    expect(countPieces(state.board, 'red')).toBe(12);
    expect(countPieces(state.board, 'white')).toBe(12);
    expect(state.turn).toBe('red');
    expect(state.status).toBe('playing');
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 0) {
          expect(state.board[at(row, col)]).toBeNull();
        }
      }
    }
  });

  it('opens with seven legal Red moves', () => {
    const moves = legalMoves(setup());
    expect(moves).toHaveLength(7);
    expect(moves.every((move) => move.from >= 40 && move.from < 48)).toBe(true);
  });

  it('supports White moving first when asked', () => {
    const state = setup('white');
    expect(state.turn).toBe('white');
    expect(legalMoves(state)).toHaveLength(7);
  });

  it('names squares and moves in draughts notation', () => {
    expect(squareName(at(7, 0))).toBe('a1');
    expect(squareName(at(0, 7))).toBe('h8');
    expect(parseSquare('c3')).toBe(at(5, 2));
    expect(parseSquare('h8')).toBe(7);
    expect(parseSquare('z9')).toBeNull();
    const state = setup();
    expect(moveName(moveBetween(state, at(5, 2), at(4, 1)))).toBe('c3-b4');
  });

  it('rejects a board with the wrong number of cells', () => {
    expect(() => position([null], 'red')).toThrow();
  });
});

describe('Draughts moves and turns', () => {
  it('applies a simple move, clears the old square and hands over the turn', () => {
    const state = setup();
    const after = play(state, at(5, 2), at(4, 1));
    expect(after.board[at(5, 2)]).toBeNull();
    expect(after.board[at(4, 1)]).toBe('r');
    expect(after.turn).toBe('white');
    expect(after.lastMove?.path).toEqual([at(5, 2), at(4, 1)]);
    expect(after.plies).toBe(1);
  });

  it('rejects an illegal destination and a wrong seat', () => {
    const state = setup();
    const illegal: Move = {
      from: at(5, 2),
      to: at(5, 3),
      path: [at(5, 2), at(5, 3)],
      captures: [],
      promote: false,
    };
    expect(apply(state, illegal).error).toBe('illegal');
    expect(applySeat(state, 1, moveBetween(state, at(5, 2), at(4, 1))).error).toBe(
      'wrong-turn',
    );
    expect(applySeat(state, 0, moveBetween(state, at(5, 2), at(4, 1))).ok).toBe(true);
  });

  it('lets seat 1 make the White reply after Red moves', () => {
    const afterRed = play(setup(), at(5, 2), at(4, 1));
    const move = legalMoves(afterRed)[0];
    const result = applySeat(afterRed, 1, move);
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe('red');
    expect(applySeat(afterRed, 0, move).error).toBe('wrong-turn');
  });

  it('refuses moves after the game has ended', () => {
    const state = position(
      boardWith([
        [at(5, 2), 'r'],
        [at(4, 3), 'w'],
      ]),
      'red',
    );
    const ended = play(state, at(5, 2), at(3, 4));
    expect(ended.status).toBe('won');
    const move = {
      from: at(5, 2),
      to: at(3, 4),
      path: [at(5, 2), at(3, 4)],
      captures: [at(4, 3)],
      promote: false,
    };
    expect(apply(ended, move).error).toBe('game-over');
  });
});

describe('Draughts captures and kings', () => {
  it('makes captures mandatory', () => {
    const state = position(
      boardWith([
        [at(5, 2), 'r'],
        [at(4, 3), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([at(4, 3)]);
    expect(moves[0].path).toEqual([at(5, 2), at(3, 4)]);
  });

  it('continues a multi-jump until no more captures remain', () => {
    const state = position(
      boardWith([
        [at(6, 1), 'r'],
        [at(5, 2), 'w'],
        [at(3, 4), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].path).toEqual([at(6, 1), at(4, 3), at(2, 5)]);
    expect(moves[0].captures).toEqual([at(5, 2), at(3, 4)]);
  });

  it('crowns a man on the far row and ends the jump immediately', () => {
    const state = position(
      boardWith([
        [at(2, 3), 'r'],
        [at(1, 4), 'w'],
        [at(1, 6), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].promote).toBe(true);
    expect(moves[0].path).toEqual([at(2, 3), at(0, 5)]);
    expect(moves[0].captures).toEqual([at(1, 4)]);
    const after = apply(state, moves[0]).state;
    expect(after.board[at(0, 5)]).toBe('R');
  });

  it('lets a king continue the same jump backwards after crowning distance', () => {
    const state = position(
      boardWith([
        [at(2, 3), 'R'],
        [at(1, 4), 'w'],
        [at(1, 6), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].path).toEqual([at(2, 3), at(0, 5), at(2, 7)]);
    expect(moves[0].captures).toEqual([at(1, 4), at(1, 6)]);
    expect(moves[0].promote).toBe(false);
  });

  it('lets a king move one square in every diagonal direction', () => {
    const state = position(boardWith([[at(3, 3), 'R']]), 'red');
    const targets = legalMoves(state).map((move) => move.to).sort((a, b) => a - b);
    expect(targets).toEqual(
      [at(2, 2), at(2, 4), at(4, 2), at(4, 4)].sort((a, b) => a - b),
    );
  });

  it('lets a king capture backwards', () => {
    const state = position(
      boardWith([
        [at(4, 4), 'R'],
        [at(5, 5), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toBe(at(6, 6));
    expect(moves[0].captures).toEqual([at(5, 5)]);
  });

  it('promotes on a quiet move to the far row', () => {
    const state = position(boardWith([[at(1, 2), 'r']]), 'red');
    const moves = legalMoves(state);
    expect(moves).toHaveLength(2);
    expect(moves.every((move) => move.promote)).toBe(true);
    const after = apply(state, moves[0]).state;
    expect(after.board[moves[0].to]).toBe('R');
  });

  it('wins by capturing the last enemy piece', () => {
    const state = position(
      boardWith([
        [at(5, 2), 'r'],
        [at(4, 3), 'w'],
      ]),
      'red',
    );
    const after = play(state, at(5, 2), at(3, 4));
    expect(after.status).toBe('won');
    expect(after.winner).toBe('red');
    expect(after.winReason).toBe('all-captured');
    expect(countPieces(after.board, 'white')).toBe(0);
  });

  it('wins by leaving the opponent with no legal move', () => {
    const state = position(
      boardWith([
        [at(0, 1), 'w'],
        [at(1, 0), 'r'],
        [at(1, 2), 'r'],
        [at(2, 3), 'r'],
        [at(7, 0), 'r'],
      ]),
      'red',
    );
    const after = play(state, at(7, 0), at(6, 1));
    expect(after.status).toBe('won');
    expect(after.winner).toBe('red');
    expect(after.winReason).toBe('blocked');
  });
});

describe('Draughts draws and views', () => {
  it('draws on the 40-move king rule', () => {
    const state = position(
      boardWith([
        [at(7, 0), 'R'],
        [at(0, 7), 'W'],
      ]),
      'red',
      { quietPlies: 79 },
    );
    const after = play(state, at(7, 0), at(6, 1));
    expect(after.status).toBe('draw');
    expect(after.drawReason).toBe('forty-move');
  });

  it('draws on threefold repetition', () => {
    let state = position(
      boardWith([
        [at(7, 0), 'R'],
        [at(0, 7), 'W'],
      ]),
      'red',
    );
    for (let cycle = 0; cycle < 2; cycle++) {
      state = play(state, at(7, 0), at(6, 1));
      state = play(state, at(0, 7), at(1, 6));
      state = play(state, at(6, 1), at(7, 0));
      state = play(state, at(1, 6), at(0, 7));
    }
    expect(state.status).toBe('draw');
    expect(state.drawReason).toBe('repetition');
  });

  it('draws at the safety move limit', () => {
    const state = position(
      boardWith([
        [at(7, 0), 'R'],
        [at(0, 7), 'W'],
      ]),
      'red',
      { plies: 299 },
    );
    const after = play(state, at(7, 0), at(6, 1));
    expect(after.status).toBe('draw');
    expect(after.drawReason).toBe('limit');
  });

  it('gives each seat its own canMove flag and the same public board', () => {
    const state = setup();
    const red = view(state, 0);
    const white = view(state, 1);
    expect(red.side).toBe('red');
    expect(white.side).toBe('white');
    expect(red.canMove).toBe(true);
    expect(white.canMove).toBe(false);
    expect(red.legalMoves).toHaveLength(7);
    expect(white.legalMoves).toHaveLength(0);
    expect(red.board).toEqual(white.board);
    const after = play(state, at(5, 2), at(4, 1));
    expect(view(after, 1).canMove).toBe(true);
    expect(view(after, 0).canMove).toBe(false);
  });

  it('keeps legal move order deterministic', () => {
    const state = setup();
    expect(legalMoves(state).map(moveName)).toEqual(legalMoves(state).map(moveName));
  });
});

describe('Draughts AI', () => {
  it('returns only legal moves at every level', () => {
    const state = setup();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const move = chooseMove(state, level, seeded(9));
      expect(move).not.toBeNull();
      expect(legalMoves(state).some((candidate) => moveName(candidate) === moveName(move!))).toBe(
        true,
      );
    }
  });

  it('takes an immediate winning capture on every level', () => {
    const state = position(
      boardWith([
        [at(5, 2), 'r'],
        [at(4, 3), 'w'],
      ]),
      'red',
    );
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      expect(moveName(chooseMove(state, level, () => 0.5)!)).toBe('c3xe5');
    }
  });

  it('keeps Companion gentle by preferring the smaller capture', () => {
    const state = position(
      boardWith([
        [at(6, 1), 'r'],
        [at(5, 0), 'r'],
        [at(5, 2), 'w'],
        [at(4, 1), 'w'],
        [at(3, 4), 'w'],
      ]),
      'red',
    );
    const moves = legalMoves(state);
    expect(Math.max(...moves.map((move) => move.captures.length))).toBe(2);
    const companion = chooseMove(state, 'companion', () => 0.1)!;
    const hard = chooseMove(state, 'hard', () => 0.1)!;
    expect(companion.captures).toHaveLength(1);
    expect(hard.captures).toHaveLength(2);
  });

  it('is deterministic for a fixed RNG', () => {
    const state = setup();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const first = chooseMove(state, level, seeded(27))!;
      const second = chooseMove(state, level, seeded(27))!;
      expect(moveName(first)).toBe(moveName(second));
    }
  });

  it('returns a translatable hint reason for every choice', () => {
    const state = setup();
    const choice = chooseWithReason(state, 'hard', () => 0.4);
    expect(choice).not.toBeNull();
    expect([
      'win',
      'multi-capture',
      'capture',
      'promote',
      'block',
      'king-safety',
      'develop',
    ]).toContain(choice!.reason);
    expect(reasonFor(state, choice!.move)).toBe(choice!.reason);
  });

  it('values material and kings for the side being scored', () => {
    const redKing = position(boardWith([[at(3, 3), 'R']]), 'red');
    const redMan = position(boardWith([[at(3, 3), 'r']]), 'red');
    expect(evaluate(redKing, 'red')).toBeGreaterThan(evaluate(redMan, 'red'));
    expect(evaluate(redKing, 'red')).toBeGreaterThan(0);
    expect(evaluate(redKing, 'white')).toBeLessThan(0);
  });

  it('plays a complete deterministic self-play game and reaches a result', () => {
    let state = setup();
    const rng = seeded(1234);
    let guard = 0;
    while (state.status === 'playing' && guard < 320) {
      const move = chooseMove(state, 'easy', rng);
      expect(move).not.toBeNull();
      const result = apply(state, move!);
      expect(result.ok).toBe(true);
      state = result.state;
      guard += 1;
    }
    expect(state.status).not.toBe('playing');
    expect(guard).toBeLessThanOrEqual(300);
    expect(state.plies).toBe(guard);
  });
});
