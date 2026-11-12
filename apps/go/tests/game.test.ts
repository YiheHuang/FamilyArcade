import { describe, expect, it } from 'vitest';
import { chooseMove, chooseMoveDetailed, hint } from '../src/ai/ai';
import {
  apply,
  applySeat,
  emptyBoard,
  legalMoves,
  libertiesAt,
  pass,
  passSeat,
  parsePoint,
  pointName,
  scoreBoard,
  setup,
  starPoints,
  territoryOwner,
  view,
  type BoardSize,
  type Cell,
  type Color,
  type GameState,
} from '../src/game/go';
import {
  EMPTY_RECORD,
  addResult,
  normalizeRecord,
  undoLastResult,
} from '../src/storage';

function boardWith(size: BoardSize, stones: Record<number, Color>): Cell[] {
  const board = emptyBoard(size);
  for (const [key, color] of Object.entries(stones)) board[Number(key)] = color;
  return board;
}

function position(
  stones: Record<number, Color>,
  turn: Color = 'B',
  size: BoardSize = 9,
  extra: Partial<GameState> = {},
): GameState {
  return {
    ...setup({ size, komi: 7.5, first: turn }),
    board: boardWith(size, stones),
    turn,
    ...extra,
  };
}

const rng = (value: number) => () => value;

describe('Go engine setup and turns', () => {
  it('sets up 19×19 by default with Black to move and 7.5 komi', () => {
    const state = setup();
    expect(state.size).toBe(19);
    expect(state.board).toHaveLength(361);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('B');
    expect(state.komi).toBe(7.5);
    expect(state.status).toBe('playing');
    expect(state.score).toBeNull();
    expect(legalMoves(state)).toHaveLength(361);
  });

  it('supports 9×9 and 13×13 boards with both komi values', () => {
    for (const size of [9, 13, 19] as const) {
      for (const komi of [6.5, 7.5] as const) {
        const state = setup({ size, komi });
        expect(state.size).toBe(size);
        expect(state.board).toHaveLength(size * size);
        expect(state.komi).toBe(komi);
        expect(legalMoves(state)).toHaveLength(size * size);
      }
    }
  });

  it('allows White to move first when requested', () => {
    const state = setup({ size: 9, first: 'W' });
    expect(state.turn).toBe('W');
    expect(state.first).toBe('W');
  });

  it('alternates turns and rejects occupied or out-of-range points', () => {
    const first = apply(setup({ size: 9 }), 40);
    expect(first.ok).toBe(true);
    expect(first.state.turn).toBe('W');
    expect(first.state.board[40]).toBe('B');
    expect(apply(first.state, 40).error).toBe('occupied');
    expect(apply(first.state, -1).error).toBe('bad-cell');
    expect(apply(first.state, 81).error).toBe('bad-cell');
    expect(apply(first.state, 1.5).error).toBe('bad-cell');
  });

  it('never mutates the state passed into apply or pass', () => {
    const state = setup({ size: 9 });
    const boardBefore = state.board.slice();
    apply(state, 40);
    pass(state);
    expect(state.board).toEqual(boardBefore);
    expect(state.moves).toHaveLength(0);
    expect(state.turn).toBe('B');
  });
});

