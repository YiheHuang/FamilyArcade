import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  apply,
  applySeat,
  handCounts,
  keyOf,
  legalMoves,
  legalMovesFrom,
  mustPlaceQueen,
  neighbors,
  normalMoves,
  other,
  queenSurrounded,
  setup,
  surroundCount,
  topPiece,
  view,
  type GameState,
  type Move,
  type Piece,
  type PieceKind,
  type Player,
} from '../src/game/hive';
import { addResult, EMPTY_RECORD, normalizeRecord } from '../src/storage';

let pieceId = 0;

function cell(
  q: number,
  r: number,
  ...pieces: [PieceKind, Player][]
): [string, Piece[]] {
  return [
    `${q},${r}`,
    pieces.map(([kind, owner]) => {
      pieceId += 1;
      return { id: `test-${pieceId}`, kind, owner };
    }),
  ];
}

function craft(turn: Player, entries: [string, Piece[]][]): GameState {
  return {
    cells: Object.fromEntries(entries),
    turn,
    status: 'playing',
    winner: null,
    first: 'W',
    moveCount: 0,
    last: null,
  };
}

function place(kind: PieceKind, q: number, r: number): Move {
  return { type: 'place', kind, at: { q, r } };
}

function slide(fq: number, fr: number, tq: number, tr: number): Move {
  return { type: 'move', from: { q: fq, r: fr }, to: { q: tq, r: tr } };
}

function play(state: GameState, moves: Move[]): GameState {
  let current = state;
  for (const move of moves) {
    const result = apply(current, move);
    expect(result.ok, `move ${JSON.stringify(move)} should be legal`).toBe(true);
    current = result.state;
  }
  return current;
}

function hasMove(moves: Move[], move: Move): boolean {
  return moves.some((candidate) => {
    if (candidate.type !== move.type) return false;
    if (candidate.type === 'place' && move.type === 'place') {
      return (
        candidate.kind === move.kind &&
        candidate.at.q === move.at.q &&
        candidate.at.r === move.at.r
      );
    }
    if (candidate.type === 'move' && move.type === 'move') {
      return (
        candidate.from.q === move.from.q &&
        candidate.from.r === move.from.r &&
        candidate.to.q === move.to.q &&
        candidate.to.r === move.to.r
      );
    }
    return false;
  });
}

function winningBoard(owner: Player): GameState {
  return craft(owner, [
    cell(0, 0, ['queen', other(owner)]),
    cell(1, 0, ['queen', owner]),
    cell(1, -1, ['ant', owner]),
    cell(0, -1, ['ant', owner]),
    cell(-1, 1, ['ant', owner]),
    cell(0, 1, ['ant', owner]),
    cell(-1, -1, ['ant', owner]),
  ]);
}

const WINNING_MOVE = slide(-1, -1, -1, 0);

