import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  advance,
  apply,
  applyPath,
  applySeat,
  countKings,
  countPieces,
  emptyBoard,
  indexOf,
  isDark,
  isMove,
  legalMoves,
  position,
  sameMove,
  setup,
  view,
  type GameState,
  type Piece,
  type Side,
} from '../src/game/intl-draughts';

const sq = (row: number, col: number) => indexOf(row, col);

function boardWith(pieces: Array<[number, Piece]>): (Piece | null)[] {
  const board = emptyBoard();
  for (const [square, piece] of pieces) board[square] = piece;
  return board;
}

function pos(
  turn: Side,
  pieces: Array<[number, Piece]>,
  options: Parameters<typeof position>[2] = {},
): GameState {
  return position(boardWith(pieces), turn, options);
}

function playPaths(state: GameState, paths: Array<[number, number[]]>) {
  let current = state;
  for (const [from, path] of paths) {
    const result = applyPath(current, from, path);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

describe('International Draughts board and opening', () => {
  it('sets up 20 men each on 50 dark squares and White moves first', () => {
    const state = setup();
    const dark = state.board.filter((_, index) => {
      const row = Math.floor(index / 10);
      const col = index % 10;
      return isDark(row, col);
    });
    expect(state.board).toHaveLength(100);
    expect(dark).toHaveLength(50);
    expect(countPieces(state.board, 'W')).toBe(20);
    expect(countPieces(state.board, 'B')).toBe(20);
    expect(state.turn).toBe('W');
    expect(state.status).toBe('playing');
    expect(state.board.slice(0, 40).filter(Boolean)).toHaveLength(20);
    expect(state.board.slice(60).filter(Boolean)).toHaveLength(20);
  });

  it('offers the nine standard White opening moves', () => {
    const moves = legalMoves(setup());
    expect(moves).toHaveLength(9);
    expect(moves.every((move) => move.captures.length === 0)).toBe(true);
    expect(moves.every((move) => move.path[0] >= 60 && move.path[0] <= 69)).toBe(true);
  });

  it('does not let men move backwards without capturing', () => {
    const state = pos('W', [[sq(6, 1), 'w'], [sq(8, 3), 'b']]);
    const moves = legalMoves(state);
    expect(moves.some((move) => move.to === sq(5, 0))).toBe(true);
    expect(moves.some((move) => move.to === sq(7, 0))).toBe(false);
    expect(moves.some((move) => move.to === sq(7, 2))).toBe(false);
  });
});

describe('mandatory captures and the maximum rule', () => {
  it('forces a capture when a quiet move is also available', () => {
    const state = pos('W', [
      [sq(4, 1), 'w'],
      [sq(3, 2), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([sq(3, 2)]);
    expect(moves[0].path).toEqual([sq(4, 1), sq(2, 3)]);
    expect(applyPath(state, sq(4, 1), [sq(3, 0)]).error).toBe('must-capture');
  });

  it('keeps only capture sequences with the maximum number of pieces', () => {
    const state = pos('W', [
      [sq(6, 1), 'w'],
      [sq(8, 7), 'w'],
      [sq(5, 2), 'b'],
      [sq(3, 4), 'b'],
      [sq(7, 8), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(2);
    expect(moves[0].path).toEqual([sq(6, 1), sq(4, 3), sq(2, 5)]);
  });

  it('keeps every equal-length maximum capture as a legal choice', () => {
    const state = pos('W', [
      [sq(6, 1), 'w'],
      [sq(8, 7), 'w'],
      [sq(5, 2), 'b'],
      [sq(7, 8), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(2);
    expect(moves.every((move) => move.captures.length === 1)).toBe(true);
  });

  it('lets men capture backwards as well as forwards', () => {
    const state = pos('W', [
      [sq(5, 2), 'w'],
      [sq(6, 3), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([sq(6, 3)]);
    expect(moves[0].path).toEqual([sq(5, 2), sq(7, 4)]);
  });

  it('plays a three-piece chain and never captures a square twice', () => {
    const state = pos('W', [
      [sq(6, 1), 'w'],
      [sq(5, 2), 'b'],
      [sq(3, 4), 'b'],
      [sq(1, 6), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(3);
    expect(new Set(moves[0].captures).size).toBe(3);
    const after = advance(state, moves[0]);
    expect(countPieces(after.board, 'B')).toBe(0);
    expect(after.status).toBe('won');
    expect(after.winReason).toBe('all-captured');
  });
});

describe('flying kings', () => {
  it('flies any distance along an empty diagonal', () => {
    const state = pos('W', [[sq(9, 0), 'W']]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(9);
    expect(moves.map((move) => move.to).sort((a, b) => a - b)).toEqual(
      [9, 18, 27, 36, 45, 54, 63, 72, 81].sort((a, b) => a - b),
    );
    expect(moves.every((move) => move.captures.length === 0)).toBe(true);
  });

  it('captures a distant piece and may land on any empty square beyond it', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(5);
    expect(moves.every((move) => move.captures.length === 1)).toBe(true);
    expect(moves.every((move) => move.captures[0] === sq(5, 4))).toBe(true);
    expect(moves.map((move) => move.to).sort((a, b) => a - b)).toEqual(
      [sq(4, 5), sq(3, 6), sq(2, 7), sq(1, 8), sq(0, 9)].sort((a, b) => a - b),
    );
  });

  it('turns a corner during a flying-king multi-capture', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
      [sq(5, 6), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(3);
    expect(moves.every((move) => move.captures.length === 2)).toBe(true);
    expect(moves.every((move) => move.captures[0] === sq(5, 4) && move.captures[1] === sq(5, 6))).toBe(true);
    expect(moves[0].path.slice(0, 3)).toEqual([sq(9, 0), sq(4, 5), sq(6, 7)]);
    expect(moves.map((move) => move.to).sort((a, b) => a - b)).toEqual(
      [sq(6, 7), sq(7, 8), sq(8, 9)].sort((a, b) => a - b),
    );
  });

  it('cannot capture a piece when another piece leaves no landing square', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
      [sq(4, 5), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves.every((move) => move.captures.length === 0)).toBe(true);
    const kingMoves = moves.filter((move) => move.from === sq(9, 0));
    expect(kingMoves.map((move) => move.to).sort((a, b) => a - b)).toEqual(
      [sq(8, 1), sq(7, 2), sq(6, 3)].sort((a, b) => a - b),
    );
  });

  it('cannot jump over its own piece to reach a piece behind it', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'w'],
    ]);
    const moves = legalMoves(state);
    expect(moves.every((move) => move.captures.length === 0)).toBe(true);
    const kingMoves = moves.filter((move) => move.from === sq(9, 0));
    expect(kingMoves.map((move) => move.to).sort((a, b) => a - b)).toEqual(
      [sq(8, 1), sq(7, 2), sq(6, 3)].sort((a, b) => a - b),
    );
    expect(moves.some((move) => move.to === sq(5, 4))).toBe(false);
  });
});

describe('promotion and move application', () => {
  it('crowns a man that finishes a quiet move on the far row', () => {
    const state = pos('W', [
      [sq(1, 2), 'w'],
      [sq(5, 0), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(2);
    expect(moves.every((move) => move.promote)).toBe(true);
    const result = applyPath(state, sq(1, 2), [sq(0, 1)]);
    expect(result.ok).toBe(true);
    expect(result.state.board[sq(0, 1)]).toBe('W');
    expect(result.state.turn).toBe('B');
    expect(result.state.status).toBe('playing');
  });

  it('does not crown a man that only passes through the far row during a capture', () => {
    const state = pos('W', [
      [sq(2, 1), 'w'],
      [sq(1, 2), 'b'],
      [sq(1, 4), 'b'],
      [sq(8, 1), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(2);
    expect(moves[0].promote).toBe(false);
    const result = applyPath(state, sq(2, 1), [sq(0, 3), sq(2, 5)]);
    expect(result.ok).toBe(true);
    expect(result.state.board[sq(2, 5)]).toBe('w');
    expect(result.state.status).toBe('playing');
  });

  it('crowns a man that ends a capture on the far row', () => {
    const state = pos('W', [
      [sq(2, 1), 'w'],
      [sq(1, 2), 'b'],
      [sq(8, 1), 'b'],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].promote).toBe(true);
    const result = applyPath(state, sq(2, 1), [sq(0, 3)]);
    expect(result.ok).toBe(true);
    expect(result.state.board[sq(0, 3)]).toBe('W');
    expect(result.state.turn).toBe('B');
  });

  it('applies a full legal Move object and rejects a stale one', () => {
    const state = setup();
    const move = legalMoves(state)[0];
    expect(isMove(move)).toBe(true);
    const result = apply(state, move);
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe('B');
    expect(apply(result.state, move).error).toBe('illegal');
    expect(apply(state, { ...move, to: 0 }).error).toBe('illegal');
    const finish = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const won = applyPath(finish, sq(9, 0), [sq(4, 5)]).state;
    expect(apply(won, move).error).toBe('game-over');
  });

  it('reports incomplete and illegal capture paths', () => {
    const chain = pos('W', [
      [sq(6, 1), 'w'],
      [sq(5, 2), 'b'],
      [sq(3, 4), 'b'],
    ]);
    expect(applyPath(chain, sq(6, 1), [sq(4, 3)]).error).toBe('incomplete');
    expect(applyPath(chain, sq(6, 1), [sq(5, 0)]).error).toBe('must-capture');
    expect(applyPath(chain, sq(6, 1), [sq(4, 3), sq(2, 5), sq(0, 7)]).error).toBe('illegal');
  });

  it('enforces the seat colour and the turn on the host', () => {
    const state = setup();
    expect(applySeat(state, 1, sq(6, 1), [sq(5, 0)]).error).toBe('wrong-turn');
    const first = applySeat(state, 0, sq(6, 1), [sq(5, 0)]);
    expect(first.ok).toBe(true);
    expect(applySeat(first.state, 1, sq(3, 0), [sq(4, 1)]).ok).toBe(true);
    expect(applySeat(first.state, 0, sq(3, 0), [sq(4, 1)]).error).toBe('wrong-turn');
  });

  it('rejects an empty from square, an out-of-range square and a finished game', () => {
    const state = setup();
    expect(applyPath(state, 0, [1]).error).toBe('wrong-piece');
    expect(applyPath(state, 100, []).error).toBe('bad-from');
    expect(applyPath(state, sq(6, 1), [sq(0, 1)]).error).toBe('illegal');
    const finish = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const won = applyPath(finish, sq(9, 0), [sq(4, 5)]);
    expect(won.ok).toBe(true);
    expect(won.state.status).toBe('won');
    expect(applyPath(won.state, sq(9, 0), [sq(8, 1)]).error).toBe('game-over');
  });
});

describe('wins, draws and seat views', () => {
  it('wins by capturing every opposing piece', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const result = applyPath(state, sq(9, 0), [sq(4, 5)]);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('W');
    expect(result.state.winReason).toBe('all-captured');
    expect(result.state.turn).toBe('B');
  });

  it('wins by blocking an opponent that still has pieces', () => {
    const state = pos('W', [
      [sq(6, 1), 'w'],
      [sq(9, 0), 'b'],
    ]);
    const result = applyPath(state, sq(6, 1), [sq(5, 0)]);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('W');
    expect(result.state.winReason).toBe('blocked');
    expect(countPieces(result.state.board, 'B')).toBe(1);
  });

  it('draws after 25 moves each without a capture or a man move', () => {
    const state = pos(
      'W',
      [
        [sq(9, 0), 'W'],
        [sq(0, 1), 'B'],
      ],
      { quietPlies: 49 },
    );
    const result = applyPath(state, sq(9, 0), [sq(8, 1)]);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.drawReason).toBe('quiet');
    expect(result.state.quietPlies).toBe(50);
  });

  it('resets the quiet counter on a man move and on a capture', () => {
    const man = pos(
      'W',
      [
        [sq(6, 1), 'w'],
        [sq(8, 1), 'b'],
      ],
      { quietPlies: 20 },
    );
    const moved = applyPath(man, sq(6, 1), [sq(5, 0)]);
    expect(moved.ok).toBe(true);
    expect(moved.state.quietPlies).toBe(0);
    const capture = pos(
      'W',
      [
        [sq(9, 0), 'W'],
        [sq(5, 4), 'b'],
      ],
      { quietPlies: 20 },
    );
    const captured = applyPath(capture, sq(9, 0), [sq(4, 5)]);
    expect(captured.ok).toBe(true);
    expect(captured.state.quietPlies).toBe(0);
  });

  it('draws on threefold repetition', () => {
    let state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(0, 1), 'B'],
    ]);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      state = playPaths(state, [
        [sq(9, 0), [sq(8, 1)]],
        [sq(0, 1), [sq(1, 0)]],
        [sq(8, 1), [sq(9, 0)]],
        [sq(1, 0), [sq(0, 1)]],
      ]);
      expect(['playing', 'draw']).toContain(state.status);
    }
    expect(state.status).toBe('draw');
    expect(state.drawReason).toBe('repetition');
  });

  it('draws at the 500-ply ceiling', () => {
    const state = pos(
      'W',
      [
        [sq(9, 0), 'W'],
        [sq(0, 1), 'B'],
      ],
      { plies: 499 },
    );
    const result = applyPath(state, sq(9, 0), [sq(8, 1)]);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.drawReason).toBe('limit');
  });

  it('gives seat 1 a public view with its own legal moves and a cloned board', () => {
    const state = applyPath(setup(), sq(6, 1), [sq(5, 0)]).state;
    const black = view(state, 1);
    expect(black.side).toBe('B');
    expect(black.canMove).toBe(true);
    expect(black.legalMoves.length).toBeGreaterThan(0);
    expect(black.board).toHaveLength(100);
    expect(black.lastMove?.path).toEqual([sq(6, 1), sq(5, 0)]);
    const white = view(state, 0);
    expect(white.canMove).toBe(false);
    expect(white.legalMoves).toHaveLength(0);
    black.board[sq(6, 1)] = 'w';
    expect(state.board[sq(6, 1)]).toBeNull();
  });

  it('counts kings separately from men', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(8, 1), 'w'],
      [sq(0, 1), 'B'],
      [sq(1, 0), 'b'],
    ]);
    expect(countPieces(state.board, 'W')).toBe(2);
    expect(countKings(state.board, 'W')).toBe(1);
    expect(countKings(state.board, 'B')).toBe(1);
  });

  it('plays a full deterministic game from the opening to a terminal result', () => {
    let state = setup();
    let seed = 0x1a2b3c4d;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    while (state.status === 'playing' && state.plies < 500) {
      const moves = legalMoves(state);
      expect(moves.length).toBeGreaterThan(0);
      const move = moves[Math.floor(rng() * moves.length)] ?? moves[0];
      const result = apply(state, move);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(['won', 'draw']).toContain(state.status);
    expect(state.plies).toBeGreaterThan(20);
    expect(state.lastMove).not.toBeNull();
  });
});

describe('four AI levels and hints', () => {
  it('returns a legal move for every level', () => {
    const state = pos('W', [
      [sq(4, 1), 'w'],
      [sq(4, 5), 'w'],
      [sq(7, 1), 'b'],
      [sq(3, 2), 'b'],
      [sq(5, 6), 'b'],
    ]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.4);
      expect(move).not.toBeNull();
      expect(legalMoves(state).some((candidate) => sameMove(candidate, move!))).toBe(true);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = pos('W', [
      [sq(4, 1), 'w'],
      [sq(4, 5), 'w'],
      [sq(7, 1), 'b'],
      [sq(3, 2), 'b'],
    ]);
    const first = chooseMove(state, 'normal', () => 0.35);
    const second = chooseMove(state, 'normal', () => 0.35);
    expect(first && second && sameMove(first, second)).toBe(true);
  });

  it('takes an immediate win on the hard level', () => {
    const state = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const move = chooseMove(state, 'hard', () => 0.2);
    expect(move).not.toBeNull();
    const next = advance(state, move!);
    expect(next.status).toBe('won');
    expect(next.winner).toBe('W');
  });

  it('explains a long mandatory capture in the hint', () => {
    const state = pos('W', [
      [sq(6, 1), 'w'],
      [sq(5, 2), 'b'],
      [sq(3, 4), 'b'],
      [sq(1, 6), 'b'],
      [sq(8, 1), 'b'],
    ]);
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(hint?.kind).toBe('capture');
    expect(hint?.count).toBe(3);
    expect(legalMoves(state).some((move) => sameMove(move, hint!.move))).toBe(true);
  });

  it('explains a promotion hint and returns no hint after the game', () => {
    const state = pos('W', [
      [sq(1, 2), 'w'],
      [sq(8, 1), 'b'],
    ]);
    const hint = hintFor(state);
    expect(hint?.kind).toBe('promotion');
    const finished = pos('W', [
      [sq(9, 0), 'W'],
      [sq(5, 4), 'b'],
    ]);
    const won = applyPath(finished, sq(9, 0), [sq(4, 5)]).state;
    expect(hintFor(won)).toBeNull();
  });
});