describe('Go captures and suicide', () => {
  it('captures a single stone without liberties', () => {
    const state = position({ 0: 'W', 1: 'B' });
    const result = apply(state, 9);
    expect(result.ok).toBe(true);
    expect(result.state.board[0]).toBeNull();
    expect(result.state.board[9]).toBe('B');
    expect(result.state.captures.B).toBe(1);
  });

  it('captures a multi-stone group', () => {
    const state = position({ 0: 'W', 1: 'W', 2: 'B', 9: 'B' });
    const result = apply(state, 10);
    expect(result.ok).toBe(true);
    expect(result.state.board[0]).toBeNull();
    expect(result.state.board[1]).toBeNull();
    expect(result.state.captures.B).toBe(2);
    expect(result.state.koPoint).toBeNull();
  });

  it('forbids suicide and removes the point from legal moves', () => {
    const state = position({ 1: 'W', 9: 'W' });
    const result = apply(state, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('suicide');
    expect(result.state).toBe(state);
    expect(legalMoves(state)).not.toContain(0);
  });

  it('allows a move that fills its last liberty when it captures first', () => {
    const state = position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });
    const capture = apply(state, 11);
    expect(capture.ok).toBe(true);
    expect(capture.state.board[10]).toBeNull();
    expect(capture.state.captures.B).toBe(1);
    expect(libertiesAt(capture.state.board, 9, 11)).toBe(1);
  });

  it('captures two separate groups when one point fills both last liberties', () => {
    const state = position({
      0: 'W',
      2: 'W',
      3: 'B',
      9: 'B',
      11: 'B',
    });
    const result = apply(state, 1);
    expect(result.ok).toBe(true);
    expect(result.state.captures.B).toBe(2);
    expect(result.state.board[0]).toBeNull();
    expect(result.state.board[2]).toBeNull();
    expect(result.state.board[1]).toBe('B');
  });
});

describe('Go simple ko', () => {
  const koPosition = () =>
    position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });

  it('sets a simple ko point after a one-stone capture', () => {
    const result = apply(koPosition(), 11);
    expect(result.ok).toBe(true);
    expect(result.state.koPoint).toBe(10);
    expect(libertiesAt(result.state.board, 9, 11)).toBe(1);
  });

  it('forbids immediate recapture but allows it after intervening moves', () => {
    const captured = apply(koPosition(), 11).state;
    const retake = apply(captured, 10);
    expect(retake.ok).toBe(false);
    expect(retake.error).toBe('ko');
    expect(legalMoves(captured)).not.toContain(10);

    const elsewhere = apply(captured, 30).state;
    const reply = apply(elsewhere, 31).state;
    const legalRetake = apply(reply, 10);
    expect(legalRetake.ok).toBe(true);
    expect(legalRetake.state.captures.W).toBe(1);
    expect(legalRetake.state.board[11]).toBeNull();
  });

  it('clears ko on a pass', () => {
    const captured = apply(koPosition(), 11).state;
    expect(captured.koPoint).toBe(10);
    const passed = pass(captured).state;
    expect(passed.koPoint).toBeNull();
    expect(passed.passes).toBe(1);
  });
});

