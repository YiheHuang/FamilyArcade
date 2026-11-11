import { describe, expect, it } from 'vitest';
import {
  advise,
  chooseHolds,
  exactKeepFor,
  expectedForKeep,
  heuristicKeep,
  planTurn,
} from '../src/ai/ai';
import {
  CATEGORIES,
  applyAction,
  categoryAt,
  classifyHand,
  createGame,
  currentRound,
  emptyLine,
  isGameState,
  openCategories,
  roll,
  scoreDice,
  scoreTurn,
  standings,
  toggleHold,
  totalsFor,
  upperSubtotal,
  viewFor,
  winners,
  type GameState,
} from '../src/game/five-dice';

function players(count = 2) {
  return Array.from({ length: count }, (_, index) => ({ name: `P${index + 1}`, ai: false }));
}

function game(count = 2): GameState {
  return createGame(players(count));
}

function withDice(state: GameState, dice: number[]): GameState {
  return {
    ...state,
    dice: dice.slice(),
    held: [false, false, false, false, false],
    rollsUsed: 1,
    rollsLeft: 2,
  };
}

function seeded(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

function diceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 1;
    index += 1;
    return (value - 1) / 6 + 0.001;
  };
}

function fullGame(count = 2): GameState {
  let state = createGame(players(count));
  const rng = seeded([0.1, 0.4, 0.7, 0.2, 0.9, 0.55, 0.35]);
  let guard = 0;
  while (state.status === 'playing' && guard < 400) {
    state = roll(state, rng).state;
    const open = openCategories(state);
    state = scoreTurn(state, open[0]).state;
    guard += 1;
  }
  return state;
}

