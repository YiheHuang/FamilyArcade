import { describe, expect, it } from 'vitest';
import { chooseHint, chooseMove } from '../src/ai/ai';
import {
  apply,
  applySeat,
  coord,
  counts,
  finalResult,
  flipsFrom,
  legalMoves,
  other,
  setup,
  view,
  type Cell,
  type Disc,
  type GameState,
} from '../src/game/flip';

function play(moves: number[]): GameState {
  let state = setup('B');
  for (const move of moves) {
    const result = apply(state, move);
    if (!result.ok) throw new Error(`fixture move ${move} failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

function synthetic(board: Cell[], turn: Disc = 'B'): GameState {
  return {
    board,
    turn,
    status: 'playing',
    winner: null,
    lastMove: null,
    passed: false,
    moves: [],
    first: 'B',
  };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('Flip engine — starting position and turns', () => {
  it('starts with 64 cells and the standard four-disc centre', () => {
    const state = setup('B');
    expect(state.board).toHaveLength(64);
    expect(counts(state.board)).toEqual({ B: 2, W: 2 });
    expect(state.board[27]).toBe('W');
    expect(state.board[28]).toBe('B');
    expect(state.board[35]).toBe('B');
    expect(state.board[36]).toBe('W');
    expect(state.turn).toBe('B');
    expect(state.status).toBe('playing');
    expect(state.lastMove).toBeNull();
    expect(state.moves).toHaveLength(0);
    expect(state.passed).toBe(false);
  });

  it('offers exactly the four diagonal opening brackets to Black', () => {
    expect(legalMoves(setup('B'))).toEqual([19, 26, 37, 44]);
  });

  it('places a disc, flips one disc and hands the turn to White', () => {
    const result = apply(setup('B'), 19);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.flips).toEqual([27]);
    expect(result.state.board[19]).toBe('B');
    expect(result.state.board[27]).toBe('B');
    expect(counts(result.state.board)).toEqual({ B: 4, W: 1 });
    expect(result.state.turn).toBe('W');
    expect(result.state.lastMove).toBe(19);
    expect(result.state.moves).toEqual([19]);
    expect(result.state.passed).toBe(false);
  });

  it('rejects occupied squares, off-board indices and moves that flip nothing', () => {
    const after = apply(setup('B'), 19).state;
    expect(apply(after, 19).error).toBe('occupied');
    expect(apply(after, -1).error).toBe('bad-cell');
    expect(apply(after, 64).error).toBe('bad-cell');
    expect(apply(after, 0).error).toBe('illegal');
    expect(apply(after, 63).error).toBe('illegal');
  });

  it('does not mutate the input state or its board', () => {
    const state = setup('B');
    const before = state.board.slice();
    const result = apply(state, 19);
    expect(result.ok).toBe(true);
    expect(state.board).toEqual(before);
    expect(state.moves).toEqual([]);
    expect(state.lastMove).toBeNull();
    expect(result.state.board).not.toBe(state.board);
  });

  it('supports White moving first when explicitly requested', () => {
    const state = setup('W');
    expect(state.turn).toBe('W');
    expect(state.first).toBe('W');
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(state.board[move]).toBeNull();
      expect(flipsFrom(state.board, move, 'W').length).toBeGreaterThan(0);
    }
  });

  it('maps board indices to readable coordinates', () => {
    expect(coord(0)).toBe('A1');
    expect(coord(7)).toBe('H1');
    expect(coord(27)).toBe('D4');
    expect(coord(63)).toBe('H8');
    expect(coord(-1)).toBe('');
    expect(coord(64)).toBe('');
  });

  it('toggles the other colour', () => {
    expect(other('B')).toBe('W');
    expect(other('W')).toBe('B');
  });
});

describe('Flip engine — flipping rules', () => {
  it('flips in all eight directions from one square', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    const pairs: Array<[number, number]> = [
      [18, 9],
      [19, 11],
      [20, 13],
      [26, 25],
      [28, 29],
      [34, 41],
      [35, 43],
      [36, 45],
    ];
    for (const [white, black] of pairs) {
      board[white] = 'W';
      board[black] = 'B';
    }
    expect([...flipsFrom(board, 27, 'B')].sort((a, b) => a - b)).toEqual([
      18, 19, 20, 26, 28, 34, 35, 36,
    ]);
  });

  it('flips a contiguous line and stops at the first own disc', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[1] = 'W';
    board[2] = 'W';
    board[3] = 'B';
    expect(flipsFrom(board, 0, 'B')).toEqual([1, 2]);
    board[2] = null;
    expect(flipsFrom(board, 0, 'B')).toEqual([]);
    board[2] = 'B';
    expect(flipsFrom(board, 0, 'B')).toEqual([1]);
  });

  it('rejects a bracket with a hole and accepts an occupied square as a source', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[1] = 'W';
    board[3] = 'B';
    expect(flipsFrom(board, 0, 'B')).toEqual([]);
    board[2] = 'W';
    expect(flipsFrom(board, 0, 'B')).toEqual([1, 2]);
    board[0] = 'W';
    expect(flipsFrom(board, 0, 'B')).toEqual([]);
  });

  it('only lists legal moves, all of them empty and bracketing', () => {
    const state = play([37, 29, 20, 45, 38]);
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(state.board[move]).toBeNull();
      expect(flipsFrom(state.board, move, state.turn).length).toBeGreaterThan(0);
    }
  });
});

describe('Flip engine — passes, endings and draws', () => {
  it('passes the turn back when the opponent has no legal reply', () => {
    const board: Cell[] = Array<Cell>(64).fill('B');
    board[0] = null;
    board[8] = null;
    board[1] = 'W';
    board[9] = 'W';
    board[16] = 'W';
    board[17] = 'W';
    const state = synthetic(board, 'B');

    const result = apply(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('playing');
    expect(result.state.passed).toBe(true);
    expect(result.state.turn).toBe('B');
    expect(legalMoves(result.state)).toEqual([8]);
  });

  it('ends the game when neither player can move after a pass', () => {
    const board: Cell[] = Array<Cell>(64).fill('B');
    board[0] = null;
    board[8] = null;
    board[1] = 'W';
    board[9] = 'W';
    board[16] = 'W';
    board[17] = 'W';
    const first = apply(synthetic(board, 'B'), 0);
    expect(first.ok).toBe(true);
    const second = apply(first.state, 8);
    expect(second.ok).toBe(true);
    expect(second.state.status).toBe('won');
    expect(second.state.winner).toBe('B');
    expect(second.state.passed).toBe(false);
    expect(apply(second.state, 0).error).toBe('game-over');
  });

  it('calls a tied board a draw', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    for (let index = 0; index < 64; index += 1) board[index] = index < 32 ? 'B' : 'W';
    expect(finalResult(board)).toEqual({ status: 'draw', winner: null });
    board[63] = 'B';
    expect(finalResult(board)).toEqual({ status: 'won', winner: 'B' });
  });

  it('completes a full random playout with a consistent result', () => {
    const rng = lcg(42);
    let state = setup('B');
    let guard = 0;
    while (state.status === 'playing' && guard < 200) {
      const moves = legalMoves(state);
      expect(moves.length).toBeGreaterThan(0);
      const move = moves[Math.floor(rng() * moves.length)];
      const result = apply(state, move);
      expect(result.ok).toBe(true);
      state = result.state;
      guard += 1;
    }
    expect(state.status).not.toBe('playing');
    expect(guard).toBeLessThanOrEqual(64);
    expect(state.moves).toHaveLength(guard);
    const score = counts(state.board);
    expect(score.B + score.W).toBeLessThanOrEqual(64);
    if (state.status === 'won') {
      expect(state.winner).toBe(score.B > score.W ? 'B' : 'W');
    } else {
      expect(score.B).toBe(score.W);
    }
  });
});

describe('Flip engine — seats and views', () => {
  it('gives seat 0 Black and seat 1 White', () => {
    const state = play([19]);
    const black = view(state, 0);
    const white = view(state, 1);
    expect(black.mark).toBe('B');
    expect(black.seat).toBe(0);
    expect(black.canMove).toBe(false);
    expect(white.mark).toBe('W');
    expect(white.seat).toBe(1);
    expect(white.canMove).toBe(true);
  });

  it('describes counts, legal moves, last move and move count in a view', () => {
    const state = play([19]);
    const white = view(state, 1);
    expect(white.counts).toEqual({ B: 4, W: 1 });
    expect(white.turn).toBe('W');
    expect(white.status).toBe('playing');
    expect(white.winner).toBeNull();
    expect(white.lastMove).toBe(19);
    expect(white.moveCount).toBe(1);
    expect(white.legal).toEqual(legalMoves(state));
    expect(white.passed).toBe(false);
  });

  it('returns a board copy so a guest cannot mutate the host view', () => {
    const state = play([19]);
    const ipad = view(state, 1);
    ipad.board[0] = 'B';
    expect(state.board[0]).toBeNull();
  });

  it('enforces the seat mark and the turn', () => {
    const opening = setup('B');
    expect(applySeat(opening, 1, 19).error).toBe('wrong-turn');
    expect(applySeat(opening, 7, 19).error).toBe('wrong-turn');
    const blackMove = applySeat(opening, 0, 19);
    expect(blackMove.ok).toBe(true);
    const whiteMove = legalMoves(blackMove.state)[0];
    expect(applySeat(blackMove.state, 1, whiteMove).ok).toBe(true);
  });
});

describe('Flip AI — four levels', () => {
  const opening = setup('B');

  it('always returns a legal move at every level', () => {
    const state = play([37, 29, 20, 45, 38]);
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, lcg(7));
      expect(legal).toContain(move);
    }
  });

  it('returns -1 when the player to move has no legal move', () => {
    const board: Cell[] = Array<Cell>(64).fill('B');
    const stuck = synthetic(board, 'W');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseMove(stuck, level, lcg(1))).toBe(-1);
    }
  });

  it('is deterministic for a fixed RNG on every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const first = chooseMove(opening, level, lcg(123));
      const second = chooseMove(opening, level, lcg(123));
      expect(first).toBe(second);
    }
  });

  it('Companion leaves extra corners for the child early in the game', () => {
    const board: Cell[] = Array<Cell>(64).fill('B');
    board[1] = null;
    board[56] = null;
    board[63] = null;
    board[2] = 'W';
    board[57] = 'W';
    board[62] = 'W';
    const state = synthetic(board, 'B');
    expect(legalMoves(state)).toEqual([1, 56, 63]);
    expect(chooseMove(state, 'companion', () => 0.9)).toBe(1);
  });

  it('Hard prefers a corner when corners are available', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[61] = 'B';
    board[62] = 'W';
    board[53] = 'B';
    board[54] = 'W';
    const state = synthetic(board, 'B');
    expect(legalMoves(state)).toContain(63);
    expect(chooseMove(state, 'hard', () => 0.5)).toBe(63);
  });

  it('hints with a real reason and honest numbers', () => {
    const hint = chooseHint(opening);
    expect(hint).not.toBeNull();
    expect(legalMoves(opening)).toContain(hint?.move);
    expect(['corner', 'safe', 'flips', 'mobility', 'best']).toContain(hint?.reason);
    expect(hint?.flips).toBeGreaterThan(0);
    expect(hint?.ownMoves).toBeGreaterThanOrEqual(0);
    expect(hint?.oppMoves).toBeGreaterThanOrEqual(0);
  });

  it('explains a corner hint as a corner', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[61] = 'B';
    board[62] = 'W';
    board[53] = 'B';
    board[54] = 'W';
    const hint = chooseHint(synthetic(board, 'B'));
    expect(hint?.reason).toBe('corner');
    expect(hint?.move).toBe(63);
  });

  it('finishes an AI-vs-AI game without stalling', () => {
    const rng = lcg(99);
    let state = setup('B');
    let guard = 0;
    while (state.status === 'playing' && guard < 200) {
      const move = chooseMove(state, 'easy', rng);
      expect(move).toBeGreaterThanOrEqual(0);
      const result = apply(state, move);
      expect(result.ok).toBe(true);
      state = result.state;
      guard += 1;
    }
    expect(state.status).not.toBe('playing');
    expect(state.moves.length).toBeLessThanOrEqual(64);
    expect(state.moves.length).toBe(guard);
  });
});
