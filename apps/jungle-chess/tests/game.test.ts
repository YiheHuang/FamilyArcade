import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate, sideMaterial } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  BOARD_SIZE,
  DENS,
  QUIET_LIMIT,
  TRAPS,
  apply,
  applySeat,
  canCapture,
  decodeMove,
  effectiveRank,
  encodeMove,
  indexOf,
  initialBoard,
  isWater,
  legalMoves,
  movesFrom,
  setup,
  trapOwner,
  view,
  type Animal,
  type GameState,
  type Side,
} from '../src/game/jungle-chess';

type Placement = [number, Side, Animal];

function position(entries: Placement[], turn: Side = 'X', quiet = 0): GameState {
  const state = setup(turn);
  state.board = Array(BOARD_SIZE).fill(null);
  for (const [index, side, kind] of entries) state.board[index] = { side, kind };
  state.quiet = quiet;
  return state;
}

function canMove(state: GameState, from: number, to: number): boolean {
  return movesFrom(state, from).some((move) => move.to === to);
}

describe('Jungle Chess board and setup', () => {
  it('builds the 7×9 board with sixteen animals and Red to move', () => {
    const state = setup('X');
    expect(state.board).toHaveLength(63);
    expect(state.board.filter(Boolean)).toHaveLength(16);
    expect(state.turn).toBe('X');
    expect(state.status).toBe('playing');
    expect(state.moves).toEqual([]);
  });

  it('places the classic eight animals per side', () => {
    const board = initialBoard();
    expect(board[indexOf(0, 0)]).toEqual({ side: 'O', kind: 'lion' });
    expect(board[indexOf(0, 6)]).toEqual({ side: 'O', kind: 'tiger' });
    expect(board[indexOf(2, 0)]).toEqual({ side: 'O', kind: 'rat' });
    expect(board[indexOf(2, 6)]).toEqual({ side: 'O', kind: 'elephant' });
    expect(board[indexOf(8, 0)]).toEqual({ side: 'X', kind: 'tiger' });
    expect(board[indexOf(8, 6)]).toEqual({ side: 'X', kind: 'lion' });
    expect(board[indexOf(6, 0)]).toEqual({ side: 'X', kind: 'elephant' });
    expect(board[indexOf(6, 6)]).toEqual({ side: 'X', kind: 'rat' });
  });

  it('marks the dens, traps and two rivers', () => {
    expect(DENS.X).toBe(indexOf(8, 3));
    expect(DENS.O).toBe(indexOf(0, 3));
    expect(TRAPS.X).toEqual([indexOf(8, 2), indexOf(8, 4), indexOf(7, 3)]);
    expect(TRAPS.O).toEqual([indexOf(0, 2), indexOf(0, 4), indexOf(1, 3)]);
    expect(trapOwner(indexOf(1, 3))).toBe('O');
    expect(trapOwner(indexOf(7, 3))).toBe('X');
    expect(trapOwner(indexOf(4, 3))).toBeNull();
    expect(isWater(indexOf(3, 1))).toBe(true);
    expect(isWater(indexOf(5, 5))).toBe(true);
    expect(isWater(indexOf(4, 3))).toBe(false);
    expect(isWater(indexOf(4, 0))).toBe(false);
  });

  it('is rotationally symmetric at the start', () => {
    const board = initialBoard();
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const mirrored = BOARD_SIZE - 1 - index;
      const a = board[index];
      const b = board[mirrored];
      if (!a) {
        expect(b).toBeNull();
      } else {
        expect(b).not.toBeNull();
        expect(b?.kind).toBe(a.kind);
        expect(b?.side).not.toBe(a.side);
      }
    }
  });
});

