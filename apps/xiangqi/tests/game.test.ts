import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  applyMove,
  applySeat,
  generalIndex,
  isInCheck,
  legalMovesForBoard,
  legalMovesFromBoard,
  positionKey,
  setup,
  view,
  type Cell,
  type GameState,
  type PieceType,
  type Side,
} from '../src/game/xiangqi';
import { addResult, EMPTY_RECORD, normalizeRecord } from '../src/storage';

const at = (row: number, col: number) => row * 9 + col;
const moveTo = (moves: { from: number; to: number }[], from: number, to: number) =>
  moves.some((move) => move.from === from && move.to === to);

function blank(): Cell[] {
  return Array<Cell>(90).fill(null);
}

function put(board: Cell[], row: number, col: number, side: Side, type: PieceType): Cell[] {
  board[at(row, col)] = { side, type };
  return board;
}

function stateWith(
  board: Cell[],
  turn: Side = 'R',
  extra: Partial<GameState> = {},
): GameState {
  return {
    board,
    turn,
    status: 'playing',
    winner: null,
    reason: null,
    moves: [],
    check: isInCheck(board, turn),
    halfmoveClock: 0,
    positionCounts: { [positionKey(board, turn)]: 1 },
    ...extra,
  };
}

/** Kings with a blocker on file 4 so they are not facing. */
function kings(blockerRow = 5): Cell[] {
  const board = blank();
  put(board, 9, 4, 'R', 'G');
  put(board, 0, 4, 'B', 'G');
  put(board, blockerRow, 4, 'R', 'S');
  return board;
}

