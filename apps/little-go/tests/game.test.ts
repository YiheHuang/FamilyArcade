import { describe, expect, it } from 'vitest';
import { chooseMove, chooseMoveDetailed, hint } from '../src/ai/ai';
import {
  apply,
  applySeat,
  emptyBoard,
  KOMI,
  legalMoves,
  libertiesAt,
  pass,
  passSeat,
  parsePoint,
  pointName,
  scoreBoard,
  setup,
  territoryOwner,
  view,
  type Cell,
  type Color,
  type GameState,
} from '../src/game/little-go';

function boardWith(stones: Record<number, Color>): Cell[] {
  const board = emptyBoard();
  for (const [key, color] of Object.entries(stones)) board[Number(key)] = color;
  return board;
}

function position(stones: Record<number, Color>, turn: Color = 'B', extra: Partial<GameState> = {}): GameState {
  return { ...setup(turn), board: boardWith(stones), turn, ...extra };
}

const rng = (value: number) => () => value;

describe('Little Go engine', () => {
  it('sets up an empty 9×9 board with Black to move and 6.5 komi', () => {
    const state = setup();
    expect(state.board).toHaveLength(81);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('B');
    expect(state.status).toBe('playing');
    expect(state.score).toBeNull();
    expect(scoreBoard(state.board).komi).toBe(KOMI);
    expect(legalMoves(state)).toHaveLength(81);
  });

  it('alternates turns and rejects occupied or out-of-range points', () => {
    const first = apply(setup(), 40);
    expect(first.ok).toBe(true);
    expect(first.state.turn).toBe('W');
    expect(first.state.board[40]).toBe('B');
    expect(apply(first.state, 40).error).toBe('occupied');
    expect(apply(first.state, -1).error).toBe('bad-cell');
    expect(apply(first.state, 81).error).toBe('bad-cell');
    expect(apply(first.state, 1.5).error).toBe('bad-cell');
  });

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
  });

  it('forbids suicide', () => {
    const state = position({ 1: 'W', 9: 'W' });
    const result = apply(state, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('suicide');
    expect(result.state).toBe(state);
    expect(legalMoves(state)).not.toContain(0);
  });

  it('allows a move that fills its last liberty when it captures', () => {
    const ko = position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });
    const capture = apply(ko, 11);
    expect(capture.ok).toBe(true);
    expect(capture.state.board[10]).toBeNull();
    expect(capture.state.captures.B).toBe(1);
  });

  it('sets a simple ko point after a one-stone capture', () => {
    const state = position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });
    const result = apply(state, 11);
    expect(result.ok).toBe(true);
    expect(result.state.koPoint).toBe(10);
    expect(libertiesAt(result.state.board, 11)).toBe(1);
  });

  it('forbids immediate recapture but allows it after an intervening move', () => {
    const state = position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });
    const captured = apply(state, 11).state;
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

  it('does not set ko after a multi-stone capture', () => {
    const state = position({ 0: 'W', 1: 'W', 2: 'B', 9: 'B' });
    const result = apply(state, 10);
    expect(result.state.koPoint).toBeNull();
  });

  it('records a pass, flips the turn and clears ko', () => {
    const state = position({
      1: 'B',
      2: 'W',
      9: 'B',
      10: 'W',
      12: 'W',
      19: 'B',
      20: 'W',
    });
    const captured = apply(state, 11).state;
    expect(captured.turn).toBe('W');
    const passed = pass(captured);
    expect(passed.ok).toBe(true);
    expect(passed.state.passes).toBe(1);
    expect(passed.state.turn).toBe('B');
    expect(passed.state.koPoint).toBeNull();
    expect(passed.state.lastMove).toBeNull();
    expect(passed.state.moves.at(-1)).toEqual({ type: 'pass', index: null, color: 'W' });
  });

  it('finishes after two consecutive passes and stores the score', () => {
    const once = pass(setup()).state;
    expect(once.status).toBe('playing');
    const finished = pass(once).state;
    expect(finished.status).toBe('finished');
    expect(finished.score).not.toBeNull();
    expect(finished.score?.winner).toBe('W');
    expect(finished.score?.white).toBe(KOMI);
  });

  it('resets the pass counter after a placement', () => {
    const passed = pass(setup()).state;
    expect(passed.passes).toBe(1);
    const placed = apply(passed, 40).state;
    expect(placed.passes).toBe(0);
    expect(placed.moves.at(-1)).toEqual({ type: 'place', index: 40, color: 'W' });
  });

  it('refuses moves and passes after the game is finished', () => {
    const finished = pass(pass(setup()).state).state;
    expect(finished.status).toBe('finished');
    expect(apply(finished, 40).error).toBe('game-over');
    expect(pass(finished).error).toBe('game-over');
    expect(legalMoves(finished)).toEqual([]);
  });

  it('scores stones plus surrounded territory', () => {
    const board = boardWith({
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
    const score = scoreBoard(board);
    expect(score.blackStones).toBe(8);
    expect(score.whiteStones).toBe(1);
    expect(score.blackTerritory).toBe(1);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutral).toBe(71);
    expect(score.black).toBe(9);
    expect(score.white).toBe(1 + KOMI);
    expect(score.winner).toBe('B');
    expect(score.margin).toBe(1.5);
  });

  it('leaves a region neutral when it touches both colours', () => {
    const board = boardWith({ 0: 'B', 2: 'W' });
    const owner = territoryOwner(board);
    expect(owner[40]).toBeNull();
    const score = scoreBoard(board);
    expect(score.blackTerritory).toBe(0);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutral).toBe(79);
  });

  it('awards an empty finished board to White by komi', () => {
    const score = scoreBoard(emptyBoard());
    expect(score.black).toBe(0);
    expect(score.white).toBe(6.5);
    expect(score.winner).toBe('W');
    expect(score.margin).toBe(6.5);
  });

  it('counts two single-point eyes for their owners', () => {
    const board = boardWith({
      1: 'B',
      9: 'B',
      71: 'W',
      79: 'W',
      40: 'B',
      41: 'B',
      49: 'B',
      50: 'B',
    });
    const score = scoreBoard(board);
    // The empty points 0 and 80 are single-point eyes. The remaining empties
    // form one large region touching both colours, so they are neutral.
    expect(score.blackTerritory).toBe(1);
    expect(score.whiteTerritory).toBe(1);
    expect(score.neutral).toBe(71);
  });

  it('enforces seat colours and turn order', () => {
    const state = setup();
    expect(applySeat(state, 1, 40).error).toBe('wrong-turn');
    const black = applySeat(state, 0, 40);
    expect(black.ok).toBe(true);
    expect(black.state.board[40]).toBe('B');
    const white = applySeat(black.state, 1, 41);
    expect(white.ok).toBe(true);
    expect(white.state.board[41]).toBe('W');
    expect(applySeat(white.state, 0, 42).ok).toBe(true);
  });

  it('passes for a seat only on that seat’s turn', () => {
    const state = setup();
    expect(passSeat(state, 1).error).toBe('wrong-turn');
    const passed = passSeat(state, 0);
    expect(passed.ok).toBe(true);
    expect(passed.state.turn).toBe('W');
    expect(passSeat(passed.state, 1).ok).toBe(true);
  });

  it('gives each seat a private, serialisable view', () => {
    const state = apply(setup(), 40).state;
    const black = view(state, 0);
    const white = view(state, 1);
    expect(black.color).toBe('B');
    expect(white.color).toBe('W');
    expect(black.canMove).toBe(false);
    expect(white.canMove).toBe(true);
    expect(white.board).toEqual(state.board);
    expect(white.board).not.toBe(state.board);
    expect(JSON.parse(JSON.stringify(white)).moveCount).toBe(1);
    expect(white.lastMove).toBe(40);
  });

  it('names and parses Go coordinates', () => {
    expect(pointName(0)).toBe('A9');
    expect(pointName(4)).toBe('E9');
    expect(pointName(40)).toBe('E5');
    expect(pointName(80)).toBe('J1');
    expect(parsePoint('E5')).toBe(40);
    expect(parsePoint('A9')).toBe(0);
    expect(parsePoint('J1')).toBe(80);
    expect(parsePoint('I5')).toBe(-1);
    expect(parsePoint('E10')).toBe(-1);
  });

  it('records placements in order with the colour that played them', () => {
    let state = setup();
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

  it('marks the last move and clears it on a pass', () => {
    const placed = apply(setup(), 40).state;
    expect(placed.lastMove).toBe(40);
    expect(pass(placed).state.lastMove).toBeNull();
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
    expect(state.score).toEqual(scoreBoard(state.board));
  });
});

