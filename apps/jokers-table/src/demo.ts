import { autoPlayBlind } from './ai/ai';
import { mulberry32 } from './game/cards';
import { compareBlind } from './game/competition';
import { createBlindPlan, type DeckId } from './game/content';
import { createRun, enterShop, type RunState } from './game/run';
import type { SeatState } from './session';

function seeded(seed: number): () => number {
  return mulberry32(seed);
}

/** A valid shop state built by playing a real first blind with the Hard AI. */
export function demoShopRun(): RunState {
  const seed = 20261112;
  const run = createRun({ seed, deckId: 'ivory' });
  const played = autoPlayBlind(run, 'hard', seeded(seed + 5));
  const shop = enterShop(played);
  if (!shop.ok) return played;
  return { ...shop.state, money: Math.max(shop.state.money, 14) };
}

export interface DemoCompare {
  seats: SeatState[];
  active: number;
  compare: ReturnType<typeof compareBlind>;
  blindIndex: number;
}

/** Three real AI runs from the same seed, compared on the first blind. */
export function demoCompare(): DemoCompare {
  const seed = 20261112;
  const deckId: DeckId = 'ivory';
  const plan = createBlindPlan(seed, deckId, true);
  const levels = ['hard', 'normal', 'easy'] as const;
  const keys = ['you', 'rivalMara', 'rivalIvo'] as const;
  const seats: SeatState[] = levels.map((level, index) => {
    const run = createRun({ seed, deckId, plan });
    const played = autoPlayBlind(run, level, seeded(seed + index * 97));
    return {
      name: '',
      nameKey: keys[index],
      ai: index > 0,
      level: index > 0 ? level : null,
      run: played,
      hearts: index === 2 ? 1 : 2,
      eliminated: false,
      blindScores: [played.blindScore],
      totalScore: played.totalScore,
    };
  });
  const scores = seats.map((seat) => seat.run.blindScore);
  const hearts = seats.map((seat) => seat.hearts);
  const compare = compareBlind([0, 1, 2], scores, hearts);
  seats.forEach((seat, index) => {
    seat.hearts = compare.hearts[index];
    seat.eliminated = compare.hearts[index] <= 0;
  });
  return { seats, active: 0, compare, blindIndex: 0 };
}

/** A complete-run fixture for the end screen. */
export function demoEndRun(): RunState {
  const run = createRun({ seed: 20261112, deckId: 'ivory' });
  return {
    ...run,
    phase: 'complete',
    blindIndex: run.plan.length - 1,
    totalScore: 18420,
    bestHandScore: 3240,
    bestHandType: 'fullHouse',
  };
}
