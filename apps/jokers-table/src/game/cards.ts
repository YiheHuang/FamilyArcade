/** Playing cards, deterministic shuffles and poker-hand detection. */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type EnhancementId = 'gilt' | 'cinder' | 'prism' | 'bramble' | 'tally' | 'keystone';

export type HandType =
  | 'high'
  | 'pair'
  | 'twoPair'
  | 'three'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'four'
  | 'straightFlush'
  | 'royalFlush';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  enhance?: EnhancementId;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };

export const HAND_BASE: Record<HandType, { chips: number; mult: number }> = {
  high: { chips: 5, mult: 1 },
  pair: { chips: 10, mult: 2 },
  twoPair: { chips: 20, mult: 2 },
  three: { chips: 30, mult: 3 },
  straight: { chips: 30, mult: 4 },
  flush: { chips: 35, mult: 4 },
  fullHouse: { chips: 40, mult: 4 },
  four: { chips: 60, mult: 7 },
  straightFlush: { chips: 100, mult: 8 },
  royalFlush: { chips: 150, mult: 9 },
};

export function rankChip(rank: Rank): number {
  const value = RANK_VALUE[rank];
  if (value === 14) return 11;
  return value >= 11 ? 10 : value;
}

export function isFace(rank: Rank): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

export function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}${suit}`, rank, suit });
    }
  }
  return cards;
}

export function sortCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const suit = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (suit !== 0) return suit;
    return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
  });
}

/** FNV-1a for readable text seeds; integer seeds pass through unchanged. */
export function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.floor(Math.abs(input)) >>> 0;
  const text = String(input);
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function deriveSeed(seed: number, ...parts: number[]): number {
  let state = seed >>> 0;
  for (const part of parts) {
    state = (state ^ (part >>> 0)) >>> 0;
    state = Math.imul(state, 2654435761) >>> 0;
    state = (state ^ (state >>> 13)) >>> 0;
  }
  return state >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const pick = Math.max(0, Math.min(index, raw));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

export function shuffledWithSeed<T>(items: readonly T[], seed: number): T[] {
  return shuffle(items, mulberry32(seed));
}

export interface HandEval {
  type: HandType;
  baseChips: number;
  baseMult: number;
  counts: Record<string, number>;
  rankCounts: number[];
  pairCount: number;
  hasPair: boolean;
  hasStraight: boolean;
  hasFlush: boolean;
  twoPairOrBetter: boolean;
  distinctRanks: number;
  straightHigh: number | null;
  suitCounts: Record<Suit, number>;
}

function countRanks(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

/**
 * Prism cards are wild for suit purposes. If every non-prism card shares one
 * suit (or all five are prisms), the play is a flush.
 */
export function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const suits = new Set(cards.filter((card) => card.enhance !== 'prism').map((card) => card.suit));
  return suits.size <= 1;
}

export function straightHighValue(cards: Card[]): number | null {
  if (cards.length !== 5) return null;
  const values = Array.from(new Set(cards.map((card) => RANK_VALUE[card.rank]))).sort(
    (a, b) => a - b,
  );
  if (values.length !== 5) return null;
  const wheel = values.join(',') === '2,3,4,5,14';
  if (wheel) return 5;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) return null;
  }
  return values[4];
}

export function evaluateHand(cards: Card[]): HandEval {
  const n = cards.length;
  const counts = countRanks(cards);
  const rankCounts = Array.from(counts.values()).sort((a, b) => b - a);
  const pairCount = rankCounts.filter((value) => value >= 2).length;
  const hasThree = rankCounts[0] >= 3;
  const hasFour = rankCounts[0] >= 4;
  const straightHigh = straightHighValue(cards);
  const flush = isFlush(cards);
  const hasStraight = straightHigh !== null;

  let type: HandType = 'high';
  if (hasFour) {
    type = 'four';
  } else if (n === 5 && hasThree && pairCount >= 2) {
    type = 'fullHouse';
  } else if (hasThree) {
    type = 'three';
  } else if (pairCount >= 2) {
    type = 'twoPair';
  } else if (pairCount === 1) {
    type = 'pair';
  }

  if (n === 5 && flush && hasStraight) {
    type = straightHigh === 14 ? 'royalFlush' : 'straightFlush';
  } else if (n === 5 && flush) {
    type = 'flush';
  } else if (n === 5 && hasStraight) {
    type = 'straight';
  }

  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const card of cards) suitCounts[card.suit] += 1;
  const twoPairOrBetter = type !== 'high' && type !== 'pair';

  return {
    type,
    baseChips: HAND_BASE[type].chips,
    baseMult: HAND_BASE[type].mult,
    counts: Object.fromEntries(Array.from(counts.entries()).map(([rank, value]) => [rank, value])),
    rankCounts,
    pairCount,
    hasPair: pairCount >= 1,
    hasStraight,
    hasFlush: flush,
    twoPairOrBetter,
    distinctRanks: counts.size,
    straightHigh,
    suitCounts,
  };
}
