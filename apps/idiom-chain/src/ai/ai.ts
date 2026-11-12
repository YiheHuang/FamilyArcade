/**
 * Four deterministic AI opponents for Idiom Chain.
 *
 * Every level searches the bundled dictionary by the required first character
 * (or first syllable in homophone mode). Difficulty is expressed through the
 * value it places on idiom frequency, length, rarity points and the number of
 * continuations it leaves on the table. No level reads a clock or Math.random;
 * callers inject the RNG.
 */

import {
  chainCandidates,
  isRare,
  type Idiom,
} from '../game/dictionary';
import {
  chainableIdioms,
  lastEntry,
  usedTexts,
  type GameState,
} from '../game/idiom-chain';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

interface Option {
  idiom: Idiom;
  length: number;
  rare: boolean;
  points: number;
  nextCount: number;
  /** Best reply available to the next player after this idiom. */
  replyValue: number;
  jitter: number;
}

function clampRng(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function valueOf(idiom: Idiom, lengthWeight: number): number {
  return 1 + (isRare(idiom) ? 2 : 0) + idiom.frequency * 0.15 - lengthWeight * [...idiom.text].length;
}

function optionsFor(state: GameState): Option[] {
  const candidates = chainableIdioms(state);
  if (candidates.length === 0) return [];
  const previous = lastEntry(state);
  const used = usedTexts(state);
  return candidates.map((idiom) => {
    const trial = new Set(used);
    trial.add(idiom.text);
    const replies = chainCandidates(idiom, state.config.homophone, trial);
    let replyValue = 0;
    for (const reply of replies) {
      replyValue = Math.max(replyValue, valueOf(reply, 0.15));
    }
    return {
      idiom,
      length: [...idiom.text].length,
      rare: isRare(idiom),
      points: 1 + (isRare(idiom) ? 2 : 0),
      nextCount: replies.length,
      replyValue: previous ? replyValue : 0,
      jitter: 0,
    };
  });
}

function chooseBy(
  options: Option[],
  score: (option: Option) => number,
  rng: Rng,
): Option {
  let best = -Infinity;
  let picks: Option[] = [];
  for (const option of options) {
    const value = score(option);
    if (value > best + 1e-9) {
      best = value;
      picks = [option];
    } else if (Math.abs(value - best) <= 1e-9) {
      picks.push(option);
    }
  }
  const index = Math.floor(clampRng(rng) * picks.length);
  return picks[index] ?? options[0];
}

function random(options: Option[], rng: Rng): Option {
  return options[Math.floor(clampRng(rng) * options.length)] ?? options[0];
}

/**
 * Choose the AI's next idiom. Returns null when the chain has no continuation;
 * the caller then records a no-move strike.
 */
export function chooseIdiom(
  state: GameState,
  level: AiLevel,
  rng: Rng = () => 0.5,
): Idiom | null {
  if (state.status !== 'playing') return null;
  const options = optionsFor(state);
  if (options.length === 0) return null;

  const deadPenalty = (option: Option): number => (option.nextCount === 0 ? 80 : 0);

  if (level === 'companion') {
    // Gentle: common, short idioms with a comfortable number of replies.
    return chooseBy(
      options,
      (option) =>
        option.idiom.frequency * 3 +
        Math.min(option.nextCount, 8) * 0.35 -
        option.length * 0.5 -
        (option.rare ? 3 : 0) -
        deadPenalty(option) +
        clampRng(rng) * 1.2,
      rng,
    ).idiom;
  }

  if (level === 'easy') {
    // Easy: often reaches for a familiar first idea, sometimes plays at random.
    if (clampRng(rng) < 0.34) {
      const live = options.filter((option) => option.nextCount > 0);
      return random(live.length ? live : options, rng).idiom;
    }
    return chooseBy(
      options,
      (option) =>
        option.idiom.frequency * 2.2 +
        Math.min(option.nextCount, 10) * 0.12 -
        option.length * 0.25 -
        deadPenalty(option) +
        clampRng(rng) * 3.4,
      rng,
    ).idiom;
  }

  if (level === 'normal') {
    // Normal: balances points, familiar language and keeping the chain open.
    return chooseBy(
      options,
      (option) =>
        option.points * 1.8 +
        option.idiom.frequency * 0.7 +
        Math.min(option.nextCount, 12) * 0.4 -
        option.length * 0.12 -
        deadPenalty(option) +
        clampRng(rng) * 0.9,
      rng,
    ).idiom;
  }

  // Hard: takes high-value rare idioms, but refuses to leave an easy reply
  // worth more than its own play. A small two-ply estimate is enough for a
  // family table and keeps every decision explainable.
  return chooseBy(
    options,
    (option) =>
      option.points * 4.2 +
      Math.min(option.nextCount, 14) * 0.55 -
      option.replyValue * 1.35 -
      option.length * 0.05 -
      deadPenalty(option) +
      clampRng(rng) * 0.35,
    rng,
  ).idiom;
}

/** True when the active seat has at least one legal dictionary continuation. */
export function hasMove(state: GameState): boolean {
  return chainableIdioms(state).length > 0;
}
