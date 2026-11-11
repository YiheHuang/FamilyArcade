import { describe, expect, it } from 'vitest';
import { chooseShot, hint } from '../src/ai/ai';
import {
  BOARD_SIZE,
  FLEET,
  clearFleet,
  coordLabel,
  fire,
  fleetComplete,
  placeFleet,
  placeShip,
  randomFleet,
  readyUp,
  removeShip,
  setup,
  shipCells,
  view,
  type GameState,
  type Ship,
} from '../src/game/fleet';

const A: Ship[] = [
  { id: 'carrier', cells: [0, 1, 2, 3, 4] },
  { id: 'battleship', cells: [10, 11, 12, 13] },
  { id: 'cruiser', cells: [20, 21, 22] },
  { id: 'submarine', cells: [30, 31, 32] },
  { id: 'destroyer', cells: [40, 41] },
];

const B: Ship[] = [
  { id: 'carrier', cells: [90, 91, 92, 93, 94] },
  { id: 'battleship', cells: [80, 81, 82, 83] },
  { id: 'cruiser', cells: [70, 71, 72] },
  { id: 'submarine', cells: [60, 61, 62] },
  { id: 'destroyer', cells: [50, 51] },
];

function playing(a: Ship[] = A, b: Ship[] = B): GameState {
  let state = setup();
  state = placeFleet(state, 0, a).state;
  state = placeFleet(state, 1, b).state;
  state = readyUp(state, 0).state;
  state = readyUp(state, 1).state;
  return state;
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B_ORDER = [90, 91, 92, 93, 94, 80, 81, 82, 83, 70, 71, 72, 60, 61, 62, 50, 51];
const MISSES_FOR_ONE = [9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 8, 18, 28, 38, 48, 58, 68];

function finishByHittingB(state: GameState): GameState {
  let current = state;
  let index = 0;
  while (current.phase === 'playing') {
    if (current.turn === 0) {
      const result = fire(current, 0, B_ORDER[index]);
      expect(result.ok).toBe(true);
      index += 1;
      current = result.state;
    } else {
      const miss = MISSES_FOR_ONE.find((cell) => !current.boards[0].shots.some((shot) => shot.cell === cell));
      expect(miss).toBeDefined();
      const result = fire(current, 1, miss as number);
      expect(result.ok).toBe(true);
      current = result.state;
    }
  }
  return current;
}

describe('Fleet board and placement', () => {
  it('starts on an empty 10x10 chart in the placing phase', () => {
    const state = setup();
    expect(BOARD_SIZE).toBe(10);
    expect(state.boards[0].ships).toHaveLength(0);
    expect(state.boards[1].shots).toHaveLength(0);
    expect(state.phase).toBe('placing');
    expect(state.ready).toEqual([false, false]);
    expect(state.turn).toBe(0);
  });

  it('uses the five classic hull lengths', () => {
    expect(FLEET.map((ship) => [ship.id, ship.length])).toEqual([
      ['carrier', 5],
      ['battleship', 4],
      ['cruiser', 3],
      ['submarine', 3],
      ['destroyer', 2],
    ]);
  });

  it('computes horizontal and vertical cells and rejects edge overflow', () => {
    expect(shipCells(0, 5, true)).toEqual([0, 1, 2, 3, 4]);
    expect(shipCells(0, 5, false)).toEqual([0, 10, 20, 30, 40]);
    expect(shipCells(8, 3, true)).toBeNull();
    expect(shipCells(80, 3, false)).toBeNull();
    expect(shipCells(-1, 2, true)).toBeNull();
  });

  it('places a ship and records its cells', () => {
    const result = placeShip(setup(), 0, 'carrier', 0, true);
    expect(result.ok).toBe(true);
    expect(result.state.boards[0].ships[0].cells).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects overlapping hulls', () => {
    let state = setup();
    state = placeShip(state, 0, 'carrier', 0, true).state;
    const result = placeShip(state, 0, 'cruiser', 2, true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('occupied');
  });

  it('rejects a second copy of the same hull', () => {
    let state = setup();
    state = placeShip(state, 0, 'carrier', 0, true).state;
    const result = placeShip(state, 0, 'carrier', 50, true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('already-placed');
  });

  it('rejects a hull that runs off the chart', () => {
    const result = placeShip(setup(), 0, 'battleship', 7, true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bad-start');
  });

  it('allows ships to touch and clears a fleet on request', () => {
    let state = setup();
    state = placeShip(state, 0, 'carrier', 0, true).state;
    state = placeShip(state, 0, 'destroyer', 10, true).state;
    expect(state.boards[0].ships).toHaveLength(2);
    expect(clearFleet(state, 0).boards[0].ships).toHaveLength(0);
    expect(clearFleet(state, 0).boards[1].ships).toHaveLength(0);
  });

  it('requires all five hulls before a captain can be ready', () => {
    let state = setup();
    state = placeShip(state, 0, 'carrier', 0, true).state;
    expect(readyUp(state, 0).error).toBe('not-ready');
    state = placeFleet(state, 0, A).state;
    expect(fleetComplete(state, 0)).toBe(true);
    expect(readyUp(state, 0).ok).toBe(true);
  });

  it('starts play only when both captains are ready', () => {
    let state = setup();
    state = placeFleet(state, 0, A).state;
    state = placeFleet(state, 1, B).state;
    state = readyUp(state, 0).state;
    expect(state.phase).toBe('placing');
    state = readyUp(state, 1).state;
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe(0);
  });

  it('builds a deterministic, legal random fleet', () => {
    const first = randomFleet(seeded(42));
    const second = randomFleet(seeded(42));
    expect(first).toEqual(second);
    expect(first.map((ship) => ship.id)).toEqual(FLEET.map((ship) => ship.id));
    const cells = first.flatMap((ship) => ship.cells);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).toHaveLength(17);
    let state = setup();
    expect(placeFleet(state, 0, first).ok).toBe(true);
  });

  it('rejects malformed fleets and occupied charts', () => {
    expect(placeFleet(setup(), 0, A.slice(0, 4)).error).toBe('bad-ship');
    const overlapping: Ship[] = A.map((ship) => ({ ...ship }));
    overlapping[4] = { id: 'destroyer', cells: [0, 1] };
    expect(placeFleet(setup(), 0, overlapping).error).toBe('bad-ship');
  });

  it('locks the dock once the battle starts', () => {
    const state = playing();
    expect(placeShip(state, 0, 'carrier', 99, true).error).toBe('wrong-phase');
    expect(clearFleet(state, 0).boards[0].ships).toHaveLength(5);
    expect(removeShip(state, 0, 'carrier').boards[0].ships).toHaveLength(5);
  });

  it('labels coordinates from A1 to J10', () => {
    expect(coordLabel(0)).toBe('A1');
    expect(coordLabel(9)).toBe('A10');
    expect(coordLabel(99)).toBe('J10');
    expect(coordLabel(100)).toBe('—');
  });
});

describe('Fleet gunnery', () => {
  it('records a miss and hands the turn over', () => {
    const result = fire(playing(), 0, 0);
    expect(result.ok).toBe(true);
    expect(result.shot?.result).toBe('miss');
    expect(result.state.boards[1].shots).toHaveLength(1);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('playing');
  });

  it('records a hit without revealing the hull', () => {
    const result = fire(playing(), 0, 90);
    expect(result.shot?.result).toBe('hit');
    expect(result.shot?.ship).toBeNull();
    expect(result.state.boards[1].shots[0].ship).toBe('carrier');
    expect(view(result.state, 0).enemyShips).toHaveLength(0);
  });

  it('rejects a shot on the same square twice', () => {
    const first = fire(playing(), 0, 50);
    const reply = fire(first.state, 1, 9);
    const second = fire(reply.state, 0, 50);
    expect(second.ok).toBe(false);
    expect(second.error).toBe('already-shot');
  });

  it('rejects a shot out of order, out of bounds, and before play', () => {
    const state = playing();
    expect(fire(state, 1, 0).error).toBe('wrong-turn');
    expect(fire(state, 0, 100).error).toBe('bad-cell');
    expect(fire(setup(), 0, 0).error).toBe('wrong-phase');
  });

  it('marks a hull sunk when every cell is hit', () => {
    let state = playing();
    state = fire(state, 0, 50).state;
    state = fire(state, 1, 9).state;
    const second = fire(state, 0, 51);
    expect(second.shot?.result).toBe('sunk');
    expect(second.shot?.ship).toBe('destroyer');
    const seen = view(second.state, 0);
    expect(seen.enemyShips).toHaveLength(1);
    expect(seen.enemyShips[0]).toMatchObject({ id: 'destroyer', cells: [50, 51], sunk: true });
    expect(seen.lastMove).toMatchObject({ result: 'sunk', ship: 'destroyer' });
  });

  it('hides live enemy hulls but exposes its roster and shots', () => {
    const state = fire(playing(), 0, 90).state;
    const seen = view(state, 0);
    expect(seen.enemyShips).toHaveLength(0);
    expect(seen.enemyFleet).toHaveLength(5);
    expect(seen.enemyFleet.every((ship) => !ship.sunk)).toBe(true);
    expect(seen.enemyBoardShots).toEqual([{ cell: 90, result: 'hit' }]);
    expect(seen.lastMove).toMatchObject({ cell: 90, result: 'hit', ship: null });
    expect(seen.myShips).toHaveLength(5);
  });

  it('gives each seat a different view', () => {
    const state = fire(playing(), 0, 90).state;
    const one = view(state, 0);
    const two = view(state, 1);
    expect(one.seat).toBe(0);
    expect(two.seat).toBe(1);
    expect(one.canFire).toBe(false);
    expect(two.canFire).toBe(true);
    expect(two.ownBoardShots).toEqual([{ cell: 90, result: 'hit' }]);
    expect(two.enemyBoardShots).toHaveLength(0);
  });

  it('finishes only when the entire fleet is sunk', () => {
    const finished = finishByHittingB(playing());
    expect(finished.phase).toBe('finished');
    expect(finished.winner).toBe(0);
    expect(finished.boards[1].ships.every((ship) => ship.cells.every((cell) => finished.boards[1].shots.some((shot) => shot.cell === cell)))).toBe(true);
    expect(fire(finished, 0, 50).error).toBe('game-over');
    expect(view(finished, 0).enemyShips).toHaveLength(5);
  });
});

describe('Fleet AI', () => {
  it('always returns an unshot cell on every level', () => {
    let state = playing();
    state = fire(state, 0, 99).state;
    state = fire(state, 1, 9).state;
    state = fire(state, 0, 98).state;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed < 8; seed += 1) {
        const cell = chooseShot(view(state, 1), level, seeded(seed));
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(100);
        expect(cell).not.toBe(99);
        expect(cell).not.toBe(98);
      }
    }
  });

  it('is deterministic for a given injected RNG', () => {
    const state = playing();
    const seen = view(state, 0);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const a = chooseShot(seen, level, seeded(9));
      const b = chooseShot(seen, level, seeded(9));
      expect(a).toBe(b);
    }
  });

  it('normal extends a line of hits before hunting elsewhere', () => {
    let state = playing();
    state = fire(state, 0, 91).state;
    state = fire(state, 1, 9).state;
    state = fire(state, 0, 92).state;
    const cell = chooseShot(view(state, 0), 'normal', () => 0);
    expect([90, 93]).toContain(cell);
  });

  it('hard never fires at a known miss or sunk cell', () => {
    let state = playing();
    state = fire(state, 0, 99).state;
    state = fire(state, 1, 9).state;
    state = fire(state, 0, 98).state;
    const seen = view(state, 0);
    for (let seed = 1; seed < 12; seed += 1) {
      const cell = chooseShot(seen, 'hard', seeded(seed));
      expect(seen.enemyBoardShots.map((shot) => shot.cell)).not.toContain(cell);
    }
  });

  it('hard concentrates around an unresolved hit', () => {
    let state = playing();
    state = fire(state, 0, 90).state;
    const seen = view(state, 0);
    const cell = chooseShot(seen, 'hard', () => 0);
    expect([80, 89, 91]).toContain(cell);
  });

  it('companion is gentle but legal, including near misses', () => {
    let state = playing();
    state = fire(state, 0, 99).state;
    const seen = view(state, 0);
    for (let seed = 1; seed < 20; seed += 1) {
      const cell = chooseShot(seen, 'companion', seeded(seed));
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).not.toBe(99);
    }
  });

  it('hints a legal target and explains why', () => {
    let state = playing();
    expect(hint(view(state, 0))?.reason).toBeTruthy();
    state = fire(state, 0, 92).state;
    const advice = hint(view(state, 0), () => 0);
    expect(advice).not.toBeNull();
    expect(advice?.reason).toBe('target');
    expect(view(state, 0).enemyBoardShots.map((shot) => shot.cell)).not.toContain(advice?.cell);
  });

  it('returns -1 only when every enemy square is already shot', () => {
    const seen = view(playing(), 0);
    const full = {
      ...seen,
      enemyBoardShots: Array.from({ length: 100 }, (_, cell) => ({ cell, result: 'miss' as const })),
      enemyFleet: [],
    };
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseShot(full, level, () => 0.5)).toBe(-1);
    }
  });
});
