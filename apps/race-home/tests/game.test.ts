import { describe, expect, it } from 'vitest';
import { captureRisk, chooseMove, explainMove } from '../src/ai/ai';
import {
  COLORS,
  HOME,
  LANE_START,
  RING_CELLS,
  START_CELL,
  legalMoves,
  move,
  moveSeat,
  ringCell,
  roll,
  rollSeat,
  setup,
  skipTurn,
  view,
  type Color,
  type GameState,
} from '../src/game/race-home';
import { LANE_POINTS, RING_PATH, RING_POINTS, startColor } from '../src/game/geometry';

/** Deterministic PRNG used only by the tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG that always rolls exactly `die`. */
function dieRng(die: number): () => number {
  return () => (die - 0.5) / 6;
}

function stateWith(
  players: Color[],
  pawns: Partial<Record<Color, number[]>>,
  overrides: Partial<GameState> = {},
): GameState {
  const base = setup(players);
  const merged = { ...base.pawns };
  for (const color of COLORS) {
    if (pawns[color]) merged[color] = [...pawns[color]];
  }
  return { ...base, pawns: merged, ...overrides };
}

describe('Race Home engine — setup and movement', () => {
  it('sets up four colours, four pawns each, red to roll', () => {
    const state = setup();
    expect(state.players).toEqual(['red', 'green', 'yellow', 'blue']);
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('roll');
    for (const color of COLORS) {
      expect(state.pawns[color]).toEqual([-1, -1, -1, -1]);
    }
    expect(state.winner).toBeNull();
  });

  it('supports 2–4 players and wraps the first seat', () => {
    expect(setup(['red', 'green']).players).toEqual(['red', 'green']);
    expect(setup(['red', 'green', 'yellow'], -1).turn).toBe(2);
    expect(setup(['red', 'green'], 5).turn).toBe(1);
    expect(() => setup(['red'])).toThrow();
    expect(() => setup(['red', 'red'])).toThrow();
  });

  it('rolls every face deterministically from the injected RNG', () => {
    const state = setup(['red', 'green']);
    expect(roll(state, () => 0).state.die).toBe(1);
    expect(roll(state, () => 0.5).state.die).toBe(4);
    expect(roll(state, () => 0.9999).state.die).toBe(6);
    const rng = mulberry32(27);
    for (let i = 0; i < 60; i++) {
      const value = roll(state, rng).state.die;
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('lets a six leave the yard but not a smaller roll', () => {
    const six = roll(setup(['red', 'green']), dieRng(6)).state;
    expect(six.phase).toBe('move');
    expect(legalMoves(six)).toEqual([0, 1, 2, 3]);
    const five = roll(setup(['red', 'green']), dieRng(5)).state;
    expect(five.phase).toBe('roll');
    expect(five.turn).toBe(1);
    expect(five.lastEvent?.type).toBe('pass');
  });

  it('brings a pawn out on a six and grants another roll', () => {
    const rolled = roll(setup(['red', 'green']), dieRng(6)).state;
    const result = move(rolled, 2);
    expect(result.ok).toBe(true);
    expect(result.state.pawns.red[2]).toBe(0);
    expect(result.state.turn).toBe(0);
    expect(result.state.phase).toBe('roll');
    expect(result.state.lastEvent).toMatchObject({ type: 'move', extra: true, to: 0 });
  });

  it('passes the turn after a normal move and keeps the die visible', () => {
    const state = stateWith(['red', 'green'], { red: [10, -1, -1, -1] }, { phase: 'move', die: 3 });
    const result = move(state, 0);
    expect(result.state.pawns.red[0]).toBe(13);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('roll');
    expect(result.state.die).toBe(3);
  });

  it('requires an exact roll to enter the house', () => {
    const over = stateWith(['red', 'green'], { red: [55, -1, -1, -1] }, { phase: 'move', die: 3 });
    expect(legalMoves(over)).toEqual([]);
    expect(move(over, 0).error).toBe('illegal-pawn');
    const exact = stateWith(['red', 'green'], { red: [55, -1, -1, -1] }, { phase: 'move', die: 2 });
    expect(legalMoves(exact)).toEqual([0]);
    expect(move(exact, 0).state.pawns.red[0]).toBe(HOME);
  });

  it('walks the five colour-lane squares before home', () => {
    const lane = stateWith(['red', 'green'], { red: [51, -1, -1, -1] }, { phase: 'move', die: 1 });
    const entered = move(lane, 0).state;
    expect(entered.pawns.red[0]).toBe(LANE_START);
    const finish = stateWith(
      ['red', 'green'],
      { red: [LANE_START, HOME, HOME, HOME] },
      { phase: 'move', die: 5 },
    );
    const won = move(finish, 0).state;
    expect(won.pawns.red[0]).toBe(HOME);
    expect(won.phase).toBe('over');
    expect(won.winner).toBe('red');
  });

  it('captures an opponent on the shared ring and sends it home', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [10, -1, -1, -1], green: [0, -1, -1, -1] },
      { phase: 'move', die: 3 },
    );
    const result = move(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.pawns.red[0]).toBe(13);
    expect(result.state.pawns.green[0]).toBe(-1);
    expect(result.state.lastEvent).toMatchObject({
      type: 'move',
      captured: [{ color: 'green', pawn: 0 }],
    });
  });

  it('captures stacked rivals but never a pawn in its own lane', () => {
    const stacked = stateWith(
      ['red', 'green'],
      { red: [10, -1, -1, -1], green: [0, 0, -1, -1] },
      { phase: 'move', die: 3 },
    );
    const captured = move(stacked, 0).state;
    expect(captured.pawns.green[0]).toBe(-1);
    expect(captured.pawns.green[1]).toBe(-1);

    const safe = stateWith(
      ['red', 'green'],
      { red: [10, -1, -1, -1], green: [LANE_START, -1, -1, -1] },
      { phase: 'move', die: 3 },
    );
    const passed = move(safe, 0).state;
    expect(passed.pawns.green[0]).toBe(LANE_START);
  });

  it('allows own pawns to share a square', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [10, 13, -1, -1] },
      { phase: 'move', die: 3 },
    );
    const result = move(state, 0).state;
    expect(result.pawns.red[0]).toBe(13);
    expect(result.pawns.red[1]).toBe(13);
  });

  it('passes the turn immediately when no pawn can move', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [56, 56, 56, 56] },
      { phase: 'roll' },
    );
    const result = roll(state, dieRng(2));
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('roll');
    expect(result.state.turn).toBe(1);
    expect(result.state.die).toBe(2);
    expect(result.state.lastEvent).toMatchObject({ type: 'pass', color: 'red', die: 2 });
  });

  it('declares a winner only when all four pawns are home', () => {
    const almost = stateWith(
      ['red', 'green'],
      { red: [HOME, HOME, HOME, 56] },
      { phase: 'move', die: 1 },
    );
    expect(almost.winner).toBeNull();
    const won = move(almost, 3).state;
    expect(won.phase).toBe('over');
    expect(won.winner).toBe('red');
    expect(won.lastEvent?.type).toBe('win');
    expect(roll(won, () => 0.5).ok).toBe(false);
    expect(move(won, 0).error).toBe('game-over');
  });

  it('rejects out-of-phase, bad and occupied actions', () => {
    const fresh = setup(['red', 'green']);
    expect(move(fresh, 0).error).toBe('wrong-phase');
    const rolled = roll(fresh, dieRng(6)).state;
    expect(roll(rolled, () => 0.5).error).toBe('wrong-phase');
    expect(move(rolled, 4).error).toBe('bad-pawn');
    expect(move(rolled, -1).error).toBe('bad-pawn');
    const advanced = roll(fresh, dieRng(2)).state;
    expect(advanced.phase).toBe('roll');
    expect(move(advanced, 0).error).toBe('wrong-phase');
  });

  it('enforces seat ownership on LAN helpers', () => {
    const state = setup(['red', 'green']);
    expect(rollSeat(state, 1, () => 0.5).error).toBe('wrong-phase');
    expect(moveSeat(state, 1, 0).error).toBe('wrong-phase');
    const redRoll = rollSeat(state, 0, dieRng(6));
    expect(redRoll.ok).toBe(true);
    expect(redRoll.state.turn).toBe(0);
    expect(moveSeat(redRoll.state, 0, 0).ok).toBe(true);
  });

  it('gives each seat a complete public view and the right permissions', () => {
    const state = setup(['red', 'green']);
    const red = view(state, 0);
    const green = view(state, 1);
    expect(red.color).toBe('red');
    expect(red.canRoll).toBe(true);
    expect(red.canMove).toBe(false);
    expect(green.canRoll).toBe(false);
    const rolled = roll(state, dieRng(6)).state;
    const redMove = view(rolled, 0);
    expect(redMove.canMove).toBe(true);
    expect(redMove.legal).toEqual([0, 1, 2, 3]);
    expect(view(rolled, 1).legal).toEqual([]);
  });

  it('maps every colour to the same 52-cell ring', () => {
    expect(RING_PATH).toHaveLength(RING_CELLS);
    expect(RING_POINTS).toHaveLength(RING_CELLS);
    expect(new Set(RING_POINTS.map((point) => `${point.x},${point.y}`)).size).toBe(RING_CELLS);
    for (const color of COLORS) {
      expect(ringCell(color, 0)).toBe(START_CELL[color]);
      for (let pos = 0; pos < RING_CELLS; pos++) {
        const cell = ringCell(color, pos);
        expect(cell).not.toBeNull();
        expect(cell!).toBeGreaterThanOrEqual(0);
        expect(cell!).toBeLessThan(RING_CELLS);
      }
      expect(LANE_POINTS[color]).toHaveLength(5);
    }
    expect(startColor(0)).toBe('red');
    expect(startColor(13)).toBe('green');
    expect(startColor(26)).toBe('yellow');
    expect(startColor(39)).toBe('blue');
  });

  it('skips a disconnected seat for the LAN host', () => {
    const state = stateWith(['red', 'green'], { red: [10, -1, -1, -1] }, { die: 4 });
    const result = skipTurn(state);
    expect(result.turn).toBe(1);
    expect(result.phase).toBe('roll');
    expect(result.pawns.red[0]).toBe(10);
    expect(result.lastEvent).toMatchObject({ type: 'pass', color: 'red', die: 4 });
  });

  it('does not mutate the state it is given', () => {
    const state = stateWith(['red', 'green'], { red: [10, -1, -1, -1] }, { phase: 'move', die: 3 });
    const before = JSON.stringify(state);
    const result = move(state, 0);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state).not.toBe(state);
    expect(result.state.pawns.red).not.toBe(state.pawns.red);
  });

  it('serialises to JSON without losing a game', () => {
    const state = stateWith(
      ['red', 'green', 'yellow'],
      { red: [10, HOME, 52, -1], green: [3, 4, 5, 6] },
      { phase: 'move', die: 5, rolls: 12, moves: 9 },
    );
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored).toEqual(state);
    expect(legalMoves(restored)).toEqual(legalMoves(state));
    expect(move(restored, 0).state.pawns.red[0]).toBe(15);
  });
});

