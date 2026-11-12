import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  apply,
  applySeat,
  canDrop,
  emptyGame,
  hasAnyLegalMove,
  isInCheck,
  isSquareAttacked,
  legalMoves,
  makeMoveUnchecked,
  piece,
  positionKey,
  setup,
  stateFromView,
  view,
  type GameState,
  type Move,
  type PieceType,
  type Side,
} from '../src/game/shogi';

function move(from: number, to: number, promote = false): Move {
  return { kind: 'move', from, to, promote };
}

function drop(type: Extract<PieceType, 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P'>, to: number): Move {
  return { kind: 'drop', type, to };
}

function place(
  state: GameState,
  index: number,
  type: PieceType,
  side: Side,
  promoted = false,
): GameState {
  state.board[index] = piece(type, side, promoted);
  return state;
}

function gameWith(
  turn: Side,
  pieces: [number, PieceType, Side, boolean?][],
): GameState {
  const state = emptyGame(turn);
  for (const [index, type, side, promoted] of pieces) {
    place(state, index, type, side, Boolean(promoted));
  }
  return state;
}

function withHand(state: GameState, side: Side, type: Extract<PieceType, 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P'>, count: number): GameState {
  state.hands[side][type] = count;
  return state;
}

function movesFrom(state: GameState, from: number): Move[] {
  return legalMoves(state).filter((candidate) => candidate.kind === 'move' && candidate.from === from);
}

function mates(): GameState {
  // Black rook 12 -> 13 is mate: the rook is defended twice and every king
  // escape is covered by a gold.
  return gameWith('b', [
    [76, 'K', 'b'],
    [4, 'K', 'w'],
    [2, 'G', 'b'],
    [6, 'G', 'b'],
    [21, 'G', 'b'],
    [23, 'G', 'b'],
    [12, 'R', 'b'],
  ]);
}