describe('Go passing and scoring', () => {
  it('records a pass, flips the turn and clears the last move', () => {
    const state = apply(setup({ size: 9 }), 40).state;
    const passed = pass(state);
    expect(passed.ok).toBe(true);
    expect(passed.state.passes).toBe(1);
    expect(passed.state.turn).toBe('B');
    expect(passed.state.lastMove).toBeNull();
    expect(passed.state.moves.at(-1)).toEqual({ type: 'pass', index: null, color: 'W' });
  });

  it('finishes after two consecutive passes and stores the score', () => {
    const once = pass(setup({ size: 9 })).state;
    expect(once.status).toBe('playing');
    const finished = pass(once).state;
    expect(finished.status).toBe('finished');
    expect(finished.score).not.toBeNull();
    expect(finished.score?.winner).toBe('W');
    expect(finished.score?.white).toBe(7.5);
  });

  it('resets the pass counter after a placement', () => {
    const passed = pass(setup({ size: 9 })).state;
    expect(passed.passes).toBe(1);
    const placed = apply(passed, 40).state;
    expect(placed.passes).toBe(0);
    expect(placed.moves.at(-1)).toEqual({ type: 'place', index: 40, color: 'W' });
  });

  it('refuses placements and passes after the game is finished', () => {
    const finished = pass(pass(setup({ size: 9 })).state).state;
    expect(apply(finished, 40).error).toBe('game-over');
    expect(pass(finished).error).toBe('game-over');
    expect(legalMoves(finished)).toEqual([]);
  });

  it('scores stones plus surrounded territory', () => {
    const board = boardWith(9, {
      0: 'B',
      1: 'B',
      2: 'B',
      9: 'B',
      11: 'B',
      18: 'B',
      19: 'B',
      20: 'B',
      80: 'W',
    });
    const score = scoreBoard(board, 9, 7.5);
    expect(score.blackStones).toBe(8);
    expect(score.whiteStones).toBe(1);
    expect(score.blackTerritory).toBe(1);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutral).toBe(71);
    expect(score.black).toBe(9);
    expect(score.white).toBe(8.5);
    expect(score.winner).toBe('B');
    expect(score.margin).toBe(0.5);
  });

  it('leaves a region neutral when it touches both colours', () => {
    const board = boardWith(9, { 0: 'B', 2: 'W' });
    const owner = territoryOwner(board, 9);
    expect(owner[40]).toBeNull();
    const score = scoreBoard(board, 9, 7.5);
    expect(score.blackTerritory).toBe(0);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutral).toBe(79);
  });

  it('awards an empty finished board to White by komi for both komi values', () => {
    for (const komi of [6.5, 7.5] as const) {
      const score = scoreBoard(emptyBoard(9), 9, komi);
      expect(score.black).toBe(0);
      expect(score.white).toBe(komi);
      expect(score.winner).toBe('W');
      expect(score.margin).toBe(komi);
    }
  });

  it('lets komi decide a close game', () => {
    const board = boardWith(9, {
      0: 'B',
      1: 'B',
      2: 'B',
      9: 'B',
      11: 'B',
      18: 'B',
      19: 'B',
      20: 'B',
      78: 'W',
      80: 'W',
    });
    const low = scoreBoard(board, 9, 6.5);
    const high = scoreBoard(board, 9, 7.5);
    expect(low.winner).toBe('B');
    expect(low.margin).toBe(0.5);
    expect(high.winner).toBe('W');
    expect(high.margin).toBe(0.5);
  });

  it('counts two single-point eyes for their owners', () => {
    const board = boardWith(9, {
      1: 'B',
      9: 'B',
      71: 'W',
      79: 'W',
      40: 'B',
      41: 'B',
      49: 'B',
      50: 'B',
    });
    const score = scoreBoard(board, 9, 7.5);
    expect(score.blackTerritory).toBe(1);
    expect(score.whiteTerritory).toBe(1);
    expect(score.neutral).toBe(71);
  });

  it('stores the same score used by scoreBoard when the game ends', () => {
    let state = position({
      0: 'B',
      1: 'B',
      2: 'B',
      9: 'B',
      11: 'B',
      18: 'B',
      19: 'B',
      20: 'B',
      80: 'W',
    });
    state = pass(state).state;
    state = pass(state).state;
    expect(state.status).toBe('finished');
    expect(state.score).toEqual(scoreBoard(state.board, 9, 7.5));
  });

  it('throws when a board length does not match its size', () => {
    expect(() => scoreBoard(emptyBoard(9), 19, 7.5)).toThrow();
  });

  it('scores a 19×19 wall as large territories', () => {
    const board = emptyBoard(19);
    for (let y = 0; y < 19; y++) {
      board[y * 19 + 9] = 'B';
      board[y * 19 + 11] = 'W';
    }
    const score = scoreBoard(board, 19, 7.5);
    expect(score.blackStones).toBe(19);
    expect(score.whiteStones).toBe(19);
    expect(score.blackTerritory).toBe(171);
    expect(score.whiteTerritory).toBe(133);
    expect(score.neutral).toBe(19);
    expect(score.winner).toBe('B');
  });
});

