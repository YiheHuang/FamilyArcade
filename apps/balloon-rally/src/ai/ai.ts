import { BALLOON_COUNT, ROUNDS, TRACK_LENGTH, WIND_CARDS } from '../game/data';
import type { AiExplanation, AiLevel, GameView, Move } from '../game/types';
import type { Rng } from '../game/rng';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const EXPECTED_WIND = WIND_CARDS.reduce((a, b) => a + b, 0) / WIND_CARDS.length;

function permutations(values: readonly number[]): number[][] {
  if (values.length <= 1) return [[...values]];
  const out: number[][] = [];
  const used = new Array(values.length).fill(false);
  const current: number[] = [];
  const walk = (): void => {
    if (current.length === values.length) {
      out.push([...current]);
      return;
    }
    for (let i = 0; i < values.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      current.push(values[i]);
      walk();
      current.pop();
      used[i] = false;
    }
  };
  walk();
  return out;
}

const WIND_PERMUTATIONS = permutations(WIND_CARDS);

function maxAndSecond(positions: readonly number[]): { leaders: number[]; seconds: number[] } {
  const max = Math.max(...positions);
  let second = -1;
  for (const p of positions) if (p < max && p > second) second = p;
  const leaders: number[] = [];
  const seconds: number[] = [];
  positions.forEach((p, i) => {
    if (p === max) leaders.push(i);
    else if (p === second) seconds.push(i);
  });
  return { leaders, seconds };
}

interface RoundOdds {
  first: number;
  second: number;
}

/** Exact odds for this round, given the visible board and the 5-card deck. */
function roundOdds(view: GameView, balloon: number, tailwind: boolean): RoundOdds {
  let first = 0;
  let second = 0;
  for (const perm of WIND_PERMUTATIONS) {
    const positions = view.positions.map((p, b) =>
      Math.min(TRACK_LENGTH, p + perm[b] + (b === balloon && tailwind ? 1 : 0)),
    );
    const { leaders, seconds } = maxAndSecond(positions);
    if (leaders.includes(balloon)) first += 1;
    else if (seconds.includes(balloon)) second += 1;
  }
  const total = WIND_PERMUTATIONS.length;
  return { first: first / total, second: second / total };
}

