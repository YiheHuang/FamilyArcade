import { describe, expect, it } from 'vitest';
import {
  chooseMove,
  explainMove,
  routeCosts,
  shortestDistance,
  type AiLevel,
} from '../src/ai/ai';
import {
  CELL_COUNT,
  SIZE,
  apply,
  applySeat,
  areNeighbours,
  colOf,
  hasWon,
  indexOf,
  legal,
  legalMoves,
  neighbours,
  resultText,
  rowOf,
  setup,
  stoneCount,
  view,
  winningPath,
  type GameState,
} from '../src/game/hex';

function play(moves: number[]): GameState {
  let state = setup('R');
  for (const move of moves) {
    const result = apply(state, move);
    if (!result.ok) throw new Error(`illegal move ${move}: ${result.error}`);
    state = result.state;
  }
  return state;
}

function interleave(red: number[], blue: number[]): number[] {
  const moves: number[] = [];
  for (let i = 0; i < Math.max(red.length, blue.length); i++) {
    if (i < red.length) moves.push(red[i]);
    if (i < blue.length) moves.push(blue[i]);
  }
  return moves;
}

const column = (col: number, rows: number[]) => rows.map((row) => indexOf(row, col));
const row = (r: number, cols: number[]) => cols.map((col) => indexOf(r, col));

