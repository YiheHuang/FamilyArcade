import { describe, expect, it } from 'vitest';
import { chooseTurn, hint, type AiLevel } from '../src/ai/ai';
import {
  applyMove,
  applySeat,
  canBearOff,
  checkersOnBoard,
  endTurn,
  legalMoves,
  legalSequences,
  pipCount,
  resultText,
  roll,
  seededRng,
  setup,
  view,
  type GameState,
  type Move,
  type Side,
} from '../src/game/tables';

function custom(
  white: Record<number, number>,
  black: Record<number, number>,
  turn: Side = 'W',
  offW = 0,
  offB = 0,
  barW = 0,
  barB = 0,
): GameState {
  const state = setup(turn);
  state.points = Array<number>(24).fill(0);
  for (const [point, count] of Object.entries(white)) state.points[Number(point)] = count;
  for (const [point, count] of Object.entries(black)) state.points[Number(point)] = -count;
  state.off = { W: offW, B: offB };
  state.bar = { W: barW, B: barB };
  return state;
}

function moving(state: GameState, a: number, b: number): GameState {
  const result = roll(state, a, b);
  expect(result.ok).toBe(true);
  return result.state;
}

function playAll(state: GameState, moves: Move[]): GameState {
  let current = state;
  for (const move of moves) {
    const result = applyMove(current, move);
    expect(result.ok, `${move.from}->${move.to}/${move.die}`).toBe(true);
    current = result.state;
  }
  return current;
}

describe('Tables setup and dice', () => {
  it('starts with the standard 15 checkers and 167 pips each', () => {
    const state = setup('W');
    expect(state.points).toHaveLength(24);
    expect(checkersOnBoard(state, 'W')).toBe(15);
    expect(checkersOnBoard(state, 'B')).toBe(15);
    expect(pipCount(state, 'W')).toBe(167);
    expect(pipCount(state, 'B')).toBe(167);
    expect(state.turn).toBe('W');
    expect(state.status).toBe('awaiting-roll');
    expect(state.dice).toEqual([]);
  });

  it('sets up the traditional point counts', () => {
    const state = setup();
    expect(state.points[23]).toBe(2);
    expect(state.points[12]).toBe(5);
    expect(state.points[7]).toBe(3);
    expect(state.points[5]).toBe(5);
    expect(state.points[0]).toBe(-2);
    expect(state.points[11]).toBe(-5);
    expect(state.points[16]).toBe(-3);
    expect(state.points[18]).toBe(-5);
  });

  it('stores a normal roll and expands doubles to four moves', () => {
    const normal = moving(setup(), 3, 5);
    expect(normal.dice).toEqual([3, 5]);
    expect(normal.roll).toEqual([3, 5]);
    expect(normal.status).toBe('moving');
    const doubles = moving(setup(), 4, 4);
    expect(doubles.dice).toEqual([4, 4, 4, 4]);
  });

  it('rejects bad dice and rolling twice', () => {
    expect(roll(setup(), 0, 3).error).toBe('bad-dice');
    expect(roll(setup(), 7, 2).error).toBe('bad-dice');
    const rolled = moving(setup(), 3, 5);
    expect(roll(rolled, 1, 2).error).toBe('wrong-phase');
  });
});

