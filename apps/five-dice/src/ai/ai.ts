import {
  CATEGORIES,
  UPPER_TARGET,
  isUpper,
  openCategories,
  scoreDice,
  upperSubtotal,
  type Category,
  type GameState,
} from '../game/five-dice';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];
export type Rng = () => number;

export type AdviceReason = 'points' | 'bonus' | 'kind' | 'house' | 'straight' | 'chance' | 'fun';

export interface AiPlan {
  category: number;
  hold: boolean[];
  shouldRoll: boolean;
  expected: number;
  immediate: number;
  reason: AdviceReason;
}

interface Candidate {
  index: number;
  category: Category;
  points: number;
  weighted: number;
  hold: boolean[];
  expected: number;
}

const ALL_HELD = Array<boolean>(5).fill(true);
const NONE_HELD = Array<boolean>(5).fill(false);

function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('cannot pick from an empty list');
  const raw = Math.floor(rng() * items.length);
  const index = Math.min(items.length - 1, Math.max(0, raw));
  return items[index];
}

function bonusWeight(state: GameState, category: Category, points: number): number {
  if (!isUpper(category)) return 0;
  const subtotal = upperSubtotal(state.scores[state.turn]);
  const gap = UPPER_TARGET - subtotal;
  if (gap <= 0) return 0;
  if (points >= gap) return 12;
  if (points >= gap * 0.5) return 3;
  return 0;
}

function reasonFor(category: Category, points: number, state: GameState): AdviceReason {
  if (isUpper(category) && upperSubtotal(state.scores[state.turn]) + points >= UPPER_TARGET) {
    return 'bonus';
  }
  if (category === 'fullHouse') return 'house';
  if (category === 'smallStraight' || category === 'largeStraight') return 'straight';
  if (category === 'threeKind' || category === 'fourKind' || category === 'fiveKind') return 'kind';
  if (category === 'chance') return 'chance';
  return 'points';
}

function groupIndices(dice: readonly number[]): number[][] {
  const groups: number[][] = Array.from({ length: 7 }, () => []);
  dice.forEach((die, index) => {
    if (die >= 1 && die <= 6) groups[die].push(index);
  });
  return groups;
}

function largestGroupMask(dice: readonly number[]): boolean[] {
  const groups = groupIndices(dice);
  let best: number[] = [];
  for (let face = 1; face <= 6; face += 1) {
    if (groups[face].length > best.length) best = groups[face];
  }
  const mask = NONE_HELD.slice();
  for (const index of best) mask[index] = true;
  return mask;
}

/** Keep one die for every face in the longest consecutive run. */
function straightMask(dice: readonly number[]): boolean[] {
  const present = new Set(dice);
  let bestStart = 1;
  let bestLength = 0;
  for (let start = 1; start <= 6; start += 1) {
    let length = 0;
    while (start + length <= 6 && present.has(start + length)) length += 1;
    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
    }
  }
  const mask = NONE_HELD.slice();
  if (bestLength < 2) {
    // Keep the highest die so the hand has something to build on.
    let highest = 0;
    dice.forEach((die, index) => {
      if (die > highest) {
        highest = die;
        for (let i = 0; i < mask.length; i += 1) mask[i] = false;
        mask[index] = true;
      }
    });
    return mask;
  }
  for (let face = bestStart; face < bestStart + bestLength; face += 1) {
    const index = dice.findIndex((die, position) => die === face && !mask[position]);
    if (index >= 0) mask[index] = true;
  }
  return mask;
}

function keepFor(dice: readonly number[], category: Category): boolean[] {
  const upper = CATEGORIES.indexOf(category);
  if (upper >= 0 && upper < 6) {
    const face = upper + 1;
    return dice.map((die) => die === face);
  }
  if (category === 'threeKind' || category === 'fourKind' || category === 'fiveKind') {
    return largestGroupMask(dice);
  }
  if (category === 'fullHouse') {
    const groups = groupIndices(dice);
    const ranked = groups
      .map((indices, face) => ({ indices, face }))
      .filter((group) => group.face > 0 && group.indices.length >= 2)
      .sort((a, b) => b.indices.length - a.indices.length || b.face - a.face);
    const mask = NONE_HELD.slice();
    if (ranked.length >= 2) {
      for (const index of [...ranked[0].indices, ...ranked[1].indices]) mask[index] = true;
      return mask;
    }
    if (ranked.length === 1) {
      for (const index of ranked[0].indices) mask[index] = true;
      let highest = 0;
      dice.forEach((die, index) => {
        if (!mask[index] && die > highest) highest = die;
      });
      const extra = dice.findIndex((die, index) => !mask[index] && die === highest);
      if (extra >= 0) mask[extra] = true;
      return mask;
    }
    return straightMask(dice);
  }
  if (category === 'smallStraight' || category === 'largeStraight') return straightMask(dice);
  if (category === 'chance') {
    const ranked = dice
      .map((die, index) => ({ die, index }))
      .sort((a, b) => b.die - a.die)
      .slice(0, 3);
    const mask = NONE_HELD.slice();
    for (const item of ranked) mask[item.index] = true;
    return mask;
  }
  return largestGroupMask(dice);
}

