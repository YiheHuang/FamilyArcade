import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  ALL_PIECES,
  applyAction,
  applySeat,
  legalActions,
  quartoOnBoard,
  setup,
  view,
  winningCells,
  type Cell,
  type GameState,
} from '../src/game/quarto';

const DRAW_BOARD: Cell[] = [6, 0, 5, 14, 15, 13, 3, 2, 4, 10, 11, 9, 8, 1, 12, 7];

function position(board: Cell[], extra: Partial<GameState> = {}): GameState {
  const fullBoard = Array<Cell>(16).fill(null);
  board.forEach((piece, index) => {
    fullBoard[index] = piece;
  });
  const used = new Set<number>();
  for (const piece of fullBoard) if (piece !== null) used.add(piece);
  const selected = extra.selected ?? null;
  if (selected !== null) used.add(selected);
  const base = setup(0);
  return {
    ...base,
    board: fullBoard,
    pool: ALL_PIECES.filter((piece) => !used.has(piece)),
    selected,
    ...extra,
  };
}

function emptyBoard(): Cell[] {
  return Array<Cell>(16).fill(null);
}

describe('Quarto engine', () => {
  it('sets up sixteen unique pieces and an empty board', () => {
    const state = setup(0);
    expect(state.board).toHaveLength(16);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.pool).toHaveLength(16);
    expect(state.pool).toEqual([...ALL_PIECES]);
    expect(new Set(state.pool).size).toBe(16);
    expect(state.phase).toBe('choose');
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(legalActions(state)).toHaveLength(16);
  });

  it('chooses a piece, flips the turn and moves to placement', () => {
    const result = applyAction(setup(0), { type: 'choose', piece: 7 });
    expect(result.ok).toBe(true);
    expect(result.state.selected).toBe(7);
    expect(result.state.pool).not.toContain(7);
    expect(result.state.pool).toHaveLength(15);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('place');
    expect(legalActions(result.state)).toHaveLength(16);
  });

  it('rejects a used or malformed piece', () => {
    const state = position([5], { phase: 'choose' });
    expect(applyAction(state, { type: 'choose', piece: 5 }).error).toBe('piece-used');
    expect(applyAction(state, { type: 'choose', piece: 16 }).error).toBe('bad-piece');
    expect(applyAction(state, { type: 'choose', piece: -1 }).error).toBe('bad-piece');
    expect(applyAction(state, { type: 'choose', piece: 1.5 }).error).toBe('bad-piece');
  });

  it('places the chosen piece and hands the next choice to the placer', () => {
    const chosen = applyAction(setup(0), { type: 'choose', piece: 0 }).state;
    const result = applyAction(chosen, { type: 'place', cell: 5 });
    expect(result.ok).toBe(true);
    expect(result.state.board[5]).toBe(0);
    expect(result.state.selected).toBeNull();
    expect(result.state.placements).toBe(1);
    expect(result.state.lastCell).toBe(5);
    expect(result.state.lastPiece).toBe(0);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('choose');
    expect(result.state.actions).toHaveLength(2);
    expect(legalActions(result.state)).toHaveLength(15);
  });

  it('rejects placement without a piece, on a full square or off the board', () => {
    const chosen = applyAction(setup(0), { type: 'choose', piece: 0 }).state;
    expect(applyAction(chosen, { type: 'place', cell: 0 }).ok).toBe(true);
    expect(applyAction(chosen, { type: 'place', cell: 16 }).error).toBe('bad-cell');
    const blocked = position([5], {
      phase: 'place',
      selected: 0,
      placements: 1,
      turn: 1,
    });
    expect(applyAction(blocked, { type: 'place', cell: 0 }).error).toBe('occupied');
    const noPiece = position([], { phase: 'place', selected: null });
    expect(applyAction(noPiece, { type: 'place', cell: 0 }).error).toBe('no-piece');
  });

  it('detects rows, columns and diagonals', () => {
    const row = emptyBoard();
    row[0] = 0;
    row[1] = 2;
    row[2] = 12;
    row[3] = 14;
    expect(quartoOnBoard(row)?.line).toEqual([0, 1, 2, 3]);

    const column = emptyBoard();
    column[1] = 0;
    column[5] = 4;
    column[9] = 9;
    column[13] = 13;
    expect(quartoOnBoard(column)?.line).toEqual([1, 5, 9, 13]);

    const diagonal = emptyBoard();
    diagonal[3] = 0;
    diagonal[6] = 2;
    diagonal[9] = 12;
    diagonal[12] = 14;
    expect(quartoOnBoard(diagonal)?.line).toEqual([3, 6, 9, 12]);
  });

  it('reports every shared attribute, not just the first', () => {
    const board = emptyBoard();
    board[0] = 0;
    board[1] = 2;
    board[2] = 4;
    board[3] = 6;
    const result = quartoOnBoard(board);
    expect(result?.attributes).toEqual([
      { attribute: 0, value: 0 },
      { attribute: 3, value: 0 },
    ]);
  });

  it('does not call a line with no shared attribute a quarto', () => {
    const board = emptyBoard();
    board[0] = 6;
    board[1] = 0;
    board[2] = 5;
    board[3] = 14;
    expect(quartoOnBoard(board)).toBeNull();
    expect(quartoOnBoard(DRAW_BOARD)).toBeNull();
  });

  it('finds the empty square that completes a line for a piece', () => {
    const board = emptyBoard();
    board[0] = 0;
    board[1] = 2;
    board[2] = 12;
    expect(winningCells(board, 14)).toEqual([3]);
    expect(winningCells(board, 6)).toEqual([3]);
    expect(winningCells(board, 1)).toEqual([]);
    expect(winningCells(board, 99)).toEqual([]);
  });

  it('ends the game when a placement makes a quarto', () => {
    const state = position([0, 2, 12], {
      phase: 'place',
      selected: 14,
      placements: 3,
    });
    const result = applyAction(state, { type: 'place', cell: 3 });
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(0);
    expect(result.state.line).toEqual([0, 1, 2, 3]);
    expect(result.state.attributes).toEqual([{ attribute: 0, value: 0 }]);
  });

  it('rejects any action after the game is over', () => {
    const won = applyAction(
      position([0, 2, 12], { phase: 'place', selected: 14, placements: 3 }),
      { type: 'place', cell: 3 },
    ).state;
    expect(applyAction(won, { type: 'choose', piece: 1 }).error).toBe('game-over');
    expect(applyAction(won, { type: 'place', cell: 4 }).error).toBe('game-over');
  });

  it('lets a quarto on the sixteenth piece beat the full-board draw', () => {
    const board: Cell[] = [
      0, 2, 12, null,
      4, 3, 1, 9,
      11, 5, 8, 15,
      7, 10, 6, 13,
    ];
    const state = position(board, {
      phase: 'place',
      selected: 14,
      placements: 15,
    });
    expect(state.pool).toHaveLength(0);
    const result = applyAction(state, { type: 'place', cell: 3 });
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(0);
    expect(result.state.line).toEqual([0, 1, 2, 3]);
    expect(result.state.placements).toBe(16);
  });

  it('draws when the sixteenth piece fills the board without a quarto', () => {
    const state = position(DRAW_BOARD.slice(0, 15), {
      phase: 'place',
      selected: 7,
      placements: 15,
    });
    expect(state.pool).toHaveLength(0);
    expect(quartoOnBoard(state.board)).toBeNull();
    const result = applyAction(state, { type: 'place', cell: 15 });
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.winner).toBeNull();
    expect(result.state.placements).toBe(16);
    expect(result.state.board.every((cell) => cell !== null)).toBe(true);
  });

  it('enforces the seat whose turn it is', () => {
    const state = setup(0);
    expect(applySeat(state, 1, { type: 'choose', piece: 0 }).error).toBe('wrong-turn');
    const chosen = applySeat(state, 0, { type: 'choose', piece: 0 });
    expect(chosen.ok).toBe(true);
    expect(applySeat(chosen.state, 0, { type: 'place', cell: 0 }).error).toBe('wrong-turn');
    expect(applySeat(chosen.state, 1, { type: 'place', cell: 0 }).ok).toBe(true);
    expect(applySeat(state, 2, { type: 'choose', piece: 0 }).error).toBe('wrong-turn');
  });

  it('gives each seat a public view with its own ability to act', () => {
    const state = applyAction(setup(0), { type: 'choose', piece: 0 }).state;
    const first = view(state, 0);
    const second = view(state, 1);
    expect(first.seat).toBe(0);
    expect(second.seat).toBe(1);
    expect(first.canAct).toBe(false);
    expect(second.canAct).toBe(true);
    expect(first.phase).toBe('place');
    expect(first.actionCount).toBe(1);
    expect(second.selected).toBe(0);
    expect(second.board).toHaveLength(16);
    expect(second.pool).toHaveLength(15);
  });

  it('never mutates the state passed into applyAction or view', () => {
    const state = setup(0);
    const board = state.board;
    const pool = state.pool;
    const actions = state.actions;
    const chosen = applyAction(state, { type: 'choose', piece: 0 });
    expect(state.pool).toBe(pool);
    expect(state.pool).toEqual([...ALL_PIECES]);
    expect(state.selected).toBeNull();
    expect(chosen.state.pool).not.toBe(pool);

    const placed = applyAction(chosen.state, { type: 'place', cell: 0 });
    expect(chosen.state.board[0]).toBeNull();
    expect(placed.state.board).not.toBe(board);

    const shown = view(placed.state, 0);
    shown.board[0] = 15;
    expect(placed.state.board[0]).toBe(0);
    expect(placed.state.actions).toHaveLength(2);
    expect(state.actions).toBe(actions);
  });

  it('keeps the 16 pieces distinct across all four attributes', () => {
    expect(new Set(ALL_PIECES).size).toBe(16);
    const keys = ALL_PIECES.map((piece) =>
      [0, 1, 2, 3].map((attribute) => (piece >> attribute) & 1).join(''),
    );
    expect(new Set(keys).size).toBe(16);
  });

  it('offers only empty squares in the placement phase', () => {
    const state = position([0, 2], {
      phase: 'place',
      selected: 4,
      placements: 2,
    });
    const actions = legalActions(state);
    expect(actions).toHaveLength(14);
    expect(actions).not.toContainEqual({ type: 'place', cell: 0 });
    expect(actions).not.toContainEqual({ type: 'place', cell: 1 });
    expect(actions).toContainEqual({ type: 'place', cell: 2 });
  });
});