describe('Tables movement', () => {
  it('moves white toward point 0 and black toward point 23', () => {
    let state = moving(custom({ 12: 1 }, {}), 3, 5);
    const white = applyMove(state, { from: 12, to: 9, die: 3, hit: false });
    expect(white.ok).toBe(true);
    expect(white.state.points[9]).toBe(1);
    state = white.state;
    const second = applyMove(state, { from: 9, to: 4, die: 5, hit: false });
    expect(second.ok).toBe(true);
    expect(second.state.turn).toBe('B');
    expect(second.state.status).toBe('awaiting-roll');

    const black = moving(custom({}, { 12: 1 }, 'B'), 3, 5);
    const moved = applyMove(black, { from: 12, to: 15, die: 3, hit: false });
    expect(moved.ok).toBe(true);
    expect(moved.state.points[15]).toBe(-1);
  });

  it('rejects a move from an empty point and a wrong landing point', () => {
    const state = moving(custom({ 12: 1 }, {}), 3, 5);
    expect(applyMove(state, { from: 4, to: 1, die: 3, hit: false }).error).toBe('no-checker');
    expect(applyMove(state, { from: 12, to: 10, die: 3, hit: false }).error).toBe('illegal');
  });

  it('enforces points held by two or more enemy checkers', () => {
    const state = moving(custom({ 12: 1 }, { 9: 2 }), 3, 5);
    expect(applyMove(state, { from: 12, to: 9, die: 3, hit: false }).error).toBe('blocked');
  });

  it('hits a blot and sends it to the bar', () => {
    const state = moving(custom({ 12: 2 }, { 9: 1 }), 3, 5);
    const result = applyMove(state, { from: 12, to: 9, die: 3, hit: true });
    expect(result.ok).toBe(true);
    expect(result.state.points[9]).toBe(1);
    expect(result.state.bar.B).toBe(1);
    expect(result.state.log.at(-1)?.move.hit).toBe(true);
  });

  it('makes bar re-entry the only legal source', () => {
    const state = moving(custom({ 12: 1 }, {}, 'W', 0, 0, 1, 0), 3, 5);
    expect(applyMove(state, { from: 12, to: 9, die: 3, hit: false }).error).toBe('bar-first');
    expect(legalMoves(state).every((move) => move.from === 'bar')).toBe(true);
    const entered = applyMove(state, { from: 'bar', to: 21, die: 3, hit: false });
    expect(entered.ok).toBe(true);
    expect(entered.state.bar.W).toBe(0);
    expect(entered.state.points[21]).toBe(1);
  });

  it('enters black from the bar in white’s home board', () => {
    const state = moving(custom({}, { 5: 1 }, 'B', 0, 0, 0, 1), 3, 5);
    const entered = applyMove(state, { from: 'bar', to: 2, die: 3, hit: false });
    expect(entered.ok).toBe(true);
    expect(entered.state.bar.B).toBe(0);
    expect(entered.state.points[2]).toBe(-1);
  });

  it('updates the pip count by the die actually used', () => {
    const state = moving(setup(), 3, 5);
    const moved = applyMove(state, { from: 12, to: 9, die: 3, hit: false });
    expect(moved.ok).toBe(true);
    expect(pipCount(moved.state, 'W')).toBe(164);
  });

  it('derives the hit flag from the board instead of trusting the intent', () => {
    const state = moving(custom({ 12: 2 }, { 9: 1 }), 3, 5);
    // A spoofed intent claiming no hit must still send the blot to the bar.
    const spoofed = applyMove(state, { from: 12, to: 9, die: 3, hit: false });
    expect(spoofed.ok).toBe(true);
    expect(spoofed.state.bar.B).toBe(1);
    expect(spoofed.state.points[9]).toBe(1);
    const quiet = moving(custom({ 12: 2 }, { 9: 2 }), 3, 5);
    expect(applyMove(quiet, { from: 12, to: 9, die: 3, hit: true }).error).toBe('blocked');
  });

  it('records moves in the log with the turn number', () => {
    const state = moving(custom({ 12: 1 }, {}), 3, 5);
    const moved = applyMove(state, { from: 12, to: 9, die: 3, hit: false });
    expect(moved.state.log).toHaveLength(1);
    expect(moved.state.log[0]).toMatchObject({ turn: 1, side: 'W', move: { from: 12, to: 9, die: 3 } });
    expect(moved.state.lastMove).toMatchObject({ from: 12, to: 9, die: 3 });
  });
});