describe('Hive setup and placement', () => {
  it('starts empty with eleven pieces in each hand and Amber first', () => {
    const state = setup('W');
    expect(Object.keys(state.cells)).toHaveLength(0);
    expect(state.turn).toBe('W');
    expect(handCounts(state, 'W')).toEqual({
      queen: 1,
      ant: 3,
      beetle: 2,
      grasshopper: 3,
      spider: 2,
    });
    expect(handCounts(state, 'B').ant).toBe(3);
    expect(legalMoves(state)).toHaveLength(35);
  });

  it('lets the first player open anywhere and the second player open beside it', () => {
    const first = play(setup('W'), [place('ant', 0, 0), place('ant', 1, 0)]);
    expect(first.moveCount).toBe(2);
    expect(first.turn).toBe('W');

    const bad = apply(setup('W'), place('ant', 4, 4));
    expect(bad.ok).toBe(true);
    const blackTurn = apply(bad.state, place('ant', 2, 2));
    expect(blackTurn.ok).toBe(false);
    expect(blackTurn.error).toBe('illegal');
  });

  it('requires a new piece to touch your own hive and never an enemy', () => {
    const state = play(setup('W'), [
      place('ant', 0, 0),
      place('ant', 1, 0),
    ]);
    expect(apply(state, place('ant', 0, -1)).ok).toBe(true);
    expect(apply(state, place('ant', 2, 0)).error).toBe('illegal');
    expect(apply(state, place('ant', 0, 1)).error).toBe('illegal');
    expect(apply(state, place('ant', 0, 1)).state).toBe(state);
  });

  it('rejects occupied cells, empty hands and malformed coordinates', () => {
    const state = play(setup('W'), [place('ant', 0, 0)]);
    expect(apply(state, place('ant', 0, 0)).error).toBe('occupied');
    expect(apply(state, place('queen', 0.5, 0)).error).toBe('ill-formed');
    expect(apply(state, { type: 'place', kind: 'dragon' as PieceKind, at: { q: 0, r: 1 } }).error).toBe('ill-formed');
  });

  it('uses the top piece colour for placement next to a mixed stack', () => {
    const allowed = craft('W', [
      cell(0, 0, ['queen', 'W']),
      cell(1, 0, ['ant', 'B'], ['beetle', 'W']),
    ]);
    expect(apply(allowed, place('ant', 0, 1)).ok).toBe(true);

    const blocked = craft('W', [
      cell(0, 0, ['queen', 'W']),
      cell(1, 0, ['ant', 'W'], ['beetle', 'B']),
    ]);
    expect(apply(blocked, place('ant', 0, 1)).error).toBe('illegal');
  });

  it('does not mutate the state passed to apply', () => {
    const state = play(setup('W'), [place('ant', 0, 0)]);
    const snapshot = JSON.stringify(state);
    apply(state, place('spider', 0, 1));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('Hive queen deadline', () => {
  function fourthTurn(): GameState {
    return play(setup('W'), [
      place('ant', 0, 0),
      place('ant', 1, 0),
      place('ant', 0, -1),
      place('ant', 2, 0),
      place('spider', -1, 0),
      place('spider', 2, -1),
    ]);
  }

  it('forces the queen onto the board on the fourth turn', () => {
    const state = fourthTurn();
    expect(state.turn).toBe('W');
    expect(mustPlaceQueen(state)).toBe(true);
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.type === 'place' && move.kind === 'queen')).toBe(true);
    expect(apply(state, place('beetle', 0, 1)).error).toBe('must-place-queen');
    expect(apply(state, place('queen', -1, 1)).ok).toBe(true);
  });

  it('allows the queen early and stops forcing once it is on the board', () => {
    const state = play(setup('W'), [
      place('queen', 0, 0),
      place('ant', 1, 0),
      place('ant', 0, -1),
      place('ant', 2, 0),
    ]);
    expect(mustPlaceQueen(state)).toBe(false);
  });

  it('does not let a piece move before the queen is placed', () => {
    const state = play(setup('W'), [
      place('ant', 0, 0),
      place('ant', 1, 0),
      place('ant', 0, -1),
      place('ant', 2, 0),
    ]);
    expect(state.turn).toBe('W');
    expect(mustPlaceQueen(state)).toBe(false);
    expect(apply(state, slide(0, -1, -1, 0)).error).toBe('queen-first');
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.type === 'place')).toBe(true);
  });
});