describe('Five Dice engine · setup and scoring', () => {
  it('creates an empty table for two to four players', () => {
    const state = game(3);
    expect(state.players).toHaveLength(3);
    expect(state.scores).toHaveLength(3);
    expect(state.scores.every((line) => line.length === 13 && line.every((value) => value === null))).toBe(true);
    expect(state.dice).toEqual([0, 0, 0, 0, 0]);
    expect(state.rollsLeft).toBe(3);
    expect(state.rollsUsed).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.version).toBe(1);
  });

  it('rejects tables outside 2–4 players', () => {
    expect(() => createGame([{ name: 'Solo', ai: false }])).toThrow();
    expect(() => createGame(players(5))).toThrow();
  });

  it('scores upper boxes by matching face', () => {
    const hand = [1, 1, 2, 3, 1];
    expect(scoreDice(hand, 'ones')).toBe(3);
    expect(scoreDice(hand, 'twos')).toBe(2);
    expect(scoreDice(hand, 'threes')).toBe(3);
    expect(scoreDice(hand, 'fours')).toBe(0);
    expect(scoreDice([6, 6, 6, 6, 6], 'sixes')).toBe(30);
  });

  it('scores three and four of a kind as the whole hand', () => {
    expect(scoreDice([2, 2, 2, 5, 6], 'threeKind')).toBe(17);
    expect(scoreDice([2, 2, 2, 2, 6], 'fourKind')).toBe(14);
    expect(scoreDice([2, 2, 3, 3, 6], 'threeKind')).toBe(0);
    expect(scoreDice([2, 2, 2, 3, 3], 'fourKind')).toBe(0);
  });

  it('scores a full house at 25 and rejects a five-of-a-kind as a house', () => {
    expect(scoreDice([3, 3, 3, 5, 5], 'fullHouse')).toBe(25);
    expect(scoreDice([1, 1, 2, 2, 2], 'fullHouse')).toBe(25);
    expect(scoreDice([6, 6, 6, 6, 6], 'fullHouse')).toBe(0);
    expect(scoreDice([3, 3, 4, 4, 5], 'fullHouse')).toBe(0);
  });

  it('scores small and large straights', () => {
    expect(scoreDice([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
    expect(scoreDice([2, 3, 4, 5, 5], 'smallStraight')).toBe(30);
    expect(scoreDice([1, 2, 3, 5, 6], 'smallStraight')).toBe(0);
    expect(scoreDice([2, 3, 4, 5, 6], 'largeStraight')).toBe(40);
    expect(scoreDice([1, 2, 3, 4, 5], 'largeStraight')).toBe(40);
    expect(scoreDice([1, 2, 3, 4, 4], 'largeStraight')).toBe(0);
  });

  it('scores five of a kind at 50 and chance as the raw sum', () => {
    expect(scoreDice([5, 5, 5, 5, 5], 'fiveKind')).toBe(50);
    expect(scoreDice([5, 5, 5, 5, 4], 'fiveKind')).toBe(0);
    expect(scoreDice([1, 2, 3, 4, 6], 'chance')).toBe(16);
  });

  it('returns zero for malformed dice', () => {
    expect(scoreDice([1, 2, 3, 4], 'chance')).toBe(0);
    expect(scoreDice([0, 1, 2, 3, 4], 'chance')).toBe(0);
    expect(scoreDice([1, 2, 3, 4, 7], 'chance')).toBe(0);
  });

  it('adds the 35-point upper bonus at 63', () => {
    const line = [5, 10, 15, 20, 13, 0, ...Array(7).fill(null)] as Array<number | null>;
    expect(upperSubtotal(line)).toBe(63);
    const totals = totalsFor(line);
    expect(totals.upper).toBe(63);
    expect(totals.bonus).toBe(35);
    expect(totals.total).toBe(98);
    const justShort = [5, 10, 15, 20, 12, 0, ...Array(7).fill(null)] as Array<number | null>;
    expect(totalsFor(justShort).bonus).toBe(0);
  });
});

describe('Five Dice engine · turn flow', () => {
  it('rolls five dice and counts the first roll', () => {
    const state = game();
    const result = roll(state, diceRng([1, 2, 3, 4, 5]));
    expect(result.ok).toBe(true);
    expect(result.state.dice).toEqual([1, 2, 3, 4, 5]);
    expect(result.state.rollsUsed).toBe(1);
    expect(result.state.rollsLeft).toBe(2);
    expect(result.state.held).toEqual([false, false, false, false, false]);
  });

  it('keeps held dice and rerolls only the rest', () => {
    const first = roll(game(), diceRng([1, 2, 3, 4, 5])).state;
    const held = toggleHold(toggleHold(first, 0).state, 2).state;
    expect(held.held).toEqual([true, false, true, false, false]);
    const second = roll(held, diceRng([6, 6, 6, 6, 6]));
    expect(second.state.dice[0]).toBe(1);
    expect(second.state.dice[2]).toBe(3);
    expect(second.state.dice[1]).toBe(6);
    expect(second.state.rollsLeft).toBe(1);
    expect(second.state.rollsUsed).toBe(2);
  });

  it('cannot hold before rolling or after the third roll', () => {
    expect(toggleHold(game(), 0).error).toBe('must-roll');
    const first = roll(game(), () => 0).state;
    const second = roll(first, () => 0).state;
    const third = roll(second, () => 0).state;
    expect(third.rollsLeft).toBe(0);
    expect(toggleHold(third, 0).error).toBe('no-rolls');
    expect(toggleHold(first, -1).error).toBe('bad-die');
    expect(toggleHold(first, 5).error).toBe('bad-die');
    expect(roll(third, () => 0).error).toBe('no-rolls');
  });

  it('requires at least one roll before scoring', () => {
    expect(scoreTurn(game(), 0).error).toBe('must-roll');
  });

  it('rejects taken categories and bad indexes', () => {
    const rolled = roll(game(), diceRng([1, 1, 1, 2, 3])).state;
    const scored = scoreTurn(rolled, 0).state;
    const taken = { ...scored, turn: 0, rollsUsed: 1, rollsLeft: 2, dice: rolled.dice };
    expect(scoreTurn(taken, 0).error).toBe('taken');
    expect(scoreTurn(rolled, 13).error).toBe('bad-category');
    expect(scoreTurn(rolled, -1).error).toBe('bad-category');
  });

  it('fills a box, records the score and passes the turn', () => {
    const rolled = roll(game(), diceRng([1, 1, 1, 2, 3])).state;
    const scored = scoreTurn(rolled, 0);
    expect(scored.ok).toBe(true);
    expect(scored.state.scores[0][0]).toBe(3);
    expect(scored.state.last).toEqual({ player: 0, category: 'ones', points: 3 });
    expect(scored.state.turn).toBe(1);
    expect(scored.state.turnCount).toBe(1);
    expect(scored.state.dice).toEqual([0, 0, 0, 0, 0]);
    expect(scored.state.rollsLeft).toBe(3);
    expect(currentRound(scored.state)).toBe(1);
  });

  it('enforces the active seat in applyAction', () => {
    expect(applyAction(game(), 1, { type: 'roll' }, () => 0).error).toBe('wrong-turn');
    expect(applyAction(game(), 9, { type: 'roll' }, () => 0).error).toBe('bad-seat');
    const rolled = applyAction(game(), 0, { type: 'roll' }, diceRng([2, 2, 2, 3, 4]));
    expect(rolled.ok).toBe(true);
    const held = applyAction(rolled.state, 0, { type: 'hold', index: 0 }, () => 0);
    expect(held.ok).toBe(true);
    const scored = applyAction(held.state, 0, { type: 'score', category: 0 }, () => 0);
    expect(scored.ok).toBe(true);
    expect(scored.state.scores[0][0]).toBe(0);
    expect(scored.state.turn).toBe(1);
  });

  it('plays a complete two-player game and finishes', () => {
    const state = fullGame(2);
    expect(state.status).toBe('over');
    expect(state.turnCount).toBe(26);
    expect(state.scores.every((line) => line.every((value) => value !== null))).toBe(true);
    expect(winners(state)).toHaveLength(1);
    expect(roll(state, () => 0).error).toBe('game-over');
    expect(scoreTurn(state, 0).error).toBe('game-over');
  });

  it('rotates seats through a complete four-player game', () => {
    let state = createGame(players(4));
    const rng = seeded([0.2, 0.8, 0.4, 0.6, 0.1, 0.9, 0.3]);
    const seats: number[] = [];
    let guard = 0;
    while (state.status === 'playing' && guard < 400) {
      seats.push(state.turn);
      state = roll(state, rng).state;
      state = scoreTurn(state, openCategories(state)[0]).state;
      guard += 1;
    }
    expect(state.status).toBe('over');
    expect(state.turnCount).toBe(52);
    expect(seats.slice(0, 8)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(state.scores.every((line) => line.every((value) => value !== null))).toBe(true);
  });

  it('ranks standings and shares the win on a tie', () => {
    const state = game(3);
    state.scores[0] = emptyLine();
    state.scores[1] = emptyLine();
    state.scores[2] = emptyLine();
    for (let index = 0; index < 13; index += 1) {
      state.scores[0][index] = 1;
      state.scores[1][index] = 1;
      state.scores[2][index] = 0;
    }
    state.status = 'over';
    const table = standings(state);
    expect(table.map((row) => row.player)).toEqual([0, 1, 2]);
    expect(table.map((row) => row.rank)).toEqual([1, 1, 3]);
    expect(winners(state)).toEqual([0, 1]);
  });
});

describe('Five Dice engine · views and serialisation', () => {
  it('gives each seat its own open boxes and turn flag', () => {
    const state = roll(game(3), diceRng([1, 2, 3, 4, 5])).state;
    const first = viewFor(state, 0);
    const second = viewFor(state, 1);
    expect(first.seat).toBe(0);
    expect(first.canAct).toBe(true);
    expect(second.canAct).toBe(false);
    expect(first.open).toHaveLength(13);
    expect(second.open).toHaveLength(13);
    expect(first.totals).toHaveLength(3);
    expect(first.winners).toEqual([]);
  });

  it('excludes filled boxes from a seat view', () => {
    let state = roll(game(), diceRng([1, 1, 1, 2, 3])).state;
    state = scoreTurn(state, 0).state;
    const view = viewFor(state, 0);
    expect(view.open).not.toContain(0);
    expect(view.open).toHaveLength(12);
    expect(view.scores[0][0]).toBe(3);
    expect(view.canAct).toBe(false);
    expect(view.turn).toBe(1);
  });

  it('falls back to seat zero for an invalid view seat', () => {
    const view = viewFor(game(), 99);
    expect(view.seat).toBe(0);
  });

  it('recognises a valid serialised state and rejects broken ones', () => {
    const state = game();
    expect(isGameState(state)).toBe(true);
    expect(isGameState({ ...state, version: 2 })).toBe(false);
    expect(isGameState({ ...state, dice: [1, 2, 3] })).toBe(false);
    expect(isGameState({ ...state, scores: [] })).toBe(false);
    expect(isGameState(null)).toBe(false);
  });

  it('rejects corrupted dice, held flags and score values in a save', () => {
    const state = game();
    expect(isGameState({ ...state, dice: [1, 2, 3, 4, 9] })).toBe(false);
    expect(isGameState({ ...state, held: [true, false, false, false] })).toBe(false);
    const badScores = state.scores.map((line) => line.slice());
    badScores[0][0] = Number.NaN;
    expect(isGameState({ ...state, scores: badScores })).toBe(false);
    expect(isGameState({ ...state, rollsLeft: 9 })).toBe(false);
  });

  it('classifies friendly hand names', () => {
    expect(classifyHand([6, 6, 6, 6, 6])).toBe('fiveKind');
    expect(classifyHand([1, 2, 3, 4, 5])).toBe('largeStraight');
    expect(classifyHand([1, 2, 3, 4, 6])).toBe('smallStraight');
    expect(classifyHand([3, 3, 3, 5, 5])).toBe('fullHouse');
    expect(classifyHand([4, 4, 4, 4, 2])).toBe('fourKind');
    expect(classifyHand([2, 2, 2, 3, 4])).toBe('threeKind');
    expect(classifyHand([2, 2, 5, 5, 6])).toBe('twoPair');
    expect(classifyHand([2, 2, 3, 4, 6])).toBe('pair');
    expect(classifyHand([1, 2, 3, 5, 6])).toBe('high');
    expect(classifyHand([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('Five Dice AI', () => {
  it('returns an open category at every level', () => {
    const state = withDice(game(3), [2, 2, 3, 5, 6]);
    state.scores[0][0] = 4;
    state.scores[0][8] = 25;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const plan = planTurn(state, level, () => 0.4);
      expect(plan.category).toBeGreaterThanOrEqual(0);
      expect(plan.category).toBeLessThan(13);
      expect(openCategories(state)).toContain(plan.category);
      expect(plan.hold).toHaveLength(5);
    }
  });

  it('is deterministic with the same injected rng', () => {
    const state = withDice(game(), [1, 1, 2, 3, 6]);
    const a = planTurn(state, 'easy', seeded([0.12, 0.74, 0.33]));
    const b = planTurn(state, 'easy', seeded([0.12, 0.74, 0.33]));
    expect(a).toEqual(b);
    const c = planTurn(state, 'hard', seeded([0.5]));
    const d = planTurn(state, 'hard', seeded([0.5]));
    expect(c).toEqual(d);
  });

  it('lets the companion chase a fun full house', () => {
    const state = withDice(game(), [3, 3, 3, 5, 5]);
    const plan = planTurn(state, 'companion', () => 0);
    expect(plan.category).toBe(CATEGORIES.indexOf('fullHouse'));
    expect(plan.shouldRoll).toBe(false);
    expect(plan.reason).toBe('fun');
  });

  it('lets hard lock a five of a kind', () => {
    const state = withDice(game(), [2, 2, 2, 2, 2]);
    const plan = planTurn(state, 'hard', () => 0.5);
    expect(plan.category).toBe(CATEGORIES.indexOf('fiveKind'));
    expect(plan.shouldRoll).toBe(false);
  });

  it('weights the upper bonus when a box reaches 63', () => {
    const state = withDice(game(), [5, 5, 5, 1, 4]);
    state.scores[0][0] = 5;
    state.scores[0][1] = 10;
    state.scores[0][2] = 15;
    state.scores[0][3] = 20;
    state.scores[0][5] = 3;
    const plan = planTurn(state, 'hard', () => 0.5);
    expect(plan.category).toBe(CATEGORIES.indexOf('fives'));
    expect(plan.reason).toBe('bonus');
  });

  it('keeps the largest group on Easy', () => {
    const state = withDice(game(), [6, 1, 6, 2, 3]);
    const hold = chooseHolds(state, 'easy', () => 0.9);
    expect(hold).toEqual([true, false, true, false, false]);
  });

  it('uses exact keep odds for four sixes', () => {
    const keep = exactKeepFor([6, 6, 6, 6, 2], 'sixes');
    expect(keep.hold).toEqual([true, true, true, true, false]);
    expect(keep.ev).toBeGreaterThan(24);
    expect(keep.ev).toBeLessThanOrEqual(26);
  });

  it('computes exact expected values for a fresh sixes chase', () => {
    const ev = expectedForKeep([1, 1, 1, 1, 1], [false, false, false, false, false], 'sixes');
    expect(ev).toBeCloseTo(5, 6);
    const kept = expectedForKeep([6, 6, 1, 1, 1], [true, true, false, false, false], 'sixes');
    expect(kept).toBeCloseTo(12 + 3 * (1 / 6) * 6, 6);
  });

  it('keeps a useful straight shape on Normal', () => {
    const hold = heuristicKeep([1, 2, 3, 4, 6], 'smallStraight');
    expect(hold.slice(0, 4).every(Boolean)).toBe(true);
    expect(hold[4]).toBe(false);
  });

  it('produces a hint for a live human turn', () => {
    const state = withDice(game(), [4, 4, 4, 2, 1]);
    const advice = advise(state);
    expect(openCategories(state)).toContain(advice.category);
    expect(advice.hold).toHaveLength(5);
    expect(advice.immediate).toBe(scoreDice(state.dice, categoryAt(advice.category)!));
  });

  it('never returns a taken category after a full game', () => {
    const state = fullGame(2);
    expect(openCategories(state)).toHaveLength(0);
    const plan = planTurn(state, 'hard', () => 0.5);
    expect(plan.shouldRoll).toBe(false);
  });
});