describe('Tables bearing off and finishing', () => {
  it('refuses to bear off while a checker is outside home', () => {
    const state = moving(custom({ 12: 1 }, {}), 3, 5);
    expect(applyMove(state, { from: 12, to: 'off', die: 3, hit: false }).error).toBe('cannot-bear-off');
  });

  it('bears off with an exact die and finishes at 15 off', () => {
    const state = moving(custom({ 0: 1 }, {}, 'W', 14, 0), 1, 1);
    const result = applyMove(state, { from: 0, to: 'off', die: 1, hit: false });
    expect(result.ok).toBe(true);
    expect(result.state.off.W).toBe(15);
    expect(result.state.status).toBe('finished');
    expect(result.state.winner).toBe('W');
    expect(resultText(result.state)).toBe('white');
  });

  it('allows an overroll only from the furthest occupied home point', () => {
    const state = custom({ 0: 1, 1: 1 }, {}, 'W', 13, 0);
    expect(canBearOff(state, 'W', 0, 6)).toBe(false);
    expect(canBearOff(state, 'W', 1, 6)).toBe(true);
    const only = custom({ 1: 1 }, {}, 'W', 14, 0);
    expect(canBearOff(only, 'W', 1, 6)).toBe(true);
  });

  it('never allows bearing off directly from the bar', () => {
    const state = moving(custom({}, {}, 'W', 0, 0, 1, 0), 6, 3);
    expect(applyMove(state, { from: 'bar', to: 'off', die: 6, hit: false }).error).toBe('illegal');
  });

  it('rejects any action after the game is finished', () => {
    const state = moving(custom({ 0: 1 }, {}, 'W', 14, 0), 1, 1);
    const finished = applyMove(state, { from: 0, to: 'off', die: 1, hit: false }).state;
    expect(roll(finished, 2, 3).error).toBe('game-over');
    expect(applyMove(finished, { from: 0, to: 'off', die: 1, hit: false }).error).toBe('game-over');
    expect(applySeat(finished, 0, { from: 0, to: 'off', die: 1, hit: false }).error).toBe('game-over');
  });
});

describe('Tables turn rules', () => {
  it('plays all four doubles moves and then hands over the turn', () => {
    const state = moving(custom({ 12: 1 }, {}), 2, 2);
    const first = applyMove(state, { from: 12, to: 10, die: 2, hit: false });
    expect(first.ok).toBe(true);
    let current = first.state;
    for (const point of [10, 8, 6]) {
      const result = applyMove(current, { from: point, to: point - 2, die: 2, hit: false });
      expect(result.ok).toBe(true);
      current = result.state;
    }
    expect(current.points[4]).toBe(1);
    expect(current.turn).toBe('B');
    expect(current.status).toBe('awaiting-roll');
  });

  it('forces the higher die when only one die can be played', () => {
    const state = moving(custom({ 18: 1 }, { 10: 2 }), 3, 5);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 18, to: 13, die: 5 });
    expect(applyMove(state, { from: 18, to: 15, die: 3, hit: false }).error).toBe('suboptimal');
  });

  it('refuses to end a turn while a legal move remains', () => {
    const state = moving(custom({ 12: 1 }, {}), 3, 5);
    expect(endTurn(state).error).toBe('must-move');
  });

  it('passes automatically when a roll has no legal entry', () => {
    const blocked = custom(
      {},
      { 18: 2, 19: 2, 20: 2, 21: 2, 22: 2, 23: 2 },
      'W',
      0,
      0,
      1,
      0,
    );
    const state = moving(blocked, 3, 5);
    expect(legalMoves(state)).toHaveLength(0);
    const passed = endTurn(state);
    expect(passed.ok).toBe(true);
    expect(passed.state.turn).toBe('B');
    expect(passed.state.status).toBe('awaiting-roll');
  });

  it('does not let a player move out of turn', () => {
    const state = moving(setup(), 3, 5);
    const move = legalMoves(state)[0];
    expect(move).toBeDefined();
    expect(applySeat(state, 1, move).error).toBe('wrong-turn');
    expect(applySeat(state, 0, move).ok).toBe(true);
  });

  it('exposes the correct roll and move flags per seat', () => {
    const fresh = setup('W');
    expect(view(fresh, 0)).toMatchObject({ side: 'W', canRoll: true, canMove: false });
    expect(view(fresh, 1)).toMatchObject({ side: 'B', canRoll: false, canMove: false });
    const rolled = moving(fresh, 3, 5);
    expect(view(rolled, 0).canRoll).toBe(false);
    expect(view(rolled, 0).canMove).toBe(true);
    expect(view(rolled, 1).canMove).toBe(false);
  });

  it('generates only complete, legal sequences', () => {
    const state = moving(setup(), 6, 3);
    const sequences = legalSequences(state);
    expect(sequences.length).toBeGreaterThan(0);
    for (const sequence of sequences.slice(0, 10)) {
      const after = playAll(state, sequence.moves);
      expect(after.status === 'finished' || after.turn === 'B').toBe(true);
    }
  });
});

