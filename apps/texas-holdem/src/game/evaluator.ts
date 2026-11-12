/**
 * Five-, six- and seven-card poker hand evaluation.
 *
 * The evaluator is pure and allocation-light on the hot path. `score5` returns a
 * single comparable integer: category × 15^5 plus five base-15 tiebreak digits.
 * Royal flush is a straight flush with an ace-high straight; it is named
 * separately but compares as the top straight flush.
 */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandCategory =
  | 'high-card'
  | 'one-pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const BASE = 15;
const POW4 = BASE ** 4;
const POW3 = BASE ** 3;
const POW2 = BASE ** 2;

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

/** Score a five-card hand. Export used by the exhaustive rank test. */
export function score5(cards: Card[]): number {
  const counts = new Int8Array(15);
  let flush = true;
  const firstSuit = cards[0]?.suit;
  for (const card of cards) {
    counts[RANK_VALUE[card.rank]] += 1;
    if (card.suit !== firstSuit) flush = false;
  }

  let quad = 0;
  let trip = 0;
  let pairHigh = 0;
  let pairLow = 0;
  let pairCount = 0;
  const singles: number[] = [];
  for (let value = 14; value >= 2; value -= 1) {
    const count = counts[value];
    if (count === 4) quad = value;
    else if (count === 3) {
      if (!trip) trip = value;
      else if (!pairHigh) {
        pairHigh = value;
        pairCount += 1;
      }
    } else if (count === 2) {
      if (!pairHigh) pairHigh = value;
      else if (!pairLow) pairLow = value;
      pairCount += 1;
    } else if (count === 1) singles.push(value);
  }

  // Straight detection, including the wheel A-2-3-4-5.
  let straightHigh = 0;
  if (singles.length === 5) {
    if (singles[0] - singles[4] === 4) straightHigh = singles[0];
    else if (
      singles[0] === 14 &&
      singles[1] === 5 &&
      singles[2] === 4 &&
      singles[3] === 3 &&
      singles[4] === 2
    ) {
      straightHigh = 5;
    }
  }

  if (flush && straightHigh) {
    return encode(8, straightHigh, 0, 0, 0, 0);
  }
  if (quad) {
    return encode(7, quad, singles[0] ?? 0, 0, 0, 0);
  }
  if (trip && pairHigh) {
    return encode(6, trip, pairHigh, 0, 0, 0);
  }
  if (flush) {
    return encode(5, singles[0], singles[1], singles[2], singles[3], singles[4]);
  }
  if (straightHigh) {
    return encode(4, straightHigh, 0, 0, 0, 0);
  }
  if (trip) {
    return encode(3, trip, singles[0] ?? 0, singles[1] ?? 0, 0, 0);
  }
  if (pairHigh && pairLow) {
    return encode(2, pairHigh, pairLow, singles[0] ?? 0, 0, 0);
  }
  // Two pair can also be three pairs in a seven-card hand; score5 only sees
  // five cards, where pairCount is exactly 2 for two pair.
  if (pairHigh) {
    return encode(1, pairHigh, singles[0] ?? 0, singles[1] ?? 0, singles[2] ?? 0, 0);
  }
  return encode(0, singles[0] ?? 0, singles[1] ?? 0, singles[2] ?? 0, singles[3] ?? 0, singles[4] ?? 0);
}

function encode(
  category: number,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number {
  return (
    category * BASE ** 5 +
    a * POW4 +
    b * POW3 +
    c * POW2 +
    d * BASE +
    e
  );
}

export function decodeScore(score: number): { category: number; tiebreak: number[] } {
  const category = Math.floor(score / BASE ** 5);
  let rest = score % BASE ** 5;
  const tiebreak: number[] = [];
  for (const divisor of [POW4, POW3, POW2, BASE, 1]) {
    tiebreak.push(Math.floor(rest / divisor));
    rest %= divisor;
  }
  return { category, tiebreak };
}

export function categoryName(score: number): HandCategory {
  const { category, tiebreak } = decodeScore(score);
  switch (category) {
    case 8:
      return tiebreak[0] === 14 ? 'royal-flush' : 'straight-flush';
    case 7:
      return 'four-of-a-kind';
    case 6:
      return 'full-house';
    case 5:
      return 'flush';
    case 4:
      return 'straight';
    case 3:
      return 'three-of-a-kind';
    case 2:
      return 'two-pair';
    case 1:
      return 'one-pair';
    default:
      return 'high-card';
  }
}

export interface EvaluatedHand {
  score: number;
  category: HandCategory;
  tiebreak: number[];
  cards: Card[];
}

function combinations<T>(items: T[], choose: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === choose) {
      result.push(current.slice());
      return;
    }
    const remaining = choose - current.length;
    for (let index = start; index <= items.length - remaining; index += 1) {
      current.push(items[index]);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

/** Score the best five-card hand from five, six or seven cards. */
export function scoreCards(cards: Card[]): number {
  if (cards.length === 5) return score5(cards);
  if (cards.length < 5) return -1;
  let best = -1;
  for (const five of combinations(cards, 5)) {
    const score = score5(five);
    if (score > best) best = score;
  }
  return best;
}

/** Convenience wrapper used by the UI and by showdown settlement. */
export function evaluate(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error('evaluate needs at least five cards');
  }
  let bestScore = -1;
  let bestCards: Card[] = [];
  for (const five of combinations(cards, 5)) {
    const score = score5(five);
    if (score > bestScore) {
      bestScore = score;
      bestCards = five;
    }
  }
  const { tiebreak } = decodeScore(bestScore);
  return {
    score: bestScore,
    category: categoryName(bestScore),
    tiebreak,
    cards: bestCards,
  };
}

export function compareScores(a: number, b: number): number {
  return a === b ? 0 : a > b ? 1 : -1;
}