describe('Race Home AI', () => {
  it('only returns legal pawn indices for every level', () => {
    const state = stateWith(
      ['red', 'green', 'yellow'],
      { red: [10, 20, 55, -1], green: [0, 7, 12, 30] },
      { phase: 'move', die: 2 },
    );
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      for (const value of [0, 0.3, 0.9]) {
        expect(legal).toContain(chooseMove(state, level, () => value));
      }
    }
    const dead = stateWith(['red', 'green'], { red: [55, -1, -1, -1] }, { phase: 'move', die: 3 });
    expect(chooseMove(dead, 'hard', () => 0.4)).toBe(-1);
  });

  it('takes an immediate winning move on every level', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [HOME, HOME, HOME, 56], green: [10, -1, -1, -1] },
      { phase: 'move', die: 1 },
    );
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseMove(state, level, () => 0.9)).toBe(3);
    }
  });

  it('prefers finishing a pawn to a small advance', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [10, 56, -1, -1], green: [30, -1, -1, -1] },
      { phase: 'move', die: 1 },
    );
    expect(chooseMove(state, 'hard', () => 0.4)).toBe(1);
    expect(chooseMove(state, 'companion', () => 0.9)).toBe(1);
  });

  it('lets Hard capture while Companion looks for a gentler move', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [10, 20, -1, -1], green: [0, -1, -1, -1] },
      { phase: 'move', die: 3 },
    );
    expect(chooseMove(state, 'hard', () => 0.9)).toBe(0);
    expect(chooseMove(state, 'normal', () => 0.9)).toBe(0);
    expect(chooseMove(state, 'companion', () => 0.9)).toBe(1);
  });

  it('explains the reason for a hint', () => {
    const capture = stateWith(
      ['red', 'green'],
      { red: [10, -1, -1, -1], green: [0, -1, -1, -1] },
      { phase: 'move', die: 3 },
    );
    expect(explainMove(capture, 0)?.key).toBe('capture');
    const finish = stateWith(
      ['red', 'green'],
      { red: [HOME, HOME, HOME, 56] },
      { phase: 'move', die: 1 },
    );
    expect(explainMove(finish, 3)?.key).toBe('finish');
    const base = stateWith(['red', 'green'], {}, { phase: 'move', die: 6 });
    expect(explainMove(base, 0)?.key).toBe('base');
    const lane = stateWith(
      ['red', 'green'],
      { red: [51, -1, -1, -1] },
      { phase: 'move', die: 1 },
    );
    expect(explainMove(lane, 0)?.key).toBe('lane');
    expect(explainMove(lane, 1)).toBeNull();
  });

  it('finds opponents waiting one to six squares behind', () => {
    const state = stateWith(
      ['red', 'green'],
      { red: [13, -1, -1, -1], green: [49, LANE_START, LANE_START + 1, HOME] },
    );
    expect(captureRisk(state, 'red', 0)).toBe(1);
    const safe = stateWith(
      ['red', 'green'],
      { red: [13, -1, -1, -1], green: [45, LANE_START, LANE_START + 1, HOME] },
    );
    expect(captureRisk(safe, 'red', 0)).toBe(0);
    const start = stateWith(['red', 'green'], { red: [13, -1, -1, -1] });
    expect(captureRisk(start, 'red', 0)).toBe(1.6);
  });

  it('is deterministic with the same injected RNG sequence', () => {
    const state = stateWith(
      ['red', 'green', 'yellow'],
      { red: [5, 17, 40, -1], green: [3, 22, 44, 8], yellow: [12, 19, 33, 51] },
      { phase: 'move', die: 4 },
    );
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const a = chooseMove(state, level, mulberry32(99));
      const b = chooseMove(state, level, mulberry32(99));
      expect(a).toBe(b);
    }
  });
});

describe('Race Home — a complete seeded race', () => {
  it('finishes a full two-player game and produces one winner', () => {
    let state = setup(['red', 'green']);
    const rng = mulberry32(20261111);
    let guard = 0;
    while (state.phase !== 'over' && guard < 6000) {
      guard += 1;
      if (state.phase === 'roll') {
        const result = roll(state, rng);
        expect(result.ok).toBe(true);
        state = result.state;
      } else {
        const pawn = chooseMove(state, 'normal', rng);
        expect(pawn).toBeGreaterThanOrEqual(0);
        const result = move(state, pawn);
        expect(result.ok).toBe(true);
        state = result.state;
      }
    }
    expect(guard).toBeLessThan(6000);
    expect(state.phase).toBe('over');
    expect(state.winner === 'red' || state.winner === 'green').toBe(true);
    expect(state.pawns[state.winner!].every((pos) => pos === HOME)).toBe(true);
    expect(state.rolls).toBeGreaterThan(10);
  });
});