describe('Xiangqi starting position', () => {
  it('has ninety points and the full 32-piece setup', () => {
    const state = setup('R');
    expect(state.board).toHaveLength(90);
    expect(state.board.filter(Boolean)).toHaveLength(32);
    expect(state.board.filter((cell) => cell?.side === 'R')).toHaveLength(16);
    expect(state.board.filter((cell) => cell?.side === 'B')).toHaveLength(16);
    expect(state.turn).toBe('R');
    expect(state.check).toBe(false);
    expect(generalIndex(state.board, 'R')).toBe(at(9, 4));
    expect(generalIndex(state.board, 'B')).toBe(at(0, 4));
    expect(state.board[at(7, 1)]).toEqual({ side: 'R', type: 'C' });
    expect(state.board[at(3, 0)]).toEqual({ side: 'B', type: 'S' });
  });

  it('has legal opening moves and does not mutate the setup', () => {
    const state = setup('R');
    const snapshot = JSON.stringify(state);
    const moves = legalMovesForBoard(state.board, 'R');
    expect(moves.length).toBeGreaterThanOrEqual(40);
    expect(moveTo(moves, at(9, 1), at(7, 2))).toBe(true);
    expect(moveTo(moves, at(6, 0), at(5, 0))).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('Xiangqi piece rules', () => {
  it('keeps the general inside the palace', () => {
    const board = kings();
    board[at(9, 4)] = null;
    put(board, 8, 4, 'R', 'G');
    const moves = legalMovesFromBoard(board, 'R', at(8, 4));
    expect(moves).toHaveLength(4);
    expect(moveTo(moves, at(8, 4), at(7, 4))).toBe(true);
    expect(moveTo(moves, at(8, 4), at(8, 3))).toBe(true);
    expect(moveTo(moves, at(8, 4), at(6, 4))).toBe(false);

    const corner = kings();
    corner[at(9, 4)] = null;
    put(corner, 7, 3, 'R', 'G');
    const cornerMoves = legalMovesFromBoard(corner, 'R', at(7, 3));
    expect(cornerMoves).toHaveLength(2);
  });

  it('lets advisors move one diagonal step inside the palace', () => {
    const board = kings();
    put(board, 8, 4, 'R', 'A');
    const moves = legalMovesFromBoard(board, 'R', at(8, 4));
    expect(moves).toHaveLength(4);
    expect(moveTo(moves, at(8, 4), at(7, 3))).toBe(true);
    expect(moveTo(moves, at(8, 4), at(9, 5))).toBe(true);
    expect(moveTo(moves, at(8, 4), at(8, 5))).toBe(false);
  });

  it('moves elephants two diagonals and never across the river', () => {
    const board = kings();
    put(board, 5, 2, 'R', 'E');
    const moves = legalMovesFromBoard(board, 'R', at(5, 2));
    expect(moveTo(moves, at(5, 2), at(7, 0))).toBe(true);
    expect(moveTo(moves, at(5, 2), at(7, 4))).toBe(true);
    expect(moveTo(moves, at(5, 2), at(3, 0))).toBe(false);
    expect(moveTo(moves, at(5, 2), at(3, 4))).toBe(false);
  });

  it('blocks an elephant at its eye', () => {
    const board = kings();
    put(board, 5, 2, 'R', 'E');
    put(board, 6, 1, 'B', 'S');
    const moves = legalMovesFromBoard(board, 'R', at(5, 2));
    expect(moveTo(moves, at(5, 2), at(7, 0))).toBe(false);
    expect(moveTo(moves, at(5, 2), at(7, 4))).toBe(true);
  });

  it('moves the horse in an L and blocks its leg', () => {
    const board = kings();
    put(board, 7, 4, 'R', 'H');
    put(board, 6, 4, 'R', 'S');
    const moves = legalMovesFromBoard(board, 'R', at(7, 4));
    expect(moves).toHaveLength(6);
    expect(moveTo(moves, at(7, 4), at(5, 3))).toBe(false);
    expect(moveTo(moves, at(7, 4), at(5, 5))).toBe(false);
    expect(moveTo(moves, at(7, 4), at(9, 3))).toBe(true);
  });

  it('slides rooks until a piece blocks the file or rank', () => {
    const board = kings();
    put(board, 5, 0, 'R', 'R');
    put(board, 5, 3, 'B', 'S');
    const moves = legalMovesFromBoard(board, 'R', at(5, 0));
    expect(moveTo(moves, at(5, 0), at(5, 1))).toBe(true);
    expect(moveTo(moves, at(5, 0), at(5, 3))).toBe(true);
    expect(moveTo(moves, at(5, 0), at(5, 4))).toBe(false);
    expect(moveTo(moves, at(5, 0), at(0, 0))).toBe(true);
  });

  it('slides a cannon quietly but captures only over one screen', () => {
    const board = kings();
    put(board, 6, 0, 'R', 'C');
    put(board, 6, 3, 'R', 'S');
    put(board, 6, 5, 'B', 'S');
    const moves = legalMovesFromBoard(board, 'R', at(6, 0));
    expect(moveTo(moves, at(6, 0), at(6, 1))).toBe(true);
    expect(moveTo(moves, at(6, 0), at(6, 2))).toBe(true);
    expect(moveTo(moves, at(6, 0), at(6, 3))).toBe(false);
    expect(moveTo(moves, at(6, 0), at(6, 5))).toBe(true);
    expect(moveTo(moves, at(6, 0), at(6, 6))).toBe(false);
  });

  it('marches soldiers forward, then sideways after the river', () => {
    const before = kings(6);
    before[at(6, 4)] = null;
    put(before, 6, 4, 'R', 'S');
    const beforeMoves = legalMovesFromBoard(before, 'R', at(6, 4));
    expect(beforeMoves).toHaveLength(1);
    expect(moveTo(beforeMoves, at(6, 4), at(5, 4))).toBe(true);
    expect(moveTo(beforeMoves, at(6, 4), at(6, 3))).toBe(false);

    const after = kings();
    put(after, 3, 4, 'R', 'S');
    const afterMoves = legalMovesFromBoard(after, 'R', at(3, 4));
    expect(moveTo(afterMoves, at(3, 4), at(2, 4))).toBe(true);
    expect(moveTo(afterMoves, at(3, 4), at(3, 3))).toBe(true);
    expect(moveTo(afterMoves, at(3, 4), at(3, 5))).toBe(true);
    expect(moveTo(afterMoves, at(3, 4), at(4, 4))).toBe(false);
  });

  it('moves black soldiers toward increasing rows', () => {
    const board = kings();
    board[at(5, 4)] = null;
    put(board, 5, 4, 'B', 'S');
    put(board, 6, 4, 'R', 'S');
    const moves = legalMovesFromBoard(board, 'B', at(5, 4));
    expect(moveTo(moves, at(5, 4), at(6, 4))).toBe(true);
    expect(moveTo(moves, at(5, 4), at(5, 3))).toBe(true);
    expect(moveTo(moves, at(5, 4), at(4, 4))).toBe(false);
  });
});

describe('Xiangqi check and the flying general', () => {
  it('detects a rook check and an open-file general check', () => {
    const board = blank();
    put(board, 9, 4, 'R', 'G');
    put(board, 0, 3, 'B', 'G');
    put(board, 5, 4, 'B', 'R');
    expect(isInCheck(board, 'R')).toBe(true);

    const facing = blank();
    put(facing, 9, 4, 'R', 'G');
    put(facing, 0, 4, 'B', 'G');
    expect(isInCheck(facing, 'R')).toBe(true);
    expect(isInCheck(facing, 'B')).toBe(true);
  });

  it('forbids a move that leaves the two generals facing', () => {
    const board = blank();
    put(board, 9, 4, 'R', 'G');
    put(board, 0, 4, 'B', 'G');
    put(board, 4, 4, 'R', 'R');
    const state = stateWith(board, 'R');
    expect(isInCheck(board, 'R')).toBe(false);
    const result = applyMove(state, at(4, 4), at(4, 3));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('illegal');
  });

  it('filters a pinned piece that would expose its own general', () => {
    const board = blank();
    put(board, 9, 4, 'R', 'G');
    put(board, 0, 3, 'B', 'G');
    put(board, 0, 4, 'B', 'R');
    put(board, 5, 4, 'R', 'R');
    const state = stateWith(board, 'R');
    expect(isInCheck(board, 'R')).toBe(false);
    expect(applyMove(state, at(5, 4), at(5, 3)).ok).toBe(false);
    expect(applyMove(state, at(5, 4), at(4, 4)).ok).toBe(true);
  });

  it('detects checkmate and marks the winner', () => {
    const board = kings();
    put(board, 1, 0, 'R', 'R');
    put(board, 1, 1, 'R', 'R');
    const state = stateWith(board, 'R');
    const result = applyMove(state, at(1, 1), at(0, 1));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('R');
    expect(result.state.reason).toBe('checkmate');
    expect(result.state.check).toBe(true);
    expect(applyMove(result.state, at(5, 4), at(4, 4)).error).toBe('game-over');
  });

  it('treats stalemate as a loss under Xiangqi rules', () => {
    const board = kings();
    put(board, 1, 3, 'R', 'S');
    put(board, 1, 5, 'R', 'S');
    put(board, 2, 4, 'R', 'S');
    put(board, 9, 0, 'R', 'S');
    const state = stateWith(board, 'R');
    const result = applyMove(state, at(9, 0), at(8, 0));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('R');
    expect(result.state.reason).toBe('stalemate');
    expect(result.state.check).toBe(false);
    expect(legalMovesForBoard(result.state.board, 'B')).toHaveLength(0);
  });
});

describe('Xiangqi move application', () => {
  it('rejects wrong turns, empty squares, bad squares and illegal moves', () => {
    const state = setup('R');
    expect(applyMove(state, 54, 45).ok).toBe(true);
    expect(applyMove(state, -1, 4).error).toBe('bad-square');
    expect(applyMove(state, 10, 90).error).toBe('bad-square');
    expect(applyMove(state, 0, 4).error).toBe('wrong-side');
    expect(applyMove(setup('R'), 10, 11).error).toBe('no-piece');
    expect(applySeat(setup('R'), 1, 54, 45).error).toBe('wrong-turn');
    expect(applyMove(state, 54, 54).error).toBe('illegal');
  });

  it('never mutates the state handed to applyMove', () => {
    const state = setup('R');
    const snapshot = JSON.stringify(state);
    const result = applyMove(state, 54, 45);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('gives each seat a public view with its own side', () => {
    const state = applyMove(setup('R'), 54, 45).state;
    expect(view(state, 0).side).toBe('R');
    expect(view(state, 1).side).toBe('B');
    expect(view(state, 1).canMove).toBe(true);
    expect(view(state, 0).canMove).toBe(false);
    expect(view(state, 1).last).toEqual({ from: 54, to: 45 });
    expect(view(state, 1).moveCount).toBe(1);
  });

  it('detects threefold repetition as a draw', () => {
    const board = kings();
    put(board, 9, 0, 'R', 'R');
    put(board, 0, 0, 'B', 'R');
    let state = stateWith(board, 'R');
    const cycle = [
      [at(9, 0), at(8, 0)],
      [at(0, 0), at(1, 0)],
      [at(8, 0), at(9, 0)],
      [at(1, 0), at(0, 0)],
    ];
    for (let round = 0; round < 2; round += 1) {
      for (const [from, to] of cycle) {
        const result = applyMove(state, from, to);
        expect(result.ok).toBe(true);
        state = result.state;
      }
    }
    expect(state.status).toBe('draw');
    expect(state.reason).toBe('repetition');
  });

  it('draws after sixty full moves without a capture', () => {
    const board = kings();
    put(board, 9, 0, 'R', 'R');
    const state = stateWith(board, 'R', { halfmoveClock: 119 });
    const result = applyMove(state, at(9, 0), at(8, 0));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.reason).toBe('no-capture');
  });

  it('produces a stable position key that includes the side to move', () => {
    const state = setup('R');
    expect(positionKey(state.board, 'R')).toContain('|R');
    expect(positionKey(state.board, 'R')).not.toBe(positionKey(state.board, 'B'));
  });
});

describe('Xiangqi AI and hints', () => {
  it('returns a legal move on every level', () => {
    const state = setup('R');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.4);
      expect(move).not.toBeNull();
      expect(legalMovesForBoard(state.board, 'R').some((item) => item.to === move?.to && item.from === move?.from)).toBe(true);
    }
  });

  it('finds a mate in one on the Hard level', () => {
    const board = kings();
    put(board, 1, 0, 'R', 'R');
    put(board, 1, 1, 'R', 'R');
    const state = stateWith(board, 'R');
    const move = chooseMove(state, 'hard', () => 0.5);
    expect(move).not.toBeNull();
    const result = applyMove(state, move!.from, move!.to);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('R');
    expect(result.state.reason).toBe('checkmate');
  });

  it('takes a free rook on the Hard level', () => {
    const board = kings();
    put(board, 5, 0, 'R', 'R');
    put(board, 5, 3, 'B', 'R');
    const state = stateWith(board, 'R');
    const move = chooseMove(state, 'hard', () => 0.5);
    expect(move).toEqual({ from: at(5, 0), to: at(5, 3) });
  });

  it('explains a mate in one', () => {
    const board = kings();
    put(board, 1, 0, 'R', 'R');
    put(board, 1, 1, 'R', 'R');
    const hint = hintFor(stateWith(board, 'R'));
    expect(hint?.kind).toBe('mate');
    expect(hint?.move).not.toBeUndefined();
  });

  it('explains a capture and returns no hint after the game', () => {
    const board = kings();
    put(board, 5, 0, 'R', 'R');
    put(board, 5, 3, 'B', 'R');
    const hint = hintFor(stateWith(board, 'R'));
    expect(hint).toMatchObject({ kind: 'capture', captured: 'R' });

    const done = stateWith(board, 'R', { status: 'won', winner: 'R', reason: 'checkmate' });
    expect(hintFor(done)).toBeNull();
  });
});

describe('Xiangqi family record', () => {
  const winR = stateWith(blank(), 'R', { status: 'won', winner: 'R', reason: 'checkmate', moves: [{ from: 1, to: 2 }] });
  const winB = stateWith(blank(), 'B', { status: 'won', winner: 'B', reason: 'stalemate', moves: [{ from: 1, to: 2 }, { from: 3, to: 4 }] });
  const draw = stateWith(blank(), 'R', { status: 'draw', reason: 'repetition', moves: [] });

  it('counts red, black and draw results with a mode', () => {
    const first = addResult(EMPTY_RECORD, winR, { mode: 'local' }, 1000);
    const second = addResult(first, winB, { mode: 'ai', level: 'normal' }, 2000);
    const third = addResult(second, draw, { mode: 'lan' }, 3000);
    expect(third.games).toBe(3);
    expect([third.winsRed, third.winsBlack, third.draws]).toEqual([1, 1, 1]);
    expect(third.byMode).toEqual({ ai: 1, local: 1, lan: 1 });
    expect(third.recent.map((entry) => entry.winner)).toEqual(['draw', 'B', 'R']);
    expect(third.recent[1].level).toBe('normal');
    expect(third.recent[1].moves).toBe(2);
  });

  it('tracks the current and best same-winner streak', () => {
    const first = addResult(EMPTY_RECORD, winR, { mode: 'local' }, 1000);
    const second = addResult(first, winR, { mode: 'ai' }, 2000);
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
      record = addResult(record, winR, { mode: 'local' }, 1000 + index);
    }
    expect(record.games).toBe(11);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
  });

  it('normalizes a legacy record without mode or recent fields', () => {
    const record = normalizeRecord({
      games: 4,
      winsRed: 3,
      winsBlack: 0,
      draws: 1,
      streak: 2,
      lastWinner: 'R',
    });
    expect(record.games).toBe(4);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
    expect(record.recent).toEqual([]);
    expect(record.bestStreak).toBe(0);
  });
});
