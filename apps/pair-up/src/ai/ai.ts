import { legalFlips, type GameState } from '../game/pair-up';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

function clamp(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(clamp(rng) * items.length)] as T;
}

/**
 * What this AI can still recall. `hard` has seen every public reveal, `normal`
 * only remembers the cards it turned itself, `easy` has a short, unreliable
 * memory, and `companion` remembers everything but sometimes chooses to forget.
 */
function memoryOf(
  state: GameState,
  level: AiLevel,
  seat: number,
  rng: Rng,
): Map<number, number> {
  const memory = new Map<number, number>();
  if (state.status !== 'playing') return memory;

  if (level === 'easy') {
    if (clamp(rng) >= 0.3) return memory;
    for (const reveal of state.reveals.slice(-6)) {
      if (state.matchedBy[reveal.index] === null) memory.set(reveal.index, reveal.value);
    }
    return memory;
  }

  if (level === 'companion') {
    const others = state.scores.filter((_, index) => index !== seat);
    const lead = state.scores[seat] - Math.max(...others);
    const forgetChance = lead >= 2 ? 0.42 : 0.14;
    if (clamp(rng) < forgetChance) return memory;
  }

  for (const reveal of state.reveals) {
    if (level === 'normal' && reveal.seat !== seat) continue;
    if (state.matchedBy[reveal.index] !== null) continue;
    memory.set(reveal.index, reveal.value);
  }
  return memory;
}

function groupsByValue(
  memory: Map<number, number>,
  candidates: readonly number[],
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  const allowed = new Set(candidates);
  for (const [index, value] of memory) {
    if (!allowed.has(index)) continue;
    const group = groups.get(value) ?? [];
    group.push(index);
    groups.set(value, group);
  }
  for (const [value, group] of groups) {
    if (group.length < 2) groups.delete(value);
  }
  return groups;
}

function knownPairTiles(
  memory: Map<number, number>,
  candidates: readonly number[],
): number[][] {
  const groups = groupsByValue(memory, candidates);
  const pairs: number[][] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) pairs.push([group[i], group[j]]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return pairs;
}

/** Choose the next single flip. Deterministic for a given state + RNG. */
export function chooseFlip(
  state: GameState,
  level: AiLevel,
  rng: Rng,
): number {
  if (state.status !== 'playing' || state.phase !== 'choose') return -1;
  const candidates = legalFlips(state);
  if (candidates.length === 0) return -1;

  const seat = state.turn;
  const memory = memoryOf(state, level, seat, rng);

  if (state.flipped.length === 1) {
    const first = state.flipped[0];
    const wanted = state.deck[first];
    const match = candidates.find((index) => memory.get(index) === wanted);
    if (match !== undefined) return match;
    const unknown = candidates.filter((index) => !memory.has(index));
    return pick(unknown.length > 0 ? unknown : candidates, rng);
  }

  const pairs = knownPairTiles(memory, candidates);
  if (pairs.length > 0) {
    const pair = pick(pairs, rng);
    return pick(pair, rng);
  }

  // Prefer cards it has never seen; never waste a turn on a known singleton
  // while an unknown card is still available.
  const unknown = candidates.filter((index) => !memory.has(index));
  return pick(unknown.length > 0 ? unknown : candidates, rng);
}

export interface Hint {
  tiles: number[];
  reason: 'pair' | 'explore';
}

/**
 * A hint uses the table's public memory: every card anyone has turned over.
 * That is information the family has already seen, just not perfectly recalled.
 */
export function suggest(
  state: GameState,
  rng: Rng,
): Hint | null {
  if (state.status !== 'playing' || state.phase !== 'choose') return null;
  const candidates = legalFlips(state);
  if (candidates.length === 0) return null;

  const memory = new Map<number, number>();
  for (const reveal of state.reveals) {
    if (state.matchedBy[reveal.index] === null) memory.set(reveal.index, reveal.value);
  }

  if (state.flipped.length === 1) {
    const first = state.flipped[0];
    const wanted = state.deck[first];
    const match = candidates.find((index) => memory.get(index) === wanted);
    if (match !== undefined) return { tiles: [first, match], reason: 'pair' };
    return { tiles: [pick(candidates, rng)], reason: 'explore' };
  }

  const pairs = knownPairTiles(memory, candidates);
  if (pairs.length > 0) {
    const pair = pick(pairs, rng);
    return { tiles: pair, reason: 'pair' };
  }

  return { tiles: [pick(candidates, rng)], reason: 'explore' };
}