describe('Little Go AI', () => {
  it('returns a legal move at every level on an empty board', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(setup(), level, rng(0.5));
      expect(move).not.toBeNull();
      expect(legalMoves(setup())).toContain(move as number);
    }
  });

  it('takes an immediate capture', () => {
    const state = position({ 0: 'W', 1: 'B' });
    const choice = chooseMoveDetailed(state, 'hard', rng(0.9));
    expect(choice.index).toBe(9);
    expect(choice.reason).toBe('capture');
  });

  it('saves its own group from atari on Easy', () => {
    const state = position({ 0: 'B', 1: 'B', 2: 'W', 9: 'W' });
    expect(libertiesAt(state.board, 0)).toBe(1);
    expect(chooseMove(state, 'easy', rng(0.9))).toBe(10);
  });

  it('does not choose a suicide point', () => {
    const state = position({ 1: 'W', 9: 'W' });
    const choice = chooseMove(state, 'easy', rng(0.9));
    expect(choice).not.toBe(0);
    expect(legalMoves(state)).toContain(choice as number);
  });

  it('is deterministic for the same injected RNG', () => {
    let state = setup();
    for (const move of [40, 30, 50, 22, 58]) state = apply(state, move).state;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const a = chooseMove(state, level, rng(0.37));
      const b = chooseMove(state, level, rng(0.37));
      expect(a).toBe(b);
    }
  });

  it('passes when there is no legal placement', () => {
    const board = Array<Cell>(81).fill('B');
    const full = { ...setup(), board, turn: 'B' as Color };
    expect(legalMoves(full)).toEqual([]);
    expect(chooseMove(full, 'hard', rng(0.5))).toBeNull();
    expect(chooseMoveDetailed(full, 'hard', rng(0.5)).reason).toBe('pass');
  });

  it('offers a hint with a reason and a legal point', () => {
    const choice = hint(setup(), rng(0.5));
    expect(choice.index).not.toBeNull();
    expect(legalMoves(setup())).toContain(choice.index as number);
    expect(choice.reason).toBe('opening');
  });

  it('explains a capture hint', () => {
    const state = position({ 0: 'W', 1: 'B' });
    const choice = hint(state, rng(0.9));
    expect(choice.index).toBe(9);
    expect(choice.reason).toBe('capture');
  });
});