function expectedAfterKeep(
  dice: readonly number[],
  keep: readonly boolean[],
  category: Category,
): number {
  const rerolls = keep.flatMap((held, index) => (held ? [] : [index]));
  const base = dice.slice();
  if (rerolls.length === 0) return scoreDice(base, category);
  const outcomes = 6 ** rerolls.length;
  let sum = 0;
  for (let outcome = 0; outcome < outcomes; outcome += 1) {
    let value = outcome;
    const hand = base.slice();
    for (const index of rerolls) {
      hand[index] = (value % 6) + 1;
      value = Math.floor(value / 6);
    }
    sum += scoreDice(hand, category);
  }
  return sum / outcomes;
}

function exactKeep(
  dice: readonly number[],
  category: Category,
): { hold: boolean[]; ev: number } {
  if (dice.every((die) => die === 0)) {
    return { hold: NONE_HELD.slice(), ev: expectedAfterKeep(dice.map(() => 1), NONE_HELD, category) };
  }
  let bestHold = ALL_HELD.slice();
  let bestEv = scoreDice(dice, category);
  for (let mask = 0; mask < 32; mask += 1) {
    const hold = Array.from({ length: 5 }, (_, index) => (mask & (1 << index)) !== 0);
    const ev = expectedAfterKeep(dice, hold, category);
    if (ev > bestEv + 1e-9) {
      bestEv = ev;
      bestHold = hold;
    }
  }
  return { hold: bestHold, ev: bestEv };
}

function immediateCandidates(state: GameState): Candidate[] {
  return openCategories(state).map((index) => {
    const category = CATEGORIES[index];
    const points = scoreDice(state.dice, category);
    return {
      index,
      category,
      points,
      weighted: points + bonusWeight(state, category, points),
      hold: ALL_HELD.slice(),
      expected: points,
    };
  });
}

function bestCandidate(
  candidates: readonly Candidate[],
  rng: Rng | null,
): Candidate {
  let best = candidates[0];
  let ties: Candidate[] = [best];
  for (const candidate of candidates.slice(1)) {
    if (candidate.weighted > best.weighted + 1e-9) {
      best = candidate;
      ties = [candidate];
    } else if (Math.abs(candidate.weighted - best.weighted) < 1e-9) {
      ties.push(candidate);
    }
  }
  if (ties.length > 1 && rng) return pick(ties, rng);
  return best;
}

function evaluate(
  state: GameState,
  exact: boolean,
): Candidate[] {
  return openCategories(state).map((index) => {
    const category = CATEGORIES[index];
    if (state.rollsLeft <= 0) {
      const points = scoreDice(state.dice, category);
      return {
        index,
        category,
        points,
        expected: points,
        weighted: points + bonusWeight(state, category, points),
        hold: ALL_HELD.slice(),
      };
    }
    const blank = state.dice.every((die) => die === 0);
    const hold = blank
      ? NONE_HELD.slice()
      : exact
        ? exactKeep(state.dice, category).hold
        : keepFor(state.dice, category);
    const ev = expectedAfterKeep(state.dice, hold, category);
    return {
      index,
      category,
      points: scoreDice(state.dice, category),
      expected: ev,
      weighted: ev + bonusWeight(state, category, ev),
      hold,
    };
  });
}

function anyUnheld(hold: readonly boolean[]): boolean {
  return hold.some((value) => !value);
}

function companionCandidate(state: GameState, rng: Rng): Candidate {
  const open = immediateCandidates(state);
  const funOrder: Category[] = ['fiveKind', 'largeStraight', 'fullHouse', 'smallStraight'];
  const fun = funOrder
    .flatMap((category) => open.filter((candidate) => candidate.category === category))
    .filter((candidate) => candidate.points > 0);
  if (fun.length > 0) return pick(fun, rng);
  const upper = open.filter((candidate) => isUpper(candidate.category) && candidate.points > 0);
  if (upper.length > 0) return bestCandidate(upper, rng);
  return bestCandidate(open, rng);
}

