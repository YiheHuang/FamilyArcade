import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate } from '../src/ai/ai';
import { explainMove, threatenedPoints } from '../src/ai/explain';
import {
  ADJACENCY,
  MEN_EACH,
  MILLS,
  QUIET_LIMIT,
  apply,
  applySeat,
  capturablePoints,
  emptyPoints,
  hasAnyStep,
  legalMoves,
  millAt,
  millsFor,
  setup,
  view,
  type Cell,
  type GameState,
  type Move,
  type Player,
} from '../src/game/mill';

function boardFrom(entries: [number, Player][]): Cell[] {
  const board = Array<Cell>(24).fill(null);
  for (const [point, player] of entries) board[point] = player;
  return board;
}

function counts(board: readonly Cell[]): Record<Player, number> {
  return {
    W: board.filter((cell) => cell === 'W').length,
    B: board.filter((cell) => cell === 'B').length,
  };
}

function fixture(options: {
  board: Cell[];
  turn?: Player;
  phase?: 'placing' | 'moving';
  pendingCapture?: Player | null;
  hand?: Record<Player, number>;
  quiet?: number;
  moveCount?: number;
  last?: GameState['last'];
}): GameState {
  const base = setup(options.turn ?? 'W');
  return {
    ...base,
    board: options.board,
    phase: options.phase ?? 'moving',
    pendingCapture: options.pendingCapture ?? null,
    hand: options.hand ?? { W: 0, B: 0 },
    onBoard: counts(options.board),
    quiet: options.quiet ?? 0,
    moveCount: options.moveCount ?? 18,
    last: options.last ?? null,
  };
}

function place(point: number): Move {
  return { type: 'place', point };
}

function move(from: number, to: number): Move {
  return { type: 'move', from, to };
}

function capture(point: number): Move {
  return { type: 'capture', point };
}

function playSequence(moves: Move[]): GameState {
  let state = setup('W');
  for (const item of moves) {
    const result = apply(state, item);
    if (!result.ok) throw new Error(`unexpected ${result.error}`);
    state = result.state;
  }
  return state;
}

function lcg(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

describe('board geometry', () => {
  it('has 24 points, 16 mills and a symmetric graph', () => {
    expect(ADJACENCY).toHaveLength(24);
    expect(MILLS).toHaveLength(16);
    expect(new Set(MILLS.map((line) => line.join('-'))).size).toBe(16);
    let edges = 0;
    for (let point = 0; point < 24; point += 1) {
      for (const next of ADJACENCY[point]) {
        expect(ADJACENCY[next]).toContain(point);
        edges += 1;
      }
    }
    expect(edges / 2).toBe(32);
  });

  it('defines mills as three distinct adjacent-by-line points', () => {
    for (const line of MILLS) {
      expect(new Set(line).size).toBe(3);
      for (const point of line) expect(point).toBeGreaterThanOrEqual(0);
      for (const point of line) expect(point).toBeLessThan(24);
    }
  });
});

describe('setup and placement', () => {
  it('starts empty with nine men each and White to place', () => {
    const state = setup('W');
    expect(state.board).toHaveLength(24);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.hand).toEqual({ W: MEN_EACH, B: MEN_EACH });
    expect(state.onBoard).toEqual({ W: 0, B: 0 });
    expect(state.phase).toBe('placing');
    expect(state.turn).toBe('W');
    expect(legalMoves(state)).toHaveLength(24);
  });

  it('alternates placement and decrements the hand', () => {
    const first = apply(setup('W'), place(4));
    expect(first.ok).toBe(true);
    expect(first.state.board[4]).toBe('W');
    expect(first.state.hand.W).toBe(8);
    expect(first.state.turn).toBe('B');
    const second = apply(first.state, place(8));
    expect(second.state.board[8]).toBe('B');
    expect(second.state.hand.B).toBe(8);
    expect(second.state.turn).toBe('W');
    expect(second.state.moveCount).toBe(2);
  });

  it('rejects occupied points, out-of-range points and malformed moves', () => {
    const state = apply(setup('W'), place(4)).state;
    expect(apply(state, place(4)).error).toBe('occupied');
    expect(apply(state, place(24)).error).toBe('bad-point');
    expect(apply(state, place(-1)).error).toBe('bad-point');
    expect(apply(state, { type: 'bogus' } as unknown as Move).error).toBe('bad-move');
  });

  it('rejects a move action while still placing', () => {
    expect(apply(setup('W'), move(0, 1)).error).toBe('wrong-phase');
  });

  it('transitions to moving after the eighteenth placement', () => {
    const board = boardFrom([
      [0, 'W'], [1, 'W'], [3, 'W'], [8, 'W'], [10, 'W'], [12, 'W'], [14, 'W'], [16, 'W'], [18, 'W'],
      [2, 'B'], [4, 'B'], [6, 'B'], [9, 'B'], [11, 'B'], [13, 'B'], [15, 'B'], [17, 'B'],
    ]);
    const state = fixture({
      board,
      phase: 'placing',
      turn: 'B',
      hand: { W: 0, B: 1 },
      moveCount: 17,
    });
    const result = apply(state, place(20));
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('moving');
    expect(result.state.turn).toBe('W');
    expect(result.state.hand).toEqual({ W: 0, B: 0 });
    expect(result.state.onBoard).toEqual({ W: 9, B: 9 });
    expect(result.state.status).toBe('playing');
  });

  it('enforces seat marks for LAN intents', () => {
    const state = setup('W');
    expect(applySeat(state, 1, place(0)).error).toBe('wrong-turn');
    expect(applySeat(state, 2, place(0)).error).toBe('bad-seat');
    const after = applySeat(state, 0, place(0));
    expect(after.ok).toBe(true);
    expect(applySeat(after.state, 1, place(1)).ok).toBe(true);
  });
});