describe('Hive movement', () => {
  it('moves the queen one space and respects a closed gate', () => {
    const state = craft('W', [
      cell(0, 0, ['queen', 'W']),
      cell(1, -1, ['ant', 'B']),
      cell(-1, 0, ['ant', 'B']),
      cell(1, -2, ['ant', 'B']),
      cell(0, -2, ['ant', 'B']),
      cell(-1, -1, ['ant', 'B']),
      cell(1, 0, ['ant', 'B']),
      cell(1, 1, ['ant', 'B']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(moves.length).toBeGreaterThan(0);
    expect(hasMove(moves, slide(0, 0, 0, 1))).toBe(true);
    expect(hasMove(moves, slide(0, 0, 0, -1))).toBe(false);
    for (const move of moves) {
      if (move.type !== 'move') continue;
      expect(Math.abs(move.to.q) + Math.abs(move.to.r) + Math.abs(-move.to.q - move.to.r)).toBeLessThanOrEqual(2);
    }
  });

  it('rejects a move that would split the hive', () => {
    const state = craft('W', [
      cell(0, 0, ['ant', 'W']),
      cell(1, 0, ['beetle', 'W']),
      cell(-1, 0, ['queen', 'W']),
    ]);
    expect(legalMovesFrom(state, { q: 0, r: 0 })).toHaveLength(0);
  });

  it('slides an ant around the perimeter and blocks a sealed gap', () => {
    const state = craft('W', [
      cell(0, 0, ['ant', 'W']),
      cell(1, -1, ['queen', 'W'], ['ant', 'B']),
      cell(-1, 0, ['ant', 'B']),
      cell(1, -2, ['ant', 'B']),
      cell(0, -2, ['ant', 'B']),
      cell(-1, -1, ['ant', 'B']),
      cell(1, 0, ['ant', 'B']),
      cell(1, 1, ['ant', 'B']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(hasMove(moves, slide(0, 0, 0, -1))).toBe(false);
    expect(hasMove(moves, slide(0, 0, 0, 1))).toBe(true);
    expect(moves.length).toBeGreaterThan(1);
  });

  it('lets an ant reach a distant edge space', () => {
    const state = craft('W', [
      cell(0, 0, ['ant', 'W']),
      cell(1, 0, ['queen', 'W'], ['ant', 'B']),
      cell(2, 0, ['ant', 'B']),
      cell(3, 0, ['ant', 'B']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(hasMove(moves, slide(0, 0, 3, 1))).toBe(true);
    expect(hasMove(moves, slide(0, 0, 0, -1))).toBe(false);
  });

  it('lets the beetle climb onto the hive and pin the piece underneath', () => {
    const start = craft('W', [
      cell(0, 0, ['beetle', 'W']),
      cell(1, 0, ['ant', 'B']),
      cell(1, -1, ['queen', 'W'], ['ant', 'B']),
      cell(0, -1, ['ant', 'W']),
    ]);
    const climbed = apply(start, slide(0, 0, 1, 0));
    expect(climbed.ok).toBe(true);
    expect(climbed.state.cells['1,0']).toHaveLength(2);
    expect(topPiece(climbed.state, { q: 1, r: 0 })?.owner).toBe('W');

    const black = { ...climbed.state, turn: 'B' as const };
    expect(legalMoves(black).some((move) => move.type === 'move' && keyOf(move.from) === '1,0')).toBe(false);

    const off = apply({ ...climbed.state, turn: 'W' }, slide(1, 0, 0, 0));
    expect(off.ok).toBe(true);
    expect(off.state.cells['1,0']).toHaveLength(1);
    expect(off.state.cells['0,0'][0].owner).toBe('W');
  });

  it('blocks a beetle climb through a height-two gate', () => {
    const state = craft('W', [
      cell(0, 0, ['beetle', 'W']),
      cell(2, 0, ['queen', 'W']),
      cell(1, 0, ['ant', 'B']),
      cell(1, -1, ['ant', 'B'], ['beetle', 'B']),
      cell(0, 1, ['ant', 'B'], ['beetle', 'B']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(hasMove(moves, slide(0, 0, 1, 0))).toBe(false);
  });

  it('makes the grasshopper jump a straight line of pieces', () => {
    const state = craft('W', [
      cell(0, 0, ['grasshopper', 'W']),
      cell(1, 0, ['queen', 'W'], ['ant', 'B']),
      cell(2, 0, ['ant', 'W']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(moves).toEqual([slide(0, 0, 3, 0)]);
    expect(apply(state, slide(0, 0, 3, 0)).ok).toBe(true);
  });

  it('only jumps and never steps into an adjacent empty space', () => {
    const state = craft('W', [
      cell(0, 0, ['grasshopper', 'W']),
      cell(0, 1, ['queen', 'W'], ['ant', 'W']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(hasMove(moves, slide(0, 0, 0, 2))).toBe(true);
    expect(moves.some((move) => move.type === 'move' && move.to.q === 1 && move.to.r === 0)).toBe(false);
  });

  it('moves the spider exactly three spaces and no fewer', () => {
    const state = craft('W', [
      cell(0, 0, ['spider', 'W']),
      cell(1, 0, ['queen', 'W'], ['ant', 'B']),
      cell(1, -1, ['ant', 'B']),
      cell(0, -1, ['ant', 'B']),
      cell(-1, 0, ['ant', 'B']),
    ]);
    const moves = legalMovesFrom(state, { q: 0, r: 0 });
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      if (move.type !== 'move') continue;
      expect(keyOf(move.to)).not.toBe('0,0');
      expect(move.to.q === 0 && move.to.r === 1).toBe(false);
    }
    expect(apply(state, moves[0]).ok).toBe(true);
  });

  it('refuses a spider move when no three-step edge path exists', () => {
    const state = craft('W', [
      cell(0, 0, ['spider', 'W']),
      cell(1, 0, ['ant', 'B']),
      cell(1, -1, ['ant', 'B']),
      cell(0, -1, ['ant', 'B']),
      cell(-1, 0, ['ant', 'B']),
      cell(-1, 1, ['ant', 'B']),
      cell(0, 1, ['ant', 'B']),
      cell(2, 0, ['queen', 'W']),
    ]);
    expect(legalMovesFrom(state, { q: 0, r: 0 })).toHaveLength(0);
  });
});

describe('Hive victory', () => {
  it('wins by moving the last piece around the enemy queen', () => {
    const state = winningBoard('W');
    expect(surroundCount(state, 'B')).toBe(5);
    const result = apply(state, WINNING_MOVE);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('W');
    expect(queenSurrounded(result.state, 'B')).toBe(true);
  });

  it('loses when the move closes the last gap around your own queen', () => {
    const state = craft('W', [
      cell(0, 0, ['queen', 'W']),
      cell(1, 0, ['ant', 'W']),
      cell(1, -1, ['ant', 'W']),
      cell(0, -1, ['ant', 'W']),
      cell(-1, 1, ['ant', 'W']),
      cell(0, 1, ['ant', 'W']),
      cell(-1, -1, ['ant', 'W']),
    ]);
    const result = apply(state, slide(-1, -1, -1, 0));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('B');
  });

  it('does not count a beetle on top of the queen as one of the six sides', () => {
    const state = craft('B', [
      cell(0, 0, ['queen', 'W'], ['beetle', 'B']),
      cell(1, 0, ['ant', 'B']),
      cell(1, -1, ['ant', 'B']),
      cell(0, -1, ['ant', 'B']),
      cell(-1, 0, ['ant', 'B']),
    ]);
    expect(surroundCount(state, 'W')).toBe(4);
    expect(queenSurrounded(state, 'W')).toBe(false);
  });

  it('forces a shut-out player to pass without changing the board', () => {
    const state = craft('B', [
      cell(0, 0, ['queen', 'B']),
      cell(1, 0, ['queen', 'W']),
      cell(1, -1, ['ant', 'W']),
      cell(0, -1, ['ant', 'W']),
      cell(-1, 1, ['ant', 'W']),
      cell(0, 1, ['ant', 'W']),
    ]);
    expect(normalMoves(state)).toHaveLength(0);
    expect(legalMoves(state)).toEqual([{ type: 'pass' }]);
    const result = apply(state, { type: 'pass' });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe('W');
    expect(result.state.status).toBe('playing');
    expect(result.state.moveCount).toBe(1);
    expect(JSON.stringify(result.state.cells)).toBe(JSON.stringify(state.cells));
  });

  it('refuses moves after the game has ended', () => {
    const state = play(winningBoard('W'), [WINNING_MOVE]);
    expect(state.status).toBe('won');
    expect(apply(state, place('ant', 3, 0)).error).toBe('game-over');
    expect(legalMoves(state)).toHaveLength(0);
  });
});

describe('Hive seats and views', () => {
  it('maps seats to Amber and Onyx and rejects the wrong turn', () => {
    const state = setup('W');
    expect(applySeat(state, 1, place('ant', 0, 0)).error).toBe('wrong-turn');
    expect(applySeat(state, 2, place('ant', 0, 0)).error).toBe('bad-seat');
    const after = applySeat(state, 0, place('ant', 0, 0));
    expect(after.ok).toBe(true);
    expect(applySeat(after.state, 1, place('ant', 1, 0)).ok).toBe(true);
  });

  it('gives each seat a public view with only that seat able to act', () => {
    const state = play(setup('W'), [place('ant', 0, 0)]);
    expect(view(state, 0).player).toBe('W');
    expect(view(state, 1).player).toBe('B');
    expect(view(state, 1).canMove).toBe(true);
    expect(view(state, 0).canMove).toBe(false);
  });
});

describe('Hive AI and hints', () => {
  it('returns a legal move at every level', () => {
    const state = play(setup('W'), [
      place('ant', 0, 0),
      place('ant', 1, 0),
      place('beetle', 0, -1),
      place('spider', 2, 0),
    ]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.31);
      expect(move).not.toBeNull();
      if (move) expect(apply(state, move).ok).toBe(true);
    }
  });

  it('takes an immediate surround at every level', () => {
    const state = winningBoard('W');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.9);
      expect(move).toEqual(WINNING_MOVE);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = play(setup('W'), [
      place('ant', 0, 0),
      place('ant', 1, 0),
      place('beetle', 0, -1),
      place('spider', 2, 0),
    ]);
    const a = chooseMove(state, 'normal', () => 0.42);
    const b = chooseMove(state, 'normal', () => 0.42);
    expect(a).toEqual(b);
  });

  it('explains a winning hint', () => {
    const state = winningBoard('W');
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(hint?.kind).toBe('win');
    expect(hint && apply(state, hint.move).state.winner).toBe('W');
  });

  it('returns no hint after the game ends', () => {
    const state = play(winningBoard('W'), [WINNING_MOVE]);
    expect(hintFor(state)).toBeNull();
  });
});

describe('Hive family record', () => {
  const winFor = (winner: Player): GameState => ({
    cells: {},
    turn: other(winner),
    status: 'won',
    winner,
    first: 'W',
    moveCount: 42,
    last: null,
  });

  it('counts winners, modes and move totals', () => {
    const first = addResult(EMPTY_RECORD, winFor('W'), { mode: 'local' }, 1000);
    const second = addResult(first, winFor('B'), { mode: 'ai', level: 'hard' }, 2000);
    const third = addResult(second, winFor('W'), { mode: 'lan' }, 3000);
    expect(third.games).toBe(3);
    expect([third.winsW, third.winsB]).toEqual([2, 1]);
    expect(third.byMode).toEqual({ ai: 1, local: 1, lan: 1 });
    expect(third.recent.map((entry) => entry.winner)).toEqual(['W', 'B', 'W']);
    expect(third.recent[1].level).toBe('hard');
    expect(third.recent[0].moves).toBe(42);
  });

  it('tracks current and best same-winner streaks', () => {
    const first = addResult(EMPTY_RECORD, winFor('W'), { mode: 'local' }, 1000);
    const second = addResult(first, winFor('W'), { mode: 'ai' }, 2000);
    const third = addResult(second, winFor('B'), { mode: 'local' }, 3000);
    expect(first.streak).toBe(1);
    expect(second.streak).toBe(2);
    expect(second.bestStreak).toBe(2);
    expect(third.streak).toBe(1);
    expect(third.bestStreak).toBe(2);
    expect(third.lastWinner).toBe('B');
  });

  it('records a mutual shut-out draw', () => {
    const draw: GameState = {
      cells: {},
      turn: 'B',
      status: 'draw',
      winner: null,
      first: 'W',
      moveCount: 30,
      last: { type: 'pass' },
    };
    const record = addResult(EMPTY_RECORD, draw, { mode: 'local' }, 4000);
    expect(record.games).toBe(1);
    expect(record.draws).toBe(1);
    expect(record.winsW).toBe(0);
    expect(record.winsB).toBe(0);
    expect(record.lastWinner).toBe('draw');
    expect(record.recent[0].winner).toBe('draw');
  });

  it('keeps only the eight most recent games', () => {
    let record = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addResult(record, winFor('W'), { mode: 'local' }, 1000 + index);
    }
    expect(record.games).toBe(11);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
  });

  it('normalizes a legacy record without mode or recent fields', () => {
    const record = normalizeRecord({
      games: 4,
      winsW: 3,
      winsB: 1,
      streak: 2,
      lastWinner: 'W',
    });
    expect(record.games).toBe(4);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
    expect(record.recent).toEqual([]);
    expect(record.bestStreak).toBe(0);
  });

  it('maps every board neighbour exactly once', () => {
    const around = neighbors({ q: 0, r: 0 });
    expect(new Set(around.map(keyOf)).size).toBe(6);
    expect(around.map(keyOf)).toEqual(
      expect.arrayContaining(['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']),
    );
  });
});