describe('Go seats, views and coordinates', () => {
  it('enforces seat colours and turn order', () => {
    const state = setup({ size: 9 });
    expect(applySeat(state, 1, 40).error).toBe('wrong-turn');
    const black = applySeat(state, 0, 40);
    expect(black.ok).toBe(true);
    expect(black.state.board[40]).toBe('B');
    const white = applySeat(black.state, 1, 41);
    expect(white.ok).toBe(true);
    expect(white.state.board[41]).toBe('W');
  });

  it('passes for a seat only on that seat’s turn', () => {
    const state = setup({ size: 9 });
    expect(passSeat(state, 1).error).toBe('wrong-turn');
    const passed = passSeat(state, 0);
    expect(passed.ok).toBe(true);
    expect(passSeat(passed.state, 1).ok).toBe(true);
  });

  it('gives each seat a serialisable public view', () => {
    const state = apply(setup({ size: 13, komi: 6.5 }), 84).state;
    const black = view(state, 0);
    const white = view(state, 1);
    expect(black.color).toBe('B');
    expect(white.color).toBe('W');
    expect(black.size).toBe(13);
    expect(black.komi).toBe(6.5);
    expect(black.canMove).toBe(false);
    expect(white.canMove).toBe(true);
    expect(white.board).toEqual(state.board);
    expect(white.board).not.toBe(state.board);
    expect(JSON.parse(JSON.stringify(white)).moveCount).toBe(1);
    expect(white.lastMove).toBe(84);
  });

  it('names and parses coordinates on every board size', () => {
    expect(pointName(9, 0)).toBe('A9');
    expect(pointName(9, 80)).toBe('J1');
    expect(pointName(13, 0)).toBe('A13');
    expect(pointName(13, 168)).toBe('N1');
    expect(pointName(19, 0)).toBe('A19');
    expect(pointName(19, 360)).toBe('T1');
    expect(parsePoint(9, 'E5')).toBe(40);
    expect(parsePoint(13, 'N1')).toBe(168);
    expect(parsePoint(19, 'T1')).toBe(360);
    expect(parsePoint(19, 'I5')).toBe(-1);
    expect(parsePoint(19, 'A20')).toBe(-1);
    expect(parsePoint(9, 'K1')).toBe(-1);
  });

  it('returns the standard number of star points', () => {
    expect(starPoints(9)).toHaveLength(5);
    expect(starPoints(13)).toHaveLength(5);
    expect(starPoints(19)).toHaveLength(9);
    expect(starPoints(19)).toContain(180);
    expect(starPoints(9)).toContain(40);
  });

  it('records placements and passes in order', () => {
    let state = setup({ size: 9 });
    state = apply(state, 40).state;
    state = apply(state, 41).state;
    state = pass(state).state;
    expect(state.moves).toEqual([
      { type: 'place', index: 40, color: 'B' },
      { type: 'place', index: 41, color: 'W' },
      { type: 'pass', index: null, color: 'B' },
    ]);
    expect(state.lastMove).toBeNull();
  });

  it('reports the last placement and clears it on a pass', () => {
    const placed = apply(setup({ size: 9 }), 40).state;
    expect(placed.lastMove).toBe(40);
    expect(pass(placed).state.lastMove).toBeNull();
  });
});

describe('Go AI', () => {
  it('returns a legal move at every level on an empty 9×9 board', () => {
    const state = setup({ size: 9 });
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, rng(0.5));
      expect(move).not.toBeNull();
      expect(legal).toContain(move as number);
    }
  });

  it('returns a legal opening on a 19×19 board without a long search', () => {
    const state = setup({ size: 19 });
    for (const level of ['companion', 'normal', 'hard'] as const) {
      const choice = chooseMoveDetailed(state, level, rng(0.5));
      expect(choice.reason).toBe('opening');
      expect(choice.index).not.toBeNull();
      expect(legalMoves(state)).toContain(choice.index as number);
    }
  });

  it('takes an immediate capture on Normal and Hard', () => {
    const state = position({ 0: 'W', 1: 'B' });
    for (const level of ['normal', 'hard'] as const) {
      const choice = chooseMoveDetailed(state, level, rng(0.9));
      expect(choice.index).toBe(9);
      expect(choice.reason).toBe('capture');
    }
  });

  it('saves its own group from atari on Easy', () => {
    const state = position({ 0: 'B', 1: 'B', 2: 'W', 9: 'W' });
    expect(libertiesAt(state.board, 9, 0)).toBe(1);
    expect(chooseMove(state, 'easy', rng(0.9))).toBe(10);
  });

  it('does not choose a suicide point', () => {
    const state = position({ 1: 'W', 9: 'W' });
    const choice = chooseMove(state, 'easy', rng(0.9));
    expect(choice).not.toBe(0);
    expect(legalMoves(state)).toContain(choice as number);
  });

  it('is deterministic for the same injected RNG', () => {
    let state = setup({ size: 9 });
    for (const move of [40, 30, 50, 22, 58]) state = apply(state, move).state;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const a = chooseMove(state, level, rng(0.37));
      const b = chooseMove(state, level, rng(0.37));
      expect(a).toBe(b);
    }
  });

  it('passes when there is no legal placement', () => {
    const board = Array<Cell>(81).fill('B');
    const full: GameState = { ...setup({ size: 9 }), board, turn: 'B' };
    expect(legalMoves(full)).toEqual([]);
    expect(chooseMove(full, 'hard', rng(0.5))).toBeNull();
    expect(chooseMoveDetailed(full, 'hard', rng(0.5)).reason).toBe('pass');
  });

  it('offers a hint with a reason and a legal point', () => {
    const choice = hint(setup({ size: 9 }), rng(0.5));
    expect(choice.index).not.toBeNull();
    expect(legalMoves(setup({ size: 9 }))).toContain(choice.index as number);
    expect(choice.reason).toBe('opening');
  });

  it('explains a capture hint', () => {
    const state = position({ 0: 'W', 1: 'B' });
    const choice = hint(state, rng(0.9));
    expect(choice.index).toBe(9);
    expect(choice.reason).toBe('capture');
  });

  it('offers a legal hint on a 13×13 midgame', () => {
    let state = setup({ size: 13 });
    for (const move of [84, 70, 96, 56]) state = apply(state, move).state;
    const choice = hint(state, rng(0.42));
    expect(choice.index).not.toBeNull();
    expect(legalMoves(state)).toContain(choice.index as number);
  });
});