describe('Shogi setup and movement', () => {
  it('sets up the traditional 9×9 position with Black to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(81);
    expect(state.board.filter(Boolean)).toHaveLength(40);
    expect(state.turn).toBe('b');
    expect(state.board[4]).toMatchObject({ type: 'K', side: 'w' });
    expect(state.board[76]).toMatchObject({ type: 'K', side: 'b' });
    expect(state.board[58]).toMatchObject({ type: 'P', side: 'b' });
    expect(state.board[22]).toMatchObject({ type: 'P', side: 'w' });
    expect(state.board[64]).toMatchObject({ type: 'B', side: 'b' });
    expect(state.board[70]).toMatchObject({ type: 'R', side: 'b' });
    expect(state.board[10]).toMatchObject({ type: 'R', side: 'w' });
    expect(state.board[16]).toMatchObject({ type: 'B', side: 'w' });
    expect(legalMoves(state)).toHaveLength(30);
  });

  it('alternates turns, rejects occupied squares and bad shapes', () => {
    const first = apply(setup(), move(58, 49));
    expect(first.ok).toBe(true);
    expect(first.state.turn).toBe('w');
    expect(apply(first.state, move(58, 49)).error).toBe('no-piece');
    expect(apply(first.state, move(22, 21)).error).toBe('occupied');
    expect(apply(first.state, move(49, 90)).error).toBe('bad-square');
  });

  it('moves silver, gold, knight, lance, rook and bishop correctly', () => {
    expect(
      movesFrom(setup(), 78)
        .map((entry) => entry.kind === 'move' && entry.to)
        .sort(),
    ).toEqual([68, 69]);
    expect(movesFrom(setup(), 77)).toHaveLength(3);

    const knight = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [66, 'N', 'b'],
    ]);
    expect(movesFrom(knight, 66).map((entry) => entry.kind === 'move' && entry.to).sort()).toEqual([47, 49]);

    const lance = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [58, 'L', 'b'],
    ]);
    expect(new Set(movesFrom(lance, 58).map((entry) => entry.kind === 'move' && entry.to)).size).toBe(6);

    const rook = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [40, 'R', 'b'],
      [31, 'P', 'b'],
      [49, 'P', 'w'],
    ]);
    const rookTargets = movesFrom(rook, 40).map((entry) => entry.kind === 'move' && entry.to);
    expect(rookTargets).toContain(49);
    expect(rookTargets).not.toContain(58);
    expect(rookTargets).not.toContain(31);
    expect(rookTargets).toHaveLength(9);

    const bishop = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [40, 'B', 'b'],
      [30, 'P', 'b'],
      [50, 'P', 'w'],
    ]);
    const bishopTargets = movesFrom(bishop, 40).map((entry) => entry.kind === 'move' && entry.to);
    expect(bishopTargets).toContain(50);
    expect(bishopTargets).not.toContain(60);
    expect(bishopTargets).not.toContain(30);
  });

  it('gives promoted rooks and bishops their extra steps', () => {
    const dragon = gameWith('b', [
      [78, 'K', 'b'],
      [2, 'K', 'w'],
      [40, 'R', 'b', true],
    ]);
    const dragonTargets = movesFrom(dragon, 40);
    expect(dragonTargets).toHaveLength(20);
    expect(dragonTargets.some((entry) => entry.kind === 'move' && entry.to === 30)).toBe(true);

    const horse = gameWith('b', [
      [78, 'K', 'b'],
      [2, 'K', 'w'],
      [40, 'B', 'b', true],
    ]);
    const horseTargets = movesFrom(horse, 40);
    expect(horseTargets).toHaveLength(20);
    expect(horseTargets.some((entry) => entry.kind === 'move' && entry.to === 31)).toBe(true);
  });

  it('offers promotions only inside or into the last three ranks', () => {
    const pawn = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [31, 'P', 'b'],
    ]);
    const options = movesFrom(pawn, 31).filter((entry) => entry.kind === 'move' && entry.to === 22);
    expect(options).toHaveLength(2);
    expect(options.map((entry) => entry.kind === 'move' && entry.promote).sort()).toEqual([false, true]);

    const outside = apply(pawn, move(31, 22, true));
    expect(outside.ok).toBe(true);
    expect(outside.state.board[22]).toMatchObject({ side: 'b', type: 'P', promoted: true });

    const tooEarly = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [40, 'P', 'b'],
    ]);
    expect(apply(tooEarly, move(40, 31, true)).error).toBe('cannot-promote');
  });

  it('forces promotion for pawn, lance and knight when they would be stuck', () => {
    const pawn = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [10, 'P', 'b'],
    ]);
    const pawnOptions = movesFrom(pawn, 10);
    expect(pawnOptions).toHaveLength(1);
    expect(pawnOptions[0].kind === 'move' && pawnOptions[0].promote).toBe(true);

    const lance = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [10, 'L', 'b'],
    ]);
    const lanceOptions = movesFrom(lance, 10);
    expect(lanceOptions).toHaveLength(1);
    expect(lanceOptions[0].kind === 'move' && lanceOptions[0].promote).toBe(true);

    const knight = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [22, 'N', 'b'],
    ]);
    const knightOptions = movesFrom(knight, 22);
    expect(knightOptions).toHaveLength(2);
    expect(knightOptions.every((entry) => entry.kind === 'move' && entry.promote)).toBe(true);
  });

  it('returns captured pieces to the hand and reverts promotion', () => {
    const state = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
      [40, 'P', 'b'],
      [31, 'S', 'w', true],
    ]);
    const result = apply(state, move(40, 31));
    expect(result.ok).toBe(true);
    expect(result.state.hands.b.S).toBe(1);
    expect(result.state.board[31]).toMatchObject({ side: 'b', type: 'P', promoted: false });
    expect(result.state.turn).toBe('w');
  });
});