describe('Movement and the river', () => {
  it('moves one orthogonal square and never diagonally', () => {
    const state = position([[indexOf(2, 3), 'X', 'dog']], 'X');
    const targets = movesFrom(state, indexOf(2, 3)).map((move) => move.to).sort((a, b) => a - b);
    expect(targets).toEqual(
      [indexOf(1, 3), indexOf(3, 3), indexOf(2, 2), indexOf(2, 4)].sort((a, b) => a - b),
    );
  });

  it('lets only the rat enter the river', () => {
    const rat = position([[indexOf(3, 0), 'X', 'rat']], 'X');
    expect(canMove(rat, indexOf(3, 0), indexOf(3, 1))).toBe(true);

    for (const animal of ['cat', 'dog', 'wolf', 'leopard', 'tiger', 'lion', 'elephant'] as const) {
      const land = position([[indexOf(3, 0), 'X', animal]], 'X');
      expect(canMove(land, indexOf(3, 0), indexOf(3, 1))).toBe(false);
    }
  });

  it('makes the rat swim one square at a time, not from bank to bank', () => {
    const state = position([[indexOf(3, 0), 'X', 'rat']], 'X');
    expect(canMove(state, indexOf(3, 0), indexOf(3, 1))).toBe(true);
    expect(canMove(state, indexOf(3, 0), indexOf(3, 3))).toBe(false);
    expect(legalMoves(state).every((move) => move.to !== indexOf(3, 3))).toBe(true);
  });

  it('lets a lion jump horizontally across a river', () => {
    const state = position([[indexOf(3, 0), 'X', 'lion']], 'X');
    expect(canMove(state, indexOf(3, 0), indexOf(3, 3))).toBe(true);
  });

  it('lets a tiger jump vertically across both river rows', () => {
    const state = position([[indexOf(2, 1), 'X', 'tiger']], 'X');
    expect(canMove(state, indexOf(2, 1), indexOf(6, 1))).toBe(true);
  });

  it('lets a lion capture on a river jump', () => {
    const state = position(
      [
        [indexOf(3, 0), 'X', 'lion'],
        [indexOf(3, 3), 'O', 'wolf'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 0), indexOf(3, 3))).toBe(true);
    const result = apply(state, { from: indexOf(3, 0), to: indexOf(3, 3) });
    expect(result.ok).toBe(true);
    expect(result.state.board[indexOf(3, 3)]).toEqual({ side: 'X', kind: 'lion' });
  });

  it('blocks a lion jump when any rat sits in the water', () => {
    const state = position(
      [
        [indexOf(3, 0), 'X', 'lion'],
        [indexOf(3, 2), 'O', 'rat'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 0), indexOf(3, 3))).toBe(false);
  });

  it('blocks a tiger jump when a friendly rat sits in the water', () => {
    const state = position(
      [
        [indexOf(2, 1), 'X', 'tiger'],
        [indexOf(4, 1), 'X', 'rat'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(2, 1), indexOf(6, 1))).toBe(false);
  });

  it('does not jump across land', () => {
    const state = position([[indexOf(2, 0), 'X', 'lion']], 'X');
    expect(canMove(state, indexOf(2, 0), indexOf(2, 3))).toBe(false);
  });

  it('never lands a river jump on its own den', () => {
    const state = position([[indexOf(7, 3), 'X', 'lion']], 'X');
    expect(canMove(state, indexOf(7, 3), DENS.X)).toBe(false);
  });
});

describe('Captures, ranks and traps', () => {
  it('captures equal or weaker animals but not stronger ones', () => {
    const wolf = position(
      [
        [indexOf(2, 3), 'X', 'wolf'],
        [indexOf(2, 4), 'O', 'dog'],
        [indexOf(3, 3), 'O', 'tiger'],
      ],
      'X',
    );
    expect(canMove(wolf, indexOf(2, 3), indexOf(2, 4))).toBe(true);
    expect(canMove(wolf, indexOf(2, 3), indexOf(3, 3))).toBe(false);
  });

  it('lets any piece capture an enemy standing in its trap', () => {
    const state = position(
      [
        [indexOf(0, 2), 'X', 'rat'],
        [indexOf(1, 2), 'O', 'cat'],
      ],
      'O',
    );
    expect(effectiveRank({ side: 'X', kind: 'rat' }, indexOf(0, 2))).toBe(0);
    expect(canMove(state, indexOf(1, 2), indexOf(0, 2))).toBe(true);
  });

  it('does not weaken a piece standing in its own trap', () => {
    const state = position(
      [
        [indexOf(8, 2), 'X', 'lion'],
        [indexOf(8, 1), 'O', 'cat'],
      ],
      'O',
    );
    expect(effectiveRank({ side: 'X', kind: 'lion' }, indexOf(8, 2))).toBe(7);
    expect(canMove(state, indexOf(8, 1), indexOf(8, 2))).toBe(false);
  });

  it('weakens an attacker standing in the enemy trap', () => {
    const state = position(
      [
        [indexOf(0, 2), 'X', 'lion'],
        [indexOf(0, 1), 'O', 'cat'],
      ],
      'X',
    );
    expect(effectiveRank({ side: 'X', kind: 'lion' }, indexOf(0, 2))).toBe(0);
    expect(canMove(state, indexOf(0, 2), indexOf(0, 1))).toBe(false);
  });

  it('lets the elephant never capture a rat', () => {
    expect(
      canCapture(
        { side: 'X', kind: 'elephant' },
        indexOf(4, 3),
        { side: 'O', kind: 'rat' },
        indexOf(4, 4),
      ),
    ).toBe(false);
  });

  it('lets a rat on land capture an elephant', () => {
    expect(
      canCapture(
        { side: 'X', kind: 'rat' },
        indexOf(2, 3),
        { side: 'O', kind: 'elephant' },
        indexOf(2, 4),
      ),
    ).toBe(true);
  });

  it('does not let a rat capture an elephant from the water', () => {
    const state = position(
      [
        [indexOf(3, 1), 'X', 'rat'],
        [indexOf(3, 0), 'O', 'elephant'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 1), indexOf(3, 0))).toBe(false);
  });

  it('protects a rat in the water from land animals', () => {
    const state = position(
      [
        [indexOf(3, 0), 'X', 'lion'],
        [indexOf(3, 1), 'O', 'rat'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 0), indexOf(3, 1))).toBe(false);
    expect(
      canCapture(
        { side: 'X', kind: 'lion' },
        indexOf(3, 0),
        { side: 'O', kind: 'rat' },
        indexOf(3, 1),
      ),
    ).toBe(false);
  });

  it('lets water rats capture each other', () => {
    const state = position(
      [
        [indexOf(3, 1), 'X', 'rat'],
        [indexOf(3, 2), 'O', 'rat'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 1), indexOf(3, 2))).toBe(true);
  });

  it('does not let a land rat capture a water rat', () => {
    const state = position(
      [
        [indexOf(3, 0), 'X', 'rat'],
        [indexOf(3, 1), 'O', 'rat'],
      ],
      'X',
    );
    expect(canMove(state, indexOf(3, 0), indexOf(3, 1))).toBe(false);
  });
});

describe('Dens, winning and draws', () => {
  it('wins by entering the enemy den', () => {
    const state = position(
      [
        [indexOf(1, 3), 'X', 'lion'],
        [indexOf(8, 6), 'O', 'lion'],
      ],
      'X',
    );
    const result = apply(state, { from: indexOf(1, 3), to: DENS.O });
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('X');
    expect(result.state.reason).toBe('den');
  });

  it('wins by capturing the last enemy animal', () => {
    const state = position(
      [
        [indexOf(2, 3), 'X', 'lion'],
        [indexOf(2, 4), 'O', 'cat'],
      ],
      'X',
    );
    const result = apply(state, { from: indexOf(2, 3), to: indexOf(2, 4) });
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe('X');
    expect(result.state.reason).toBe('capture');
  });

  it('draws a stalemate position with no legal move', () => {
    const state = position(
      [
        [indexOf(0, 0), 'O', 'cat'],
        [indexOf(0, 1), 'X', 'lion'],
        [indexOf(1, 0), 'X', 'elephant'],
        [indexOf(4, 3), 'X', 'dog'],
      ],
      'X',
    );
    expect(movesFrom(state, indexOf(0, 0))).toHaveLength(0);
    const result = apply(state, { from: indexOf(4, 3), to: indexOf(5, 3) });
    expect(result.state.status).toBe('draw');
    expect(result.state.reason).toBe('stalemate');
  });

  it('draws after the quiet-move limit', () => {
    const state = position(
      [
        [indexOf(4, 3), 'X', 'rat'],
        [indexOf(0, 0), 'O', 'lion'],
      ],
      'X',
      QUIET_LIMIT - 1,
    );
    const result = apply(state, { from: indexOf(4, 3), to: indexOf(4, 4) });
    expect(result.state.status).toBe('draw');
    expect(result.state.reason).toBe('progress');
  });

  it('rejects moves into your own den and after the game ends', () => {
    const state = position(
      [
        [indexOf(7, 3), 'X', 'lion'],
        [indexOf(0, 0), 'O', 'lion'],
      ],
      'X',
    );
    expect(apply(state, { from: indexOf(7, 3), to: DENS.X }).error).toBe('illegal');

    const winning = position(
      [
        [indexOf(0, 2), 'X', 'lion'],
        [indexOf(8, 6), 'O', 'lion'],
      ],
      'X',
    );
    const won = apply(winning, { from: indexOf(0, 2), to: DENS.O }).state;
    expect(won.status).toBe('won');
    expect(apply(won, { from: 0, to: 1 }).error).toBe('game-over');
  });
});

describe('Turns, seats and state views', () => {
  it('rejects empty sources, wrong turns and illegal moves', () => {
    const state = position(
      [
        [indexOf(4, 3), 'X', 'dog'],
        [indexOf(2, 2), 'O', 'cat'],
      ],
      'X',
    );
    expect(apply(state, { from: indexOf(4, 4), to: indexOf(4, 5) }).error).toBe('no-piece');
    expect(apply(state, { from: indexOf(2, 2), to: indexOf(2, 3) }).error).toBe('wrong-turn');
    expect(apply(state, { from: indexOf(4, 3), to: indexOf(0, 0) }).error).toBe('illegal');
    expect(apply(state, { from: 0, to: 0 }).error).toBe('bad-move');
  });

  it('enforces seat ownership', () => {
    const state = setup('X');
    expect(applySeat(state, 1, { from: 0, to: 1 }).error).toBe('wrong-turn');
    expect(applySeat(state, 0, { from: indexOf(6, 4), to: indexOf(6, 3) }).ok).toBe(true);
  });

  it('gives each seat the same perfect-information board and its own side', () => {
    const state = apply(setup('X'), { from: indexOf(6, 4), to: indexOf(6, 3) }).state;
    const red = view(state, 0);
    const blue = view(state, 1);
    expect(red.side).toBe('X');
    expect(blue.side).toBe('O');
    expect(blue.canMove).toBe(true);
    expect(red.canMove).toBe(false);
    expect(red.board).toEqual(blue.board);
    expect(blue.lastMove).toEqual({ from: indexOf(6, 4), to: indexOf(6, 3) });
    expect(blue.moveCount).toBe(1);
  });

  it('encodes and decodes moves, rejecting nonsense', () => {
    const encoded = encodeMove(12, 19);
    expect(decodeMove(encoded)).toEqual({ from: 12, to: 19 });
    expect(decodeMove(-1)).toBeNull();
    expect(decodeMove(BOARD_SIZE * BOARD_SIZE)).toBeNull();
    expect(decodeMove(encodeMove(5, 5))).toBeNull();
  });

  it('has no legal moves after the game is over', () => {
    const state = position(
      [
        [indexOf(1, 3), 'X', 'lion'],
        [indexOf(8, 6), 'O', 'lion'],
      ],
      'X',
    );
    const won = apply(state, { from: indexOf(1, 3), to: DENS.O }).state;
    expect(legalMoves(won)).toEqual([]);
  });
});

describe('AI and hints', () => {
  it('takes an immediate den win at every level', () => {
    const state = position(
      [
        [indexOf(1, 3), 'X', 'lion'],
        [indexOf(8, 6), 'O', 'lion'],
      ],
      'X',
    );
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, () => 0.42)).toBe(encodeMove(indexOf(1, 3), DENS.O));
    }
  });

  it('returns only legal moves for every level', () => {
    const state = setup('X');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.37);
      expect(legalMoves(state).map((item) => encodeMove(item.from, item.to))).toContain(move);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = setup('X');
    const seeded = () => 0.11;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, seeded)).toBe(chooseMove(state, level, seeded));
    }
  });

  it('finds a hanging elephant on Hard', () => {
    const state = position(
      [
        [indexOf(2, 3), 'X', 'rat'],
        [indexOf(2, 4), 'O', 'elephant'],
        [indexOf(1, 2), 'O', 'lion'],
        [indexOf(8, 6), 'X', 'lion'],
      ],
      'X',
    );
    expect(chooseMove(state, 'hard', () => 0.2)).toBe(encodeMove(indexOf(2, 3), indexOf(2, 4)));
  });

  it('scores material and terminal positions from the right side', () => {
    const state = position(
      [
        [indexOf(2, 3), 'X', 'lion'],
        [indexOf(2, 4), 'O', 'cat'],
      ],
      'X',
    );
    expect(sideMaterial(state.board, 'X')).toBe(7);
    expect(sideMaterial(state.board, 'O')).toBe(2);
    expect(evaluate(state, 'X')).toBeGreaterThan(evaluate(state, 'O'));

    const won = apply(state, { from: indexOf(2, 3), to: indexOf(2, 4) }).state;
    expect(evaluate(won, 'X')).toBeGreaterThan(500_000);
    expect(evaluate(won, 'O')).toBeLessThan(-500_000);
  });

  it('explains a hint to the den', () => {
    const state = position(
      [
        [indexOf(1, 3), 'X', 'lion'],
        [indexOf(8, 6), 'O', 'lion'],
      ],
      'X',
    );
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(hint?.kind).toBe('den');
    expect(hint?.to).toBe(DENS.O);
  });

  it('explains a capture hint', () => {
    const state = position(
      [
        [indexOf(2, 3), 'X', 'rat'],
        [indexOf(2, 4), 'O', 'elephant'],
        [indexOf(1, 2), 'O', 'lion'],
        [indexOf(8, 6), 'X', 'lion'],
      ],
      'X',
    );
    const hint = hintFor(state);
    expect(hint?.kind).toBe('capture');
    expect(hint?.animal).toBe('elephant');
  });
});