function companionKeep(dice: readonly number[]): boolean[] {
  const groups = groupIndices(dice);
  const largest = Math.max(...groups.slice(1).map((group) => group.length));
  if (largest >= 2) return largestGroupMask(dice);
  const run = straightMask(dice);
  if (run.filter(Boolean).length >= 2) return run;
  // Keep the two highest dice: gentle and easy to understand.
  const mask = NONE_HELD.slice();
  const ranked = dice
    .map((die, index) => ({ die, index }))
    .sort((a, b) => b.die - a.die)
    .slice(0, 2);
  for (const item of ranked) mask[item.index] = true;
  return mask;
}

/**
 * One decision for the current AI seat. The caller can either roll with `hold`
 * or score `category`; `shouldRoll` already balances the two.
 */
export function planTurn(state: GameState, level: AiLevel, rng: Rng): AiPlan {
  const open = openCategories(state);
  if (open.length === 0) {
    return {
      category: 0,
      hold: ALL_HELD.slice(),
      shouldRoll: false,
      expected: 0,
      immediate: 0,
      reason: 'points',
    };
  }
  const fallback = immediateCandidates(state);
  const bestNow = bestCandidate(fallback, rng);
  const firstRoll = state.rollsUsed === 0;

  if (level === 'easy') {
    const choose = rng() < 0.34 ? pick(fallback, rng) : bestNow;
    const hold = firstRoll ? NONE_HELD.slice() : largestGroupMask(state.dice);
    const shouldRoll = state.rollsLeft > 0 && (firstRoll || state.rollsUsed < 2) && state.dice.some((die) => die !== 0 || firstRoll);
    const reason = reasonFor(choose.category, choose.points, state);
    return {
      category: choose.index,
      hold,
      shouldRoll,
      expected: choose.points,
      immediate: choose.points,
      reason,
    };
  }

  if (level === 'companion') {
    const choose = companionCandidate(state, rng);
    const funNow = ['fiveKind', 'largeStraight', 'fullHouse', 'smallStraight'].includes(choose.category) && choose.points > 0;
    const shouldRoll = state.rollsLeft > 0 && !funNow && (firstRoll || state.rollsUsed < 2);
    return {
      category: choose.index,
      hold: firstRoll ? NONE_HELD.slice() : companionKeep(state.dice),
      shouldRoll,
      expected: choose.points,
      immediate: choose.points,
      reason: funNow ? 'fun' : reasonFor(choose.category, choose.points, state),
    };
  }

  const exact = level === 'hard';
  const evaluated = evaluate(state, exact);
  const target = bestCandidate(evaluated, rng);
  const now = bestCandidate(
    evaluated.map((candidate) => ({
      ...candidate,
      weighted: candidate.points + bonusWeight(state, candidate.category, candidate.points),
      expected: candidate.points,
      hold: ALL_HELD.slice(),
    })),
    rng,
  );

  if (firstRoll) {
    return {
      category: target.index,
      hold: NONE_HELD.slice(),
      shouldRoll: true,
      expected: target.expected,
      immediate: target.points,
      reason: reasonFor(target.category, target.expected, state),
    };
  }

  const improve = target.weighted > now.weighted + 0.3 && anyUnheld(target.hold);
  if (state.rollsLeft > 0 && improve) {
    return {
      category: target.index,
      hold: target.hold,
      shouldRoll: true,
      expected: target.expected,
      immediate: target.points,
      reason: reasonFor(target.category, target.expected, state),
    };
  }

  return {
    category: now.index,
    hold: ALL_HELD.slice(),
    shouldRoll: false,
    expected: now.points,
    immediate: now.points,
    reason: reasonFor(now.category, now.points, state),
  };
}

export function chooseCategory(state: GameState, level: AiLevel, rng: Rng): number {
  return planTurn(state, level, rng).category;
}

export function chooseHolds(state: GameState, level: AiLevel, rng: Rng): boolean[] {
  return planTurn(state, level, rng).hold;
}

/** A deterministic, strong hint for the human player. */
export function advise(state: GameState): AiPlan {
  return planTurn(state, 'hard', () => 0.5);
}

/** Exported for tests: the keep mask the heuristic uses for one category. */
export function heuristicKeep(dice: readonly number[], category: Category): boolean[] {
  return keepFor(dice, category);
}

/** Exported for tests: exact expected score after one reroll for a keep mask. */
export function expectedForKeep(
  dice: readonly number[],
  keep: readonly boolean[],
  category: Category,
): number {
  return expectedAfterKeep(dice, keep, category);
}

/** Exported for tests: exact best keep mask for one category. */
export function exactKeepFor(dice: readonly number[], category: Category): { hold: boolean[]; ev: number } {
  return exactKeep(dice, category);
}