describe('Tables AI', () => {
  const levels: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

  it('returns a legal turn at every level', () => {
    const state = moving(setup(), 6, 3);
    for (const level of levels) {
      const sequence = chooseTurn(state, level, seededRng(7));
      expect(sequence.length).toBeGreaterThan(0);
      const after = playAll(state, sequence);
      expect(after.status === 'finished' || after.turn === 'B').toBe(true);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = moving(setup(), 5, 2);
    for (const level of levels) {
      const a = chooseTurn(state, level, seededRng(1234));
      const b = chooseTurn(state, level, seededRng(1234));
      expect(a).toEqual(b);
    }
  });

  it('takes a winning bear-off at Hard', () => {
    const state = moving(custom({ 0: 1 }, {}, 'W', 14, 0), 1, 1);
    const sequence = chooseTurn(state, 'hard', seededRng(9));
    expect(sequence.some((move) => move.to === 'off')).toBe(true);
    expect(playAll(state, sequence).winner).toBe('W');
  });

  it('lets Companion avoid a hit when a gentle turn exists', () => {
    const state = moving(custom({ 12: 1, 6: 1 }, { 9: 1 }), 3, 5);
    const sequence = chooseTurn(state, 'companion', seededRng(5));
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence.every((move) => !move.hit)).toBe(true);
    expect(playAll(state, sequence).turn).toBe('B');
  });

  it('hints with a reason and a playable first move', () => {
    const state = moving(custom({ 0: 1 }, {}, 'W', 14, 0), 1, 1);
    const found = hint(state, seededRng(3));
    expect(found.moves.length).toBeGreaterThan(0);
    expect(found.reason).toBe('bear-off');
    expect(applyMove(state, found.moves[0]).ok).toBe(true);
  });

  it('plays a complete deterministic game to a finish', () => {
    let state = setup('W');
    const rng = seededRng(271828);
    let turns = 0;
    while (state.status !== 'finished' && turns < 500) {
      turns += 1;
      if (state.status === 'awaiting-roll') {
        const a = 1 + Math.floor(rng() * 6);
        const b = 1 + Math.floor(rng() * 6);
        const rolled = roll(state, a, b);
        expect(rolled.ok).toBe(true);
        state = rolled.state;
      }
      const sequence = chooseTurn(state, 'normal', rng);
      if (sequence.length === 0) {
        const passed = endTurn(state);
        expect(passed.ok).toBe(true);
        state = passed.state;
        continue;
      }
      for (const move of sequence) {
        const result = applyMove(state, move);
        expect(result.ok).toBe(true);
        state = result.state;
        if (state.status === 'finished') break;
      }
      if (state.status === 'moving') {
        const passed = endTurn(state);
        expect(passed.ok).toBe(true);
        state = passed.state;
      }
    }
    expect(state.status).toBe('finished');
    expect(state.winner).toBeTruthy();
    expect(state.off[state.winner as Side]).toBe(15);
    expect(turns).toBeLessThan(500);
  }, 60000);
});