const RED_DOWN = column(5, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const BLUE_SIDE = column(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const BLUE_ACROSS = row(5, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const RED_ACROSS = row(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function redWinState(): GameState {
  return play(interleave(RED_DOWN, BLUE_SIDE));
}

function blueWinState(): GameState {
  return play(interleave([...RED_ACROSS, indexOf(1, 1)], BLUE_ACROSS));
}

function immediateWinState(): GameState {
  return play(
    interleave(
      column(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      column(10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ),
  );
}

function blockState(): GameState {
  // Ten Red stones that are deliberately not adjacent, so Red has no win of
  // its own. Blue owns row 5 from column 0 to column 9 and threatens (5,10).
  const scatter = [
    indexOf(0, 2),
    indexOf(0, 6),
    indexOf(2, 4),
    indexOf(2, 8),
    indexOf(4, 6),
    indexOf(4, 10),
    indexOf(6, 2),
    indexOf(6, 6),
    indexOf(8, 4),
    indexOf(8, 8),
  ];
  return play(interleave(scatter, row(5, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])));
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Hex board geometry', () => {
  it('creates an 11×11 empty rhombus with Red to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(CELL_COUNT);
    expect(state.board).toHaveLength(121);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(state.turn).toBe('R');
    expect(state.status).toBe('playing');
    expect(legalMoves(state)).toHaveLength(121);
  });

  it('maps coordinates to indices and back', () => {
    for (let index = 0; index < CELL_COUNT; index++) {
      expect(indexOf(rowOf(index), colOf(index))).toBe(index);
    }
    expect(indexOf(0, 0)).toBe(0);
    expect(indexOf(10, 10)).toBe(120);
    expect(rowOf(120)).toBe(10);
    expect(colOf(120)).toBe(10);
  });

  it('gives interior cells six neighbours and corners two', () => {
    expect(neighbours(indexOf(5, 5))).toHaveLength(6);
    expect(neighbours(indexOf(0, 0))).toHaveLength(2);
    expect(neighbours(indexOf(10, 10))).toHaveLength(2);
    for (let index = 0; index < CELL_COUNT; index++) {
      for (const next of neighbours(index)) {
        expect(areNeighbours(next, index)).toBe(true);
      }
    }
  });

  it('can start with Blue when requested', () => {
    const state = setup('B');
    expect(state.turn).toBe('B');
    expect(state.first).toBe('B');
  });
});

describe('Hex rules', () => {
  it('alternates turns and rejects an occupied cell', () => {
    const first = apply(setup(), indexOf(5, 5));
    expect(first.ok).toBe(true);
    expect(first.state.turn).toBe('B');
    expect(first.state.moves).toEqual([60]);
    const again = apply(first.state, indexOf(5, 5));
    expect(again.ok).toBe(false);
    expect(again.error).toBe('occupied');
  });

  it('rejects non-integer and out-of-range cells', () => {
    const state = setup();
    expect(apply(state, -1).error).toBe('bad-cell');
    expect(apply(state, 121).error).toBe('bad-cell');
    expect(apply(state, 3.5).error).toBe('bad-cell');
    expect(apply(state, Number.NaN).error).toBe('bad-cell');
    expect(legal(state, 0)).toBe(true);
    expect(legal(state, 121)).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const state = setup();
    const before = state.board.slice();
    const result = apply(state, indexOf(4, 4));
    expect(result.ok).toBe(true);
    expect(state.board).toEqual(before);
    expect(state.moves).toEqual([]);
    expect(result.state.board).not.toBe(state.board);
  });

  it('removes played cells from the legal list', () => {
    const state = play([0, 1, 2]);
    expect(legalMoves(state)).not.toContain(0);
    expect(legalMoves(state)).not.toContain(1);
    expect(legalMoves(state)).not.toContain(2);
    expect(legalMoves(state)).toHaveLength(118);
  });

  it('Red wins by connecting north to south', () => {
    const state = redWinState();
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.path).toHaveLength(11);
    expect(rowOf(state.path![0])).toBe(0);
    expect(rowOf(state.path![state.path!.length - 1])).toBe(SIZE - 1);
    expect(resultText(state)).toBe('red');
    expect(hasWon(state.board, 'R')).toBe(true);
    expect(hasWon(state.board, 'B')).toBe(false);
  });

  it('Blue wins by connecting west to east', () => {
    const state = blueWinState();
    expect(state.status).toBe('won');
    expect(state.winner).toBe('B');
    expect(state.path).toHaveLength(11);
    expect(colOf(state.path![0])).toBe(0);
    expect(colOf(state.path![state.path!.length - 1])).toBe(SIZE - 1);
    expect(resultText(state)).toBe('blue');
  });

  it('returns a genuinely adjacent winning path in one colour', () => {
    const state = redWinState();
    const path = state.path!;
    for (let i = 1; i < path.length; i++) {
      expect(areNeighbours(path[i - 1], path[i])).toBe(true);
      expect(state.board[path[i]]).toBe('R');
    }
    expect(stoneCount(state.board, 'R')).toBe(11);
  });

  it('does not give Red a win for crossing west to east', () => {
    const state = play(interleave([...RED_ACROSS, indexOf(0, 10)], BLUE_SIDE.slice(0, 10)));
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });

  it('does not give Blue a win for crossing north to south', () => {
    const state = play(
      interleave(
        [...row(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), indexOf(2, 2)],
        column(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      ),
    );
    expect(state.status).toBe('playing');
    expect(hasWon(state.board, 'B')).toBe(false);
  });

  it('detects a corner-to-corner connection', () => {
    const state = play(
      interleave(column(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), column(10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    expect(state.status).toBe('won');
    expect(state.winner).toBe('R');
    expect(state.path![0]).toBe(indexOf(0, 0));
    expect(state.path![state.path!.length - 1]).toBe(indexOf(10, 0));
  });

  it('refuses moves after the game is over', () => {
    const state = redWinState();
    const result = apply(state, legalMoves(state)[0] ?? 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('game-over');
    expect(legalMoves(state)).toEqual([]);
  });

  it('enforces seats and turn order', () => {
    const initial = setup();
    expect(applySeat(initial, 1, 0).error).toBe('wrong-turn');
    const red = applySeat(initial, 0, indexOf(5, 5));
    expect(red.ok).toBe(true);
    expect(red.state.turn).toBe('B');
    expect(applySeat(red.state, 0, indexOf(5, 6)).error).toBe('wrong-turn');
    expect(applySeat(red.state, 1, indexOf(5, 6)).ok).toBe(true);
  });

  it('rejects seat moves once the game is won', () => {
    const state = redWinState();
    expect(applySeat(state, 1, 0).error).toBe('game-over');
  });

  it('gives each seat a public view without sharing internals', () => {
    const state = play([indexOf(5, 5), indexOf(5, 6)]);
    const red = view(state, 0);
    const blue = view(state, 1);
    expect(red.player).toBe('R');
    expect(blue.player).toBe('B');
    expect(red.canMove).toBe(true);
    expect(blue.canMove).toBe(false);
    expect(red.moveCount).toBe(2);
    expect(red.lastMove).toBe(indexOf(5, 6));
    expect(red.board).not.toBe(state.board);
    expect(red.board).toEqual(state.board);
  });

  it('reports no winner while the board is still open', () => {
    expect(resultText(setup())).toBeNull();
  });

  it('winningPath ignores the wrong colour and empty boards', () => {
    expect(winningPath(Array(121).fill(null), 'R')).toBeNull();
    const state = blueWinState();
    expect(winningPath(state.board, 'R')).toBeNull();
    expect(winningPath(state.board, 'B')).not.toBeNull();
  });

  it('counts stones for the family record', () => {
    const state = play([0, 1, 2]);
    expect(stoneCount(state.board, 'R')).toBe(2);
    expect(stoneCount(state.board, 'B')).toBe(1);
  });

  it('plays seeded random games to a decisive finish', () => {
    for (let game = 0; game < 8; game++) {
      let state = setup();
      const rng = seeded(100 + game);
      while (state.status === 'playing') {
        const moves = legalMoves(state);
        const move = moves[Math.floor(rng() * moves.length)];
        const result = apply(state, move);
        expect(result.ok).toBe(true);
        state = result.state;
      }
      expect(state.status).toBe('won');
      expect(state.winner === 'R' || state.winner === 'B').toBe(true);
      expect(state.path!.length).toBeGreaterThanOrEqual(11);
      expect(state.moves.length).toBeLessThanOrEqual(121);
    }
  });
});

describe('Hex shortest-path potential', () => {
  it('needs eleven empty cells on an empty board', () => {
    const state = setup();
    expect(shortestDistance(state.board, 'R')).toBe(11);
    expect(shortestDistance(state.board, 'B')).toBe(11);
  });

  it('is zero when a connection already exists', () => {
    const state = redWinState();
    expect(shortestDistance(state.board, 'R')).toBe(0);
    expect(shortestDistance(state.board, 'B')).toBeGreaterThan(0);
  });

  it('counts the single gap in an almost connected route', () => {
    const board = Array(121).fill(null);
    for (const cell of column(5, [0, 1, 2, 3, 4, 6, 7, 8, 9, 10])) board[cell] = 'R';
    expect(shortestDistance(board, 'R')).toBe(1);
  });

  it('exposes both route costs to the UI', () => {
    const state = redWinState();
    const costs = routeCosts(state.board);
    expect(costs.red).toBe(0);
    expect(costs.blue).toBeGreaterThan(0);
  });
});

describe('Hex AI', () => {
  const levels: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

  it('always returns a legal move on every level', () => {
    const state = play([indexOf(5, 5), indexOf(4, 4), indexOf(6, 5)]);
    const legalNow = legalMoves(state);
    for (const level of levels) {
      const move = chooseMove(state, level, seeded(17));
      expect(legalNow).toContain(move);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = play([indexOf(5, 5), indexOf(3, 3)]);
    for (const level of levels) {
      const a = chooseMove(state, level, seeded(99));
      const b = chooseMove(state, level, seeded(99));
      expect(a).toBe(b);
    }
  });

  it('takes an immediate win on companion, normal and hard', () => {
    const state = immediateWinState();
    expect(state.turn).toBe('R');
    for (const level of ['companion', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, seeded(4))).toBe(indexOf(10, 0));
    }
  });

  it('blocks an immediate loss on companion, normal and hard', () => {
    const state = blockState();
    expect(state.turn).toBe('R');
    for (const level of ['companion', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, seeded(4))).toBe(indexOf(5, 10));
    }
  });

  it('lets Easy pick the first legal move when the RNG says so', () => {
    const state = setup();
    expect(chooseMove(state, 'easy', () => 0)).toBe(0);
  });

  it('returns -1 when the game is already over', () => {
    const state = redWinState();
    for (const level of levels) expect(chooseMove(state, level, seeded(1))).toBe(-1);
  });

  it('explains a winning hint', () => {
    const state = immediateWinState();
    expect(explainMove(state, indexOf(10, 0))).toBe('win');
  });

  it('explains a blocking hint', () => {
    const state = blockState();
    expect(explainMove(state, indexOf(5, 10))).toBe('block');
  });

  it('returns a reason for any legal opening move', () => {
    const reasons = new Set(['win', 'block', 'connect', 'route', 'center', 'space']);
    expect(reasons.has(explainMove(setup(), indexOf(5, 5)))).toBe(true);
  });

  it('keeps Hard inside a sensible time budget on a fresh board', () => {
    const started = Date.now();
    const move = chooseMove(setup(), 'hard', seeded(2027));
    expect(move).toBeGreaterThanOrEqual(0);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