describe('Shogi drops', () => {
  it('drops a captured piece, removes it from hand and passes the turn', () => {
    const state = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
      ]),
      'b',
      'G',
      1,
    );
    expect(canDrop(state, 'b', 'G', 40)).toBe(true);
    const result = apply(state, drop('G', 40));
    expect(result.ok).toBe(true);
    expect(result.state.board[40]).toMatchObject({ side: 'b', type: 'G', promoted: false });
    expect(result.state.hands.b.G).toBe(0);
    expect(result.state.turn).toBe('w');
    expect(apply(state, drop('G', 40)).ok).toBe(true);
    expect(apply(result.state, drop('G', 40)).error).toBe('no-hand');
  });

  it('enforces nifu and the pawn, lance and knight drop ranks', () => {
    const state = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
        [58, 'P', 'b'],
      ]),
      'b',
      'P',
      2,
    );
    expect(canDrop(state, 'b', 'P', 13)).toBe(false);
    expect(canDrop(state, 'b', 'P', 14)).toBe(true);
    expect(canDrop(state, 'b', 'P', 3)).toBe(false);
    expect(canDrop(state, 'b', 'P', 30)).toBe(true);

    const lance = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
      ]),
      'b',
      'L',
      1,
    );
    expect(canDrop(lance, 'b', 'L', 4)).toBe(false);
    expect(canDrop(lance, 'b', 'L', 13)).toBe(true);

    const knight = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
      ]),
      'b',
      'N',
      1,
    );
    expect(canDrop(knight, 'b', 'N', 4)).toBe(false);
    expect(canDrop(knight, 'b', 'N', 13)).toBe(false);
    expect(canDrop(knight, 'b', 'N', 22)).toBe(true);
  });

  it('can block a check with a drop', () => {
    const state = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [0, 'K', 'w'],
        [4, 'R', 'w'],
      ]),
      'b',
      'G',
      1,
    );
    expect(isInCheck(state, 'b')).toBe(true);
    const block = legalMoves(state).find(
      (candidate) => candidate.kind === 'drop' && candidate.type === 'G' && candidate.to === 40,
    );
    expect(block).toBeDefined();
    if (!block) return;
    const result = apply(state, block);
    expect(result.ok).toBe(true);
    expect(isInCheck(result.state, 'b')).toBe(false);
  });

  it('rejects a pawn drop that is immediate checkmate (uchifuzume)', () => {
    const state = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
        [2, 'G', 'b'],
        [6, 'G', 'b'],
        [21, 'G', 'b'],
        [23, 'G', 'b'],
      ]),
      'b',
      'P',
      1,
    );
    expect(canDrop(state, 'b', 'P', 13)).toBe(true);
    const pawnDrop = legalMoves(state).some(
      (candidate) => candidate.kind === 'drop' && candidate.type === 'P' && candidate.to === 13,
    );
    expect(pawnDrop).toBe(false);

    const after = makeMoveUnchecked(state, drop('P', 13));
    expect(isInCheck(after, 'w')).toBe(true);
    expect(hasAnyLegalMove(after, false)).toBe(false);
  });

  it('allows a checking pawn drop when the king can answer', () => {
    const state = withHand(
      gameWith('b', [
        [76, 'K', 'b'],
        [4, 'K', 'w'],
      ]),
      'b',
      'P',
      1,
    );
    const pawnDrop = legalMoves(state).find(
      (candidate) => candidate.kind === 'drop' && candidate.type === 'P' && candidate.to === 13,
    );
    expect(pawnDrop).toBeDefined();
  });
});