describe('Quarto AI', () => {
  it('returns a legal action at every level', () => {
    const opening = setup(0);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const action = chooseAction(opening, level, () => 0.5);
      expect(action).not.toBeNull();
      expect(legalActions(opening)).toContainEqual(action);
    }
  });

  it('takes an immediate winning placement on hard', () => {
    const state = position([0, 2, 12], {
      phase: 'place',
      selected: 14,
      placements: 3,
    });
    expect(chooseAction(state, 'hard', () => 0.5)).toEqual({ type: 'place', cell: 3 });
  });

  it('takes an immediate winning placement on companion', () => {
    const state = position([0, 2, 12], {
      phase: 'place',
      selected: 14,
      placements: 3,
    });
    expect(chooseAction(state, 'companion', () => 0.5)).toEqual({
      type: 'place',
      cell: 3,
    });
  });

  it('does not hand over a piece that wins immediately when a safe piece exists', () => {
    const state = position([0, 2, 12], { phase: 'choose', placements: 3 });
    const action = chooseAction(state, 'hard', () => 0.5);
    expect(action?.type).toBe('choose');
    if (action?.type === 'choose') {
      expect(winningCells(state.board, action.piece)).toHaveLength(0);
    }
  });

  it('companion also avoids an immediate gift', () => {
    const state = position([0, 2, 12], { phase: 'choose', placements: 3 });
    const action = chooseAction(state, 'companion', () => 0.5);
    expect(action?.type).toBe('choose');
    if (action?.type === 'choose') {
      expect(winningCells(state.board, action.piece)).toHaveLength(0);
    }
  });

  it('still returns a legal piece when every piece is unsafe', () => {
    const state = position([0, 2, 12], {
      phase: 'choose',
      placements: 3,
      pool: [6, 8, 10, 14],
    });
    const action = chooseAction(state, 'hard', () => 0.5);
    expect(action?.type).toBe('choose');
    expect(legalActions(state)).toContainEqual(action);
  });

  it('is deterministic for the same state and RNG', () => {
    const state = position([0, 2, 12], { phase: 'choose', placements: 3 });
    expect(chooseAction(state, 'hard', () => 0.5)).toEqual(
      chooseAction(state, 'hard', () => 0.5),
    );
    expect(chooseAction(state, 'easy', () => 0.3)).toEqual(
      chooseAction(state, 'easy', () => 0.3),
    );
  });

  it('keeps the state unchanged while thinking', () => {
    const state = position([0, 2, 12], { phase: 'choose', placements: 3 });
    const before = JSON.stringify(state);
    chooseAction(state, 'normal', () => 0.9);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Quarto hints', () => {
  it('points to a winning placement and names the attribute', () => {
    const state = position([0, 2, 12], {
      phase: 'place',
      selected: 14,
      placements: 3,
    });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('win');
    expect(hint?.action).toEqual({ type: 'place', cell: 3 });
    expect(hint?.attributes).toEqual([{ attribute: 0, value: 0 }]);
  });

  it('explains a safe gift when another piece would lose', () => {
    const state = position([0, 2, 12], { phase: 'choose', placements: 3 });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('avoid');
    expect(hint?.action.type).toBe('choose');
    if (hint?.action.type === 'choose') {
      expect(winningCells(state.board, hint.action.piece)).toHaveLength(0);
    }
  });

  it('calls out a forced gift when every piece is unsafe', () => {
    const state = position([0, 2, 12], {
      phase: 'choose',
      placements: 3,
      pool: [6, 8, 10, 14],
    });
    expect(hintFor(state)?.kind).toBe('forced');
  });

  it('explains a quiet placement that creates no immediate threat', () => {
    const state = position([], { phase: 'place', selected: 0, placements: 0 });
    expect(hintFor(state)?.kind).toBe('quiet');
  });

  it('returns no hint after the game is over', () => {
    const won = applyAction(
      position([0, 2, 12], { phase: 'place', selected: 14, placements: 3 }),
      { type: 'place', cell: 3 },
    ).state;
    expect(hintFor(won)).toBeNull();
  });
});