function shuffleDeck(rng: Rng): number[] {
  const deck = [...WIND_CARDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/** Monte Carlo of the remaining rally; supports do not move balloons, tailwind does. */
function overallOdds(view: GameView, balloon: number, tailwind: boolean, rng: Rng, samples: number): number {
  if (samples <= 0) {
    const projected = view.positions.map((p, b) =>
      p + (tailwind && b === balloon ? 1 : 0) + EXPECTED_WIND * (ROUNDS - view.round + 1),
    );
    const max = Math.max(...projected);
    if (projected[balloon] < max) return 0;
    return 1 / projected.filter((p) => p === max).length;
  }
  let hits = 0;
  for (let sample = 0; sample < samples; sample++) {
    const positions = [...view.positions];
    for (let round = view.round; round <= ROUNDS; round++) {
      const deck = shuffleDeck(rng);
      for (let b = 0; b < BALLOON_COUNT; b++) {
        positions[b] = Math.min(
          TRACK_LENGTH,
          positions[b] + deck[b] + (round === view.round && b === balloon && tailwind ? 1 : 0),
        );
      }
    }
    const max = Math.max(...positions);
    if (positions[balloon] === max) hits += 1;
  }
  return hits / samples;
}

/** Public support history: used for Companion gentleness and Hard's style tie-break. */
function publicSupportCount(view: GameView, balloon: number, humanOnly: boolean): number {
  let count = 0;
  for (const record of view.history) {
    record.supports.forEach((supported, seat) => {
      if (supported !== balloon) return;
      if (humanOnly && view.seats[seat]?.kind !== 'human') return;
      count += 1;
    });
  }
  return count;
}

function favouriteBalloons(view: GameView): Set<number> {
  const favourites = new Set<number>();
  for (const seat of view.seats) {
    if (seat.kind !== 'human') continue;
    const counts = new Map<number, number>();
    for (const record of view.history) {
      const supported = record.supports[seat.seat];
      counts.set(supported, (counts.get(supported) ?? 0) + 1);
    }
    let best = 0;
    for (const count of counts.values()) best = Math.max(best, count);
    if (best >= 2) {
      for (const [balloon, count] of counts) if (count === best) favourites.add(balloon);
    }
  }
  return favourites;
}

interface Candidate {
  balloon: number;
  tailwind: boolean;
  value: number;
}

function levelConfig(level: AiLevel): {
  samples: number;
  noise: number;
  useExact: boolean;
  tailwindChance: number;
  tailwindCost: number;
  styleBonus: boolean;
} {
  switch (level) {
    case 'companion':
      return { samples: 60, noise: 0.55, useExact: true, tailwindChance: 0.65, tailwindCost: 1.3, styleBonus: false };
    case 'easy':
      return { samples: 0, noise: 2.2, useExact: false, tailwindChance: 0.3, tailwindCost: 1.2, styleBonus: false };
    case 'normal':
      return { samples: 180, noise: 0.05, useExact: true, tailwindChance: 1, tailwindCost: 1.8, styleBonus: false };
    case 'hard':
      return { samples: 360, noise: 0, useExact: true, tailwindChance: 1, tailwindCost: 2.4, styleBonus: false };
  }
}

export interface ChooseOptions {
  level: AiLevel;
  budgetMs: number;
  rng: Rng;
}

export function chooseMove(view: GameView, level: AiLevel, budgetMs: number, rng: Rng): Move | null {
  if (view.phase !== 'support' || view.mySeat === null || view.current !== view.mySeat) return null;
  const config = levelConfig(level);
  const deadline = now() + Math.max(5, budgetMs);
  const candidates: Candidate[] = [];
  const companionsAvoid = level === 'companion' ? favouriteBalloons(view) : new Set<number>();

  for (let balloon = 0; balloon < BALLOON_COUNT; balloon++) {
    if (companionsAvoid.has(balloon) && companionsAvoid.size < BALLOON_COUNT) continue;
    for (const tailwind of [false, true]) {
      if (tailwind && !view.canTailwind) continue;
      if (tailwind && rng() > config.tailwindChance) continue;
      const odds = config.useExact
        ? roundOdds(view, balloon, tailwind)
        : approximateRoundOdds(view, balloon, tailwind, rng);
      const future = overallOdds(
        view,
        balloon,
        tailwind,
        rng,
        now() > deadline ? 0 : config.samples,
      );
      let value = odds.first * 3 + odds.second * 1 + future * 5 - (tailwind ? config.tailwindCost : 0);
      if (config.styleBonus) {
        // Near-ties go to a balloon the family has not crowded; this is style, not hidden info.
        value -= publicSupportCount(view, balloon, true) * 0.015;
      }
      value += (rng() * 2 - 1) * config.noise;
      candidates.push({ balloon, tailwind, value });
    }
  }

  if (!candidates.length) {
    return { kind: 'support', seat: view.mySeat, balloon: 0, tailwind: false };
  }
  candidates.sort((a, b) => b.value - a.value || a.balloon - b.balloon || Number(a.tailwind) - Number(b.tailwind));
  const best = candidates[0];
  return { kind: 'support', seat: view.mySeat, balloon: best.balloon, tailwind: best.tailwind };
}

function approximateRoundOdds(view: GameView, balloon: number, tailwind: boolean, rng: Rng): RoundOdds {
  const positions = view.positions.map((p, b) =>
    p + EXPECTED_WIND + (b === balloon && tailwind ? 1 : 0) + (rng() * 2 - 1) * 0.8,
  );
  const { leaders, seconds } = maxAndSecond(positions);
  return { first: leaders.includes(balloon) ? 1 : 0, second: seconds.includes(balloon) ? 1 : 0 };
}

export function explain(view: GameView, move: Move): AiExplanation {
  if (move.kind !== 'support') {
    return { key: 'ai.reasonNext', params: {} };
  }
  const max = Math.max(...view.positions);
  const position = view.positions[move.balloon] ?? 0;
  const gap = max - position;
  if (move.tailwind) {
    return { key: 'ai.reasonTailwind', params: { balloonId: view.balloons[move.balloon].id, gap } };
  }
  if (gap <= 0) {
    return { key: 'ai.reasonAhead', params: { balloonId: view.balloons[move.balloon].id, position } };
  }
  return { key: 'ai.reasonCatch', params: { balloonId: view.balloons[move.balloon].id, gap } };
}

export function hintMove(view: GameView): Move | null {
  return chooseMove(view, 'hard', 80, () => 0.5);
}