describe('Shogi check, mate and repetition', () => {
  it('detects check and forbids moving a pinned piece', () => {
    const state = gameWith('b', [
      [76, 'K', 'b'],
      [0, 'K', 'w'],
      [4, 'R', 'w'],
      [67, 'G', 'b'],
    ]);
    expect(isInCheck(state, 'b')).toBe(false);
    const goldMoves = movesFrom(state, 67);
    expect(goldMoves.length).toBeGreaterThan(0);
    for (const candidate of goldMoves) {
      const next = makeMoveUnchecked(state, candidate);
      expect(isInCheck(next, 'b')).toBe(false);
    }
    expect(goldMoves.some((candidate) => candidate.kind === 'move' && candidate.to === 66)).toBe(false);
  });

  it('delivers checkmate and refuses further moves', () => {
    const state = mates();
    expect(isInCheck(state, 'w')).toBe(false);
    const result = apply(state, move(12, 13));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('b');
    expect(result.state.endReason).toBe('checkmate');
    expect(result.state.check).toBe(true);
    expect(legalMoves(result.state)).toHaveLength(0);
    expect(apply(result.state, move(76, 75)).error).toBe('game-over');
  });

  it('recognises a position with no legal move', () => {
    const state = gameWith('w', [
      [76, 'K', 'b'],
      [0, 'K', 'w'],
      [11, 'G', 'b'],
      [19, 'G', 'b'],
    ]);
    expect(isInCheck(state, 'w')).toBe(false);
    expect(hasAnyLegalMove(state)).toBe(false);
    expect(legalMoves(state)).toHaveLength(0);
  });

  it('ends the game when a move leaves the opponent with no legal move', () => {
    const state = gameWith('b', [
      [76, 'K', 'b'],
      [0, 'K', 'w'],
      [11, 'G', 'b'],
      [19, 'G', 'b'],
    ]);
    expect(isInCheck(state, 'w')).toBe(false);
    expect(legalMoves({ ...state, turn: 'w' })).toHaveLength(0);
    const result = apply(state, move(76, 75));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('b');
    expect(result.state.check).toBe(false);
    expect(result.state.endReason).toBe('no-moves');
  });

  it('declares a draw on the fourth occurrence of a position', () => {
    const state = gameWith('b', [
      [76, 'K', 'b'],
      [4, 'K', 'w'],
    ]);
    state.positionCounts[positionKey(state)] = 1;
    let position = state;
    const cycle = [move(76, 75), move(4, 3), move(75, 76), move(3, 4)];
    for (let round = 0; round < 3; round += 1) {
      for (const candidate of cycle) {
        const result = apply(position, candidate);
        expect(result.ok).toBe(true);
        position = result.state;
      }
    }
    expect(position.status).toBe('draw');
    expect(position.endReason).toBe('repetition');
  });

  it('does not mutate the state passed into apply', () => {
    const state = setup();
    const before = JSON.stringify(state);
    const result = apply(state, move(58, 49));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Shogi seats, views and attack detection', () => {
  it('enforces seats and exposes the correct side to move', () => {
    const state = setup();
    expect(applySeat(state, 1, move(22, 31)).error).toBe('wrong-turn');
    const after = applySeat(state, 0, move(58, 49));
    expect(after.ok).toBe(true);
    expect(view(after.state, 0).canMove).toBe(false);
    expect(view(after.state, 1).canMove).toBe(true);
    expect(view(after.state, 1).side).toBe('w');
    expect(view(after.state, 1).moveCount).toBe(1);
    expect(view(after.state, 1).lastMove).toMatchObject(move(58, 49));
    expect(view(after.state, 0).hands.b.P).toBe(0);
  });

  it('round-trips a seat view for LAN clients', () => {
    const state = apply(setup(), move(58, 49)).state;
    const seatView = view(state, 1);
    const restored = stateFromView(seatView);
    expect(restored.board).toEqual(state.board);
    expect(restored.hands).toEqual(state.hands);
    expect(legalMoves(restored).length).toBe(legalMoves(state).length);
  });

  it('sees pawn, knight, lance, gold, silver and sliding attacks', () => {
    const board = emptyGame().board;
    board[22] = piece('P', 'b');
    expect(isSquareAttacked(board, 13, 'b')).toBe(true);

    board[21] = piece('N', 'b');
    expect(isSquareAttacked(board, 2, 'b')).toBe(true);

    board[27] = piece('L', 'b');
    expect(isSquareAttacked(board, 0, 'b')).toBe(true);

    board[40] = piece('S', 'w');
    expect(isSquareAttacked(board, 30, 'w')).toBe(true);

    board[60] = piece('G', 'w');
    expect(isSquareAttacked(board, 49, 'w')).toBe(true);

    board[44] = piece('R', 'b');
    expect(isSquareAttacked(board, 8, 'b')).toBe(true);

    board[26] = piece('P', 'w');
    expect(isSquareAttacked(board, 8, 'b')).toBe(false);
  });

  it('gives each seat a legal move list for its own turn', () => {
    const state = setup();
    const black = view(state, 0);
    const white = view(state, 1);
    expect(black.canMove).toBe(true);
    expect(white.canMove).toBe(false);
    expect(legalMoves(stateFromView(black)).every((candidate) => candidate.kind === 'drop' || state.board[candidate.from]?.side === 'b')).toBe(true);
  });
});

describe('Shogi AI and hints', () => {
  it('returns only legal moves at every level', () => {
    const state = setup();
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const chosen = chooseMove(state, level, () => 0.42);
      expect(chosen).not.toBeNull();
      expect(legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(chosen))).toBe(true);
    }
  });

  it('takes mate in one on Companion, Normal and Hard', () => {
    const state = mates();
    for (const level of ['companion', 'normal', 'hard'] as const) {
      const chosen = chooseMove(state, level, () => 0.6);
      expect(chosen).not.toBeNull();
      if (!chosen) continue;
      const result = apply(state, chosen);
      expect(result.state.status).toBe('won');
      expect(result.state.winner).toBe('b');
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = setup();
    const sequence = () => {
      let value = 0;
      return () => {
        value = (value + 0.19) % 1;
        return value;
      };
    };
    const first = chooseMove(state, 'normal', sequence());
    const second = chooseMove(state, 'normal', sequence());
    expect(first).toEqual(second);
  });

  it('offers a legal hint and explains a mate', () => {
    const mateHint = hintFor(mates());
    expect(mateHint).not.toBeNull();
    expect(mateHint?.kind).toBe('mate');
    if (mateHint) expect(legalMoves(mates()).some((candidate) => JSON.stringify(candidate) === JSON.stringify(mateHint.move))).toBe(true);

    const opening = hintFor(setup());
    expect(opening).not.toBeNull();
    if (opening) {
      expect(legalMoves(setup()).some((candidate) => JSON.stringify(candidate) === JSON.stringify(opening.move))).toBe(true);
    }
  });

  it('never chooses a move when the game is over', () => {
    const state = apply(mates(), move(12, 13)).state;
    expect(chooseMove(state, 'hard', () => 0.5)).toBeNull();
    expect(hintFor(state)).toBeNull();
  });
});