describe('mills and captures', () => {
  it('closes a mill, keeps the turn and offers only captures', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    const result = apply(state, place(2));
    expect(result.ok).toBe(true);
    expect(result.state.pendingCapture).toBe('B');
    expect(result.state.turn).toBe('W');
    expect(result.state.last?.mill).toEqual([0, 1, 2]);
    expect(result.state.moveCount).toBe(5);
    const legal = legalMoves(result.state);
    expect(legal.every((item) => item.type === 'capture')).toBe(true);
    expect(legal).toHaveLength(2);
  });

  it('removes the captured man, resets quiet and passes the turn', () => {
    const state = playSequence([place(0), place(8), place(1), place(9), place(2)]);
    const result = apply(state, capture(8));
    expect(result.ok).toBe(true);
    expect(result.state.board[8]).toBeNull();
    expect(result.state.onBoard.B).toBe(1);
    expect(result.state.quiet).toBe(0);
    expect(result.state.turn).toBe('B');
    expect(result.state.pendingCapture).toBeNull();
    expect(result.state.last?.capture).toBe(true);
  });

  it('protects men inside a mill when a free man exists', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [18, 'W'], [19, 'W'],
      [4, 'B'], [5, 'B'], [6, 'B'], [0, 'B'],
    ]);
    const state = fixture({ board, pendingCapture: 'B', turn: 'W' });
    expect(capturablePoints(board, 'B')).toEqual([0]);
    expect(apply(state, capture(4)).error).toBe('protected');
    const result = apply(state, capture(0));
    expect(result.ok).toBe(true);
    expect(result.state.onBoard.B).toBe(3);
    expect(result.state.turn).toBe('B');
  });

  it('allows any man when every rival man is in a mill', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [18, 'W'],
      [4, 'B'], [5, 'B'], [6, 'B'], [8, 'B'], [9, 'B'], [10, 'B'],
    ]);
    const state = fixture({ board, pendingCapture: 'B', turn: 'W' });
    expect(capturablePoints(board, 'B').sort((a, b) => a - b)).toEqual([4, 5, 6, 8, 9, 10]);
    const result = apply(state, capture(4));
    expect(result.ok).toBe(true);
    expect(result.state.board[4]).toBeNull();
    expect(result.state.status).toBe('playing');
  });

  it('rejects captures with no mill, the wrong colour and protected men', () => {
    const state = setup('W');
    expect(apply(state, capture(0)).error).toBe('no-mill');
    const withMill = playSequence([place(0), place(8), place(1), place(9), place(2)]);
    expect(apply(withMill, place(3)).error).toBe('capture-required');
    expect(apply(withMill, capture(2)).error).toBe('not-capturable');
    expect(apply(withMill, capture(7)).error).toBe('not-capturable');
  });

  it('wins immediately when a capture leaves the rival with two men', () => {
    const board = boardFrom([
      [16, 'W'], [18, 'W'], [19, 'W'], [20, 'W'],
      [0, 'B'], [1, 'B'], [4, 'B'],
    ]);
    const state = fixture({ board, pendingCapture: 'B', turn: 'W' });
    const result = apply(state, capture(0));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('W');
    expect(result.state.winReason).toBe('two-men');
    expect(result.state.onBoard.B).toBe(2);
    expect(result.state.phase).toBe('ended');
  });

  it('reports every mill and the mill through a point', () => {
    const board = boardFrom([
      [0, 'W'], [1, 'W'], [2, 'W'],
      [4, 'W'], [5, 'W'], [6, 'W'],
      [8, 'B'], [9, 'B'], [10, 'B'],
    ]);
    expect(millsFor(board, 'W')).toHaveLength(2);
    expect(millsFor(board, 'B')).toHaveLength(1);
    expect(millAt(board, 'W', 1)).toEqual([0, 1, 2]);
    expect(millAt(board, 'W', 7)).toBeNull();
  });
});