describe('Family record helpers', () => {
  it('normalizes an empty or damaged record', () => {
    expect(normalizeRecord(null)).toEqual(EMPTY_RECORD);
    const cleaned = normalizeRecord({
      games: 3,
      blackWins: 2,
      whiteWins: -4,
      byMode: { ai: 1, local: 2, lan: 0 },
      recent: [{ winner: 'B' } as never],
    });
    expect(cleaned.games).toBe(3);
    expect(cleaned.blackWins).toBe(2);
    expect(cleaned.whiteWins).toBe(0);
    expect(cleaned.recent).toEqual([]);
  });

  it('records finished games, mode split, streak and recent entries', () => {
    const finished = pass(pass(setup({ size: 9, komi: 7.5 })).state).state;
    const first = addResult(
      EMPTY_RECORD,
      finished,
      { mode: 'local' },
      1_700_000_000_000,
    );
    expect(first.games).toBe(1);
    expect(first.whiteWins).toBe(1);
    expect(first.streak).toBe(1);
    expect(first.byMode.local).toBe(1);
    expect(first.recent[0]).toMatchObject({
      winner: 'W',
      mode: 'local',
      size: 9,
      komi: 7.5,
      moves: 2,
    });

    const blackWin: GameState = {
      ...finished,
      score: finished.score ? { ...finished.score, winner: 'B', margin: 1.5 } : null,
    };
    const second = addResult(first, blackWin, { mode: 'ai', level: 'hard' }, 1_700_000_001_000);
    expect(second.games).toBe(2);
    expect(second.blackWins).toBe(1);
    expect(second.whiteWins).toBe(1);
    expect(second.streak).toBe(1);
    expect(second.byMode.ai).toBe(1);
    expect(second.recent).toHaveLength(2);
    expect(second.recent[0].level).toBe('hard');
  });

  it('removes the newest result when a finished game is undone', () => {
    const finished = pass(pass(setup({ size: 9, komi: 7.5 })).state).state;
    let record = addResult(EMPTY_RECORD, finished, { mode: 'local' }, 1);
    const blackWin: GameState = {
      ...finished,
      score: finished.score ? { ...finished.score, winner: 'B', margin: 1.5 } : null,
    };
    record = addResult(record, blackWin, { mode: 'ai', level: 'easy' }, 2);
    expect(record.games).toBe(2);
    const undone = undoLastResult(record);
    expect(undone.games).toBe(1);
    expect(undone.blackWins).toBe(0);
    expect(undone.whiteWins).toBe(1);
    expect(undone.lastWinner).toBe('W');
    expect(undone.byMode.ai).toBe(0);
    expect(undone.recent).toHaveLength(1);
  });
});