describe('moving phase', () => {
  it('only steps along a line to an empty point', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [19, 'W'],
      [0, 'B'], [1, 'B'], [3, 'B'],
    ]);
    const state = fixture({ board, turn: 'W' });
    expect(apply(state, move(16, 23)).ok).toBe(true);
    expect(apply(state, move(16, 17)).error).toBe('occupied');
    expect(apply(state, move(16, 8)).error).toBe('not-adjacent');
    expect(apply(state, move(0, 7)).error).toBe('not-own');
  });

  it('allows a move to close a mill and capture', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [19, 'W'],
      [0, 'B'], [1, 'B'], [3, 'B'],
    ]);
    const state = fixture({ board, turn: 'W' });
    const result = apply(state, move(19, 18));
    expect(result.ok).toBe(true);
    expect(result.state.pendingCapture).toBe('B');
    expect(result.state.turn).toBe('W');
    expect(result.state.last?.mill).toEqual([16, 17, 18]);
  });

  it('wins by blocking every legal move', () => {
    const board = boardFrom([
      [0, 'W'], [2, 'W'], [4, 'W'],
      [1, 'B'], [3, 'B'], [5, 'B'], [7, 'B'], [22, 'B'],
    ]);
    expect(hasAnyStep(board, 'W')).toBe(false);
    const state = fixture({ board, turn: 'B' });
    const result = apply(state, move(22, 23));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('B');
    expect(result.state.winReason).toBe('blocked');
    expect(result.state.phase).toBe('ended');
  });

  it('ends a 50-move quiet game in a draw', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [19, 'W'],
      [0, 'B'], [1, 'B'], [3, 'B'],
    ]);
    const state = fixture({ board, turn: 'W', quiet: QUIET_LIMIT - 1 });
    const result = apply(state, move(19, 20));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.winner).toBeNull();
    expect(result.state.phase).toBe('ended');
  });

  it('refuses further actions after the game ends', () => {
    const board = boardFrom([
      [0, 'W'], [2, 'W'], [4, 'W'],
      [1, 'B'], [3, 'B'], [5, 'B'], [7, 'B'], [22, 'B'],
    ]);
    const state = apply(fixture({ board, turn: 'B' }), move(22, 23)).state;
    expect(state.status).toBe('won');
    expect(apply(state, move(0, 7)).error).toBe('game-over');
    expect(apply(state, capture(0)).error).toBe('game-over');
    expect(legalMoves(state)).toEqual([]);
  });
});

describe('views and seats', () => {
  it('gives each seat its own mark and legality', () => {
    const state = apply(setup('W'), place(4)).state;
    const white = view(state, 0);
    const black = view(state, 1);
    expect(white.mark).toBe('W');
    expect(white.canMove).toBe(false);
    expect(white.legal).toEqual([]);
    expect(black.mark).toBe('B');
    expect(black.canMove).toBe(true);
    expect(black.legal).toHaveLength(23);
    expect(black.board[4]).toBe('W');
  });

  it('exposes pending capture to both seats without hidden data', () => {
    const state = playSequence([place(0), place(8), place(1), place(9), place(2)]);
    const white = view(state, 0);
    expect(white.pendingCapture).toBe('B');
    expect(white.canMove).toBe(true);
    expect(white.legal.every((item) => item.type === 'capture')).toBe(true);
    expect(view(state, 1).legal).toEqual([]);
  });
});

describe('AI', () => {
  it('returns a legal move on every level from the opening', () => {
    const state = setup('W');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const chosen = chooseMove(state, level, lcg(7));
      expect(chosen).not.toBeNull();
      expect(legalMoves(state)).toContainEqual(chosen);
    }
  });

  it('is deterministic for an injected RNG', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    const first = chooseMove(state, 'hard', lcg(42));
    const second = chooseMove(state, 'hard', lcg(42));
    expect(first).toEqual(second);
  });

  it('takes an immediate mill on Hard, Normal and Companion', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    const expected = place(2);
    expect(chooseMove(state, 'hard', lcg(5))).toEqual(expected);
    expect(chooseMove(state, 'normal', lcg(5))).toEqual(expected);
    expect(chooseMove(state, 'companion', lcg(5))).toEqual(expected);
  });

  it('chooses captures when a capture is pending', () => {
    const state = playSequence([place(0), place(8), place(1), place(9), place(2)]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const chosen = chooseMove(state, level, lcg(11));
      expect(chosen?.type).toBe('capture');
      expect(legalMoves(state)).toContainEqual(chosen);
    }
  });

  it('evaluates terminal and material positions from each side', () => {
    const board = boardFrom([
      [0, 'W'], [1, 'W'], [2, 'W'],
      [8, 'B'], [9, 'B'],
    ]);
    const state = fixture({ board, turn: 'B' });
    expect(evaluate(state, 'W')).toBeGreaterThan(0);
    expect(evaluate(state, 'B')).toBeLessThan(0);
    const won = { ...state, status: 'won' as const, winner: 'W' as const };
    expect(evaluate(won, 'W')).toBeGreaterThan(90_000);
    expect(evaluate(won, 'B')).toBeLessThan(-90_000);
    expect(evaluate({ ...state, status: 'draw' as const }, 'W')).toBe(0);
  });

  it('plays a complete deterministic game and reaches a result', () => {
    let state = setup('W');
    const rng = lcg(2026);
    for (let action = 0; action < 500 && state.status === 'playing'; action += 1) {
      const level = state.turn === 'W' ? 'companion' : 'easy';
      const chosen = chooseMove(state, level, rng);
      expect(chosen).not.toBeNull();
      const result = apply(state, chosen as Move);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.status).not.toBe('playing');
    expect(['won', 'draw']).toContain(state.status);
  });
});

describe('hints', () => {
  it('explains a mill-forming placement', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    const explanation = explainMove(state, place(2));
    expect(explanation.kind).toBe('mill');
    expect(explanation.side).toBe('B');
  });

  it('explains a blocking move', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    expect(threatenedPoints(state, 'B')).toContain(10);
    const explanation = explainMove(state, place(10));
    expect(explanation.kind).toBe('block');
  });

  it('explains a free capture and an all-in-mills capture', () => {
    const board = boardFrom([
      [16, 'W'], [17, 'W'], [18, 'W'], [19, 'W'],
      [4, 'B'], [5, 'B'], [6, 'B'], [0, 'B'],
    ]);
    const state = fixture({ board, pendingCapture: 'B', turn: 'W' });
    expect(explainMove(state, capture(0)).kind).toBe('capture');
    const allMills = boardFrom([
      [16, 'W'], [17, 'W'], [18, 'W'],
      [4, 'B'], [5, 'B'], [6, 'B'], [8, 'B'], [9, 'B'], [10, 'B'],
    ]);
    const allState = fixture({ board: allMills, pendingCapture: 'B', turn: 'W' });
    expect(explainMove(allState, capture(4)).kind).toBe('captureAll');
  });

  it('explains a development move when nothing is immediate', () => {
    const state = playSequence([place(0), place(8), place(1), place(9)]);
    const explanation = explainMove(state, place(7));
    expect(['two', 'space', 'quiet', 'block']).toContain(explanation.kind);
    expect(explanation.side).toBe('W');
  });
});

describe('misc invariants', () => {
  it('counts empty points and has no moves when the board is full', () => {
    const full = Array.from({ length: 24 }, (_, point) => (point % 2 === 0 ? 'W' : 'B')) as Cell[];
    expect(emptyPoints(full)).toEqual([]);
    expect(hasAnyStep(full, 'W')).toBe(false);
  });
});
