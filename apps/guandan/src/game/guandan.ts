/**
 * Guandan · 掼蛋 — a pure, deterministic engine for four-player partnership
 * climbing with two decks (108 cards, 27 each).
 *
 * Seats 0 and 2 are partners (South–North); seats 1 and 3 are partners
 * (East–West). Play proceeds 0 → 1 → 2 → 3. The current level card ranks just
 * below the jokers. The heart level card is the wildcard and may stand in for
 * any non-joker card.
 *
 * No DOM, network, clock or `Math.random` dependency. Dealing uses the injected
 * RNG. `view()` exposes only one seat's hand, which is what LAN sends to each
 * guest.
 */

export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';
export type Team = 0 | 1;
export type Phase = 'playing' | 'tribute' | 'round-over' | 'match-over';
export type Rng = () => number;

export interface Card {
  id: string;
  /** 2–14 for normal cards, 15 small joker, 16 big joker. */
  rank: number;
  suit: Suit;
  deck: number;
}

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'full-house'
  | 'straight'
  | 'pair-chain'
  | 'triple-chain'
  | 'bomb'
  | 'straight-flush'
  | 'joker-bomb';

export interface Combo {
  type: ComboType;
  cards: Card[];
  size: number;
  /** Comparison rank. Sets use power rank; sequences use the low window rank. */
  rank: number;
  /** Bomb tier: 4..10, 5.5 for a straight flush, 100 for a joker bomb, 0 otherwise. */
  tier: number;
  bomb: boolean;
  /** Low natural window rank for sequences (1 = ace low). */
  low?: number;
  /** High natural window rank for sequences. */
  high?: number;
  /** Pair rank for a full house. */
  pairRank?: number;
  /** Suit for a straight flush. */
  suit?: Suit;
}

export interface Trick {
  seat: number;
  combo: Combo;
  cards: Card[];
}

export interface LastAction {
  seat: number;
  kind: 'play' | 'pass';
  combo?: Combo;
}

export interface TributeMove {
  from: number;
  to: number;
  card: Card;
  back: Card | null;
}

export interface TributeSummary {
  kind: 'double' | 'single' | 'anti' | 'none';
  moves: TributeMove[];
  antiSeats: number[];
  leader: number;
  level: number;
  gain: number;
}

export interface RoundResult {
  order: number[];
  winnerTeam: Team;
  gain: number;
  levelsBefore: [number, number];
  levelsAfter: [number, number];
  matchWinner: Team | null;
  nextLevel: number;
}

export interface GameState {
  hands: Card[][];
  levels: [number, number];
  /** The level being played this round (the previous winner's level). */
  levelRank: number;
  round: number;
  turn: number;
  trick: Trick | null;
  passed: boolean[];
  finish: number[];
  order: number[] | null;
  phase: Phase;
  starter: number;
  result: RoundResult | null;
  tribute: TributeSummary | null;
  matchWinner: Team | null;
  actions: number;
  last: LastAction | null;
  discard: Card[];
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export type MoveError =
  | 'phase'
  | 'wrong-turn'
  | 'finished'
  | 'already-passed'
  | 'not-your-card'
  | 'empty'
  | 'duplicate-card'
  | 'invalid-combo'
  | 'does-not-beat'
  | 'cannot-pass'
  | 'no-trick'
  | 'not-ready';

export type PlayerAction =
  | { type: 'play'; cards: string[] }
  | { type: 'pass' };

export interface SeatView {
  seat: number;
  team: Team;
  partner: number;
  hand: Card[];
  handCounts: number[];
  names: string[];
  levels: [number, number];
  levelRank: number;
  round: number;
  turn: number;
  phase: Phase;
  trick: Trick | null;
  passed: boolean[];
  finish: number[];
  order: number[] | null;
  starter: number;
  result: RoundResult | null;
  tribute: TributeSummary | null;
  matchWinner: Team | null;
  actions: number;
  last: LastAction | null;
  discard: Card[];
  canPlay: boolean;
  canPass: boolean;
  isTurn: boolean;
  finished: boolean;
  awaitingTribute: boolean;
}

export const PLAYER_COUNT = 4;
export const RANKS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const SMALL_JOKER = 15;
export const BIG_JOKER = 16;
export const ACE = 14;
export const LEVEL_LOW = 2;
export const LEVEL_HIGH = 14;

const RANK_LABEL: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: 'SJ',
  16: 'BJ',
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function levelLabel(level: number): string {
  return rankLabel(level);
}

export function suitSymbol(suit: Suit): string {
  return suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : suit === 'C' ? '♣' : '★';
}

export function teamOf(seat: number): Team {
  return seat % 2 === 0 ? 0 : 1;
}

export function partnerOf(seat: number): number {
  return (seat + 2) % PLAYER_COUNT;
}

export function leftOf(seat: number): number {
  return (seat + 1) % PLAYER_COUNT;
}

/** Power rank: the level card is 15, just below the small (16) and big (17) jokers. */
export function powerRank(rank: number, level: number): number {
  if (rank >= SMALL_JOKER) return rank + 1;
  if (rank === level) return 15;
  return rank;
}

export function cardPower(card: Card, level: number): number {
  return powerRank(card.rank, level);
}

export function isWild(card: Card, level: number): boolean {
  return card.suit === 'H' && card.rank === level;
}

export function isJoker(card: Card): boolean {
  return card.rank >= SMALL_JOKER;
}

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${suit}${rank}-${copy}`, rank, suit, deck: copy });
      }
    }
    deck.push({ id: `J${SMALL_JOKER}-${copy}`, rank: SMALL_JOKER, suit: 'J', deck: copy });
    deck.push({ id: `J${BIG_JOKER}-${copy}`, rank: BIG_JOKER, suit: 'J', deck: copy });
  }
  return deck;
}

export const DECK: readonly Card[] = makeDeck();

function shuffle(cards: Card[], rng: Rng): Card[] {
  const deck = cards.slice();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const pick = Math.floor(value * (index + 1));
    const swap = deck[index];
    deck[index] = deck[pick];
    deck[pick] = swap;
  }
  return deck;
}

export function sortHand(cards: readonly Card[], level = LEVEL_LOW): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3, J: 4 };
  return cards.slice().sort((a, b) => {
    const power = cardPower(a, level) - cardPower(b, level);
    if (power !== 0) return power;
    const suit = suitOrder[a.suit] - suitOrder[b.suit];
    if (suit !== 0) return suit;
    return a.deck - b.deck;
  });
}

function deal(rng: Rng, level = LEVEL_LOW): Card[][] {
  const deck = shuffle([...DECK], rng);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, index) => {
    hands[index % PLAYER_COUNT].push(card);
  });
  return hands.map((hand) => sortHand(hand, level));
}

function emptyPassed(): boolean[] {
  return [false, false, false, false];
}

export interface SetupOptions {
  rng: Rng;
  level?: number;
  levels?: [number, number];
  starter?: number;
  hands?: Card[][];
}

export function setup(options: SetupOptions | Rng): GameState {
  const opts: SetupOptions =
    typeof options === 'function' ? { rng: options } : options;
  const level = normaliseLevel(opts.level ?? opts.levels?.[0] ?? LEVEL_LOW);
  const levels: [number, number] = opts.levels
    ? [normaliseLevel(opts.levels[0]), normaliseLevel(opts.levels[1])]
    : [level, level];
  const hands = opts.hands
    ? opts.hands.slice(0, PLAYER_COUNT).map((hand) => sortHand(hand, level))
    : deal(opts.rng, level);
  while (hands.length < PLAYER_COUNT) hands.push([]);
  const starter = Number.isInteger(opts.starter) && opts.starter! >= 0 && opts.starter! < 4
    ? opts.starter!
    : 0;
  return {
    hands,
    levels,
    levelRank: level,
    round: 1,
    turn: starter,
    trick: null,
    passed: emptyPassed(),
    finish: [],
    order: null,
    phase: 'playing',
    starter,
    result: null,
    tribute: null,
    matchWinner: null,
    actions: 0,
    last: null,
    discard: [],
  };
}

function normaliseLevel(value: number): number {
  if (!Number.isFinite(value)) return LEVEL_LOW;
  return Math.max(LEVEL_LOW, Math.min(LEVEL_HIGH, Math.floor(value)));
}

/* ------------------------------------------------------------------------- */
/* Combination detection                                                     */
/* ------------------------------------------------------------------------- */

function comboKey(combo: Combo): string {
  return [
    combo.type,
    combo.size,
    combo.rank,
    combo.tier,
    combo.low ?? '',
    combo.pairRank ?? '',
    combo.suit ?? '',
  ].join(':');
}

function addCombo(list: Combo[], combo: Combo): void {
  const key = comboKey(combo);
  if (!list.some((item) => comboKey(item) === key)) list.push(combo);
}

function sequenceRanks(start: number, length: number): number[] | null {
  if (!Number.isInteger(start) || start < 1 || start > ACE) return null;
  const ranks: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const value = start + index;
    if (value > ACE) return null;
    ranks.push(value === 1 ? ACE : value);
  }
  if (new Set(ranks).size !== ranks.length) return null;
  return ranks;
}

/** Every sequence window, A low through A high. */
export function sequenceWindows(length: number): { start: number; ranks: number[] }[] {
  const windows: { start: number; ranks: number[] }[] = [];
  const last = ACE - length + 1;
  for (let start = 1; start <= last; start += 1) {
    const ranks = sequenceRanks(start, length);
    if (ranks) windows.push({ start, ranks });
  }
  return windows;
}

function canRepresent(card: Card, rank: number, level: number): boolean {
  if (isJoker(card)) return card.rank === rank;
  if (card.rank === rank) return true;
  return isWild(card, level);
}

function wildCount(cards: readonly Card[], level: number): number {
  return cards.filter((card) => isWild(card, level)).length;
}

function noJokers(cards: readonly Card[]): boolean {
  return cards.every((card) => !isJoker(card));
}

function countRank(cards: readonly Card[], rank: number): number {
  return cards.filter((card) => card.rank === rank).length;
}

function detectSets(cards: readonly Card[], level: number, out: Combo[]): void {
  const size = cards.length;
  if (size === 0) return;

  if (size === 1) {
    const card = cards[0];
    addCombo(out, {
      type: 'single',
      cards: cards.slice(),
      size: 1,
      rank: cardPower(card, level),
      tier: 0,
      bomb: false,
    });
    return;
  }

  // Joker pairs are the only natural joker set other than the joker bomb.
  const jokers = cards.filter(isJoker);
  if (jokers.length > 0) {
    if (jokers.length !== size) return;
    if (size === 2 && cards[0].rank === cards[1].rank) {
      addCombo(out, {
        type: 'pair',
        cards: cards.slice(),
        size: 2,
        rank: powerRank(cards[0].rank, level),
        tier: 0,
        bomb: false,
      });
    }
    return;
  }

  for (let rank = 2; rank <= ACE; rank += 1) {
    if (rank === level) {
      const naturals = cards.filter((card) => card.rank === level);
      if (naturals.length !== size) continue;
      if (size === 2) {
        addCombo(out, {
          type: 'pair',
          cards: cards.slice(),
          size: 2,
          rank: 15,
          tier: 0,
          bomb: false,
        });
      } else if (size === 3) {
        addCombo(out, {
          type: 'triple',
          cards: cards.slice(),
          size: 3,
          rank: 15,
          tier: 0,
          bomb: false,
        });
      } else if (size >= 4 && size <= 8) {
        addCombo(out, {
          type: 'bomb',
          cards: cards.slice(),
          size,
          rank: 15,
          tier: size,
          bomb: true,
        });
      }
      continue;
    }

    const naturals = cards.filter((card) => card.rank === rank);
    const wilds = cards.filter((card) => isWild(card, level));
    if (naturals.length + wilds.length !== size) continue;
    if (naturals.length === 0 && size >= 3) continue;
    const rankPower = powerRank(rank, level);
    if (size === 2) {
      addCombo(out, {
        type: 'pair',
        cards: cards.slice(),
        size: 2,
        rank: rankPower,
        tier: 0,
        bomb: false,
      });
    } else if (size === 3) {
      addCombo(out, {
        type: 'triple',
        cards: cards.slice(),
        size: 3,
        rank: rankPower,
        tier: 0,
        bomb: false,
      });
    } else if (size >= 4 && size <= 10) {
      addCombo(out, {
        type: 'bomb',
        cards: cards.slice(),
        size,
        rank: rankPower,
        tier: size,
        bomb: true,
      });
    }
  }
}

function canSplitFullHouse(cards: readonly Card[], tripleRank: number, pairRank: number, level: number): boolean {
  if (!noJokers(cards)) return false;
  if (cards.length !== 5) return false;
  const options = cards.map((card) => canRepresent(card, tripleRank, level) || canRepresent(card, pairRank, level));
  if (options.some((value) => !value)) return false;
  for (let a = 0; a < 5; a += 1) {
    for (let b = a + 1; b < 5; b += 1) {
      for (let c = b + 1; c < 5; c += 1) {
        if (
          canRepresent(cards[a], tripleRank, level) &&
          canRepresent(cards[b], tripleRank, level) &&
          canRepresent(cards[c], tripleRank, level)
        ) {
          const rest = [0, 1, 2, 3, 4].filter((index) => index !== a && index !== b && index !== c);
          if (rest.every((index) => canRepresent(cards[index], pairRank, level))) return true;
        }
      }
    }
  }
  return false;
}

function detectFullHouses(cards: readonly Card[], level: number, out: Combo[]): void {
  if (cards.length !== 5 || !noJokers(cards)) return;
  for (let tripleRank = 2; tripleRank <= ACE; tripleRank += 1) {
    for (let pairRank = 2; pairRank <= ACE; pairRank += 1) {
      if (tripleRank === pairRank) continue;
      if (canSplitFullHouse(cards, tripleRank, pairRank, level)) {
        addCombo(out, {
          type: 'full-house',
          cards: cards.slice(),
          size: 5,
          rank: powerRank(tripleRank, level),
          tier: 0,
          bomb: false,
          pairRank: powerRank(pairRank, level),
        });
      }
    }
  }
}

function detectSequences(cards: readonly Card[], level: number, out: Combo[]): void {
  if (!noJokers(cards)) return;
  const wilds = wildCount(cards, level);
  const natural = cards.filter((card) => !isWild(card, level));

  if (cards.length === 5) {
    for (const window of sequenceWindows(5)) {
      const usedRanks = new Set<number>();
      let valid = true;
      for (const card of natural) {
        if (!window.ranks.includes(card.rank) || usedRanks.has(card.rank)) {
          valid = false;
          break;
        }
        usedRanks.add(card.rank);
      }
      if (!valid) continue;
      const missing = window.ranks.length - usedRanks.size;
      if (missing > wilds) continue;
      addCombo(out, {
        type: 'straight',
        cards: cards.slice(),
        size: 5,
        rank: window.start,
        tier: 0,
        bomb: false,
        low: window.start,
        high: window.start + 4,
      });
    }
  }

  if (cards.length === 6) {
    for (const window of sequenceWindows(3)) {
      const counts = new Map<number, number>();
      let valid = true;
      for (const card of natural) {
        if (!window.ranks.includes(card.rank)) {
          valid = false;
          break;
        }
        const next = (counts.get(card.rank) ?? 0) + 1;
        if (next > 2) {
          valid = false;
          break;
        }
        counts.set(card.rank, next);
      }
      if (!valid) continue;
      addCombo(out, {
        type: 'pair-chain',
        cards: cards.slice(),
        size: 6,
        rank: window.start,
        tier: 0,
        bomb: false,
        low: window.start,
        high: window.start + 2,
      });
    }

    for (const window of sequenceWindows(2)) {
      const counts = new Map<number, number>();
      let valid = true;
      for (const card of natural) {
        if (!window.ranks.includes(card.rank)) {
          valid = false;
          break;
        }
        const next = (counts.get(card.rank) ?? 0) + 1;
        if (next > 3) {
          valid = false;
          break;
        }
        counts.set(card.rank, next);
      }
      if (!valid) continue;
      addCombo(out, {
        type: 'triple-chain',
        cards: cards.slice(),
        size: 6,
        rank: window.start,
        tier: 0,
        bomb: false,
        low: window.start,
        high: window.start + 1,
      });
    }
  }
}

function detectStraightFlushes(cards: readonly Card[], level: number, out: Combo[]): void {
  if (cards.length !== 5 || !noJokers(cards)) return;
  const wilds = wildCount(cards, level);
  const natural = cards.filter((card) => !isWild(card, level));
  for (const suit of SUITS) {
    if (natural.some((card) => card.suit !== suit)) continue;
    for (const window of sequenceWindows(5)) {
      const usedRanks = new Set<number>();
      let valid = true;
      for (const card of natural) {
        if (!window.ranks.includes(card.rank) || usedRanks.has(card.rank)) {
          valid = false;
          break;
        }
        usedRanks.add(card.rank);
      }
      if (!valid) continue;
      const missing = window.ranks.length - usedRanks.size;
      if (missing > wilds) continue;
      addCombo(out, {
        type: 'straight-flush',
        cards: cards.slice(),
        size: 5,
        rank: window.start,
        tier: 5.5,
        bomb: true,
        low: window.start,
        high: window.start + 4,
        suit,
      });
    }
  }
}

/** All legal interpretations of an exact set of cards. */
export function detectCombos(cards: readonly Card[], level: number): Combo[] {
  if (cards.length === 0 || cards.length > 10) return [];
  const out: Combo[] = [];

  // Joker bomb: exactly the two small and two big jokers.
  if (
    cards.length === 4 &&
    countRank(cards, SMALL_JOKER) === 2 &&
    countRank(cards, BIG_JOKER) === 2
  ) {
    addCombo(out, {
      type: 'joker-bomb',
      cards: cards.slice(),
      size: 4,
      rank: 100,
      tier: 100,
      bomb: true,
    });
  }

  detectSets(cards, level, out);
  detectFullHouses(cards, level, out);
  detectSequences(cards, level, out);
  detectStraightFlushes(cards, level, out);
  return out;
}

export function comboStrength(combo: Combo): number {
  if (combo.type === 'joker-bomb') return 1000;
  if (combo.bomb) return 100 + combo.tier * 10;
  switch (combo.type) {
    case 'single':
      return 10;
    case 'pair':
      return 20;
    case 'triple':
      return 30;
    case 'triple-chain':
      return 40;
    case 'pair-chain':
      return 45;
    case 'straight':
      return 50;
    case 'full-house':
      return 60;
    default:
      return 0;
  }
}

export function comboBeats(next: Combo, previous: Combo | null): boolean {
  if (!previous) return true;
  if (next.bomb && !previous.bomb) return true;
  if (!next.bomb && previous.bomb) return false;
  if (next.bomb && previous.bomb) {
    if (next.type === 'joker-bomb' || previous.type === 'joker-bomb') {
      return next.type === 'joker-bomb' && previous.type !== 'joker-bomb';
    }
    if (next.tier !== previous.tier) return next.tier > previous.tier;
    return next.rank > previous.rank;
  }
  if (next.type !== previous.type) return false;
  if (next.size !== previous.size) return false;
  return next.rank > previous.rank;
}

/**
 * Pick one interpretation for a selected set of cards. Leading prefers the
 * strongest (so a same-suit straight is a straight flush). Following prefers
 * the cheapest interpretation that beats the current trick.
 */
export function bestCombo(
  cards: readonly Card[],
  level: number,
  previous: Combo | null,
): Combo | null {
  const all = detectCombos(cards, level);
  if (all.length === 0) return null;
  if (!previous) {
    return all.slice().sort((a, b) => comboStrength(b) - comboStrength(a) || b.rank - a.rank)[0] ?? null;
  }
  const legal = all
    .filter((combo) => comboBeats(combo, previous))
    .sort((a, b) => comboStrength(a) - comboStrength(b) || a.rank - b.rank);
  return legal[0] ?? null;
}

/* ------------------------------------------------------------------------- */
/* Candidate generation                                                      */
/* ------------------------------------------------------------------------- */

function firstCards(cards: readonly Card[], count: number): Card[] {
  return cards.slice(0, Math.max(0, count));
}

function levelCards(hand: readonly Card[], level: number): Card[] {
  const natural = hand.filter((card) => card.rank === level && !isWild(card, level));
  const wild = hand.filter((card) => isWild(card, level));
  return [...natural, ...wild];
}

function takeSet(
  hand: readonly Card[],
  level: number,
  rank: number,
  size: number,
  wilds: number,
): Card[] | null {
  if (wilds < 0 || wilds > 2) return null;
  const pool =
    rank === level
      ? levelCards(hand, level)
      : hand.filter((card) => card.rank === rank && !isWild(card, level));
  const wildPool = hand.filter((card) => isWild(card, level));
  if (rank !== level) {
    const naturalsNeeded = size - wilds;
    if (naturalsNeeded < 1) return null;
    if (pool.length < naturalsNeeded) return null;
    if (wildPool.length < wilds) return null;
    return [...firstCards(pool, naturalsNeeded), ...firstCards(wildPool, wilds)];
  }
  if (pool.length < size) return null;
  return firstCards(pool, size);
}

function addCandidate(target: Card[][], cards: Card[] | null): void {
  if (!cards) return;
  if (cards.length === 0) return;
  const ids = new Set(cards.map((card) => card.id));
  if (ids.size !== cards.length) return;
  target.push(cards);
}

function generateSetCandidates(hand: readonly Card[], level: number, out: Card[][]): void {
  // Singles, including jokers and wildcards.
  for (const card of hand) addCandidate(out, [card]);

  // Natural joker pairs.
  for (const jokerRank of [SMALL_JOKER, BIG_JOKER]) {
    const pool = hand.filter((card) => card.rank === jokerRank);
    if (pool.length >= 2) addCandidate(out, firstCards(pool, 2));
  }

  const wilds = hand.filter((card) => isWild(card, level)).length;
  for (let rank = 2; rank <= ACE; rank += 1) {
    for (const size of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      if (size > 10) continue;
      const naturalPool =
        rank === level
          ? levelCards(hand, level)
          : hand.filter((card) => card.rank === rank && !isWild(card, level));
      if (rank === level) {
        if (naturalPool.length < size) continue;
        if (naturalPool.length > 8) continue;
        addCandidate(out, firstCards(naturalPool, size));
      } else {
        const naturalsNeeded = Math.max(1, size - Math.min(wilds, 2));
        if (naturalPool.length < naturalsNeeded) continue;
        const useWilds = Math.max(0, size - naturalPool.length);
        if (useWilds > wilds) continue;
        addCandidate(out, [
          ...firstCards(naturalPool, size - useWilds),
          ...firstCards(hand.filter((card) => isWild(card, level)), useWilds),
        ]);
      }
    }
  }
}

function generateFullHouseCandidates(hand: readonly Card[], level: number, out: Card[][]): void {
  const wildPool = hand.filter((card) => isWild(card, level));
  for (let tripleRank = 2; tripleRank <= ACE; tripleRank += 1) {
    for (let pairRank = 2; pairRank <= ACE; pairRank += 1) {
      if (tripleRank === pairRank) continue;
      const tripleNatural = hand.filter((card) =>
        tripleRank === level
          ? card.rank === level
          : card.rank === tripleRank && !isWild(card, level),
      );
      const pairNatural = hand.filter((card) =>
        pairRank === level
          ? card.rank === level
          : card.rank === pairRank && !isWild(card, level),
      );
      for (let tripleWilds = 0; tripleWilds <= 2; tripleWilds += 1) {
        for (let pairWilds = 0; pairWilds <= 2; pairWilds += 1) {
          if (tripleWilds + pairWilds > wildPool.length) continue;
          if (tripleRank === level) {
            // A level triple uses level cards; wilds are already in the pool.
            if (tripleNatural.length < 3) continue;
          } else if (tripleNatural.length + tripleWilds < 3) {
            continue;
          }
          if (pairRank === level) {
            if (pairNatural.length < 2) continue;
          } else if (pairNatural.length + pairWilds < 2) {
            continue;
          }
          const triple = takeSet(hand, level, tripleRank, 3, tripleWilds);
          if (!triple) continue;
          const used = new Set(triple.map((card) => card.id));
          const pairPool = hand.filter((card) => !used.has(card.id));
          const pair = pairRank === level
            ? (() => {
                const pool = levelCards(pairPool, level);
                return pool.length >= 2 ? firstCards(pool, 2) : null;
              })()
            : (() => {
                const naturals = pairPool.filter(
                  (card) => card.rank === pairRank && !isWild(card, level),
                );
                const remainingWilds = pairPool.filter((card) => isWild(card, level));
                if (naturals.length + Math.min(pairWilds, remainingWilds.length) < 2) return null;
                const use = Math.min(pairWilds, Math.max(0, 2 - naturals.length));
                if (naturals.length + use < 2) return null;
                return [...firstCards(naturals, 2 - use), ...firstCards(remainingWilds, use)];
              })();
          if (!pair) continue;
          const cards = [...triple, ...pair];
          if (cards.length === 5) addCandidate(out, cards);
        }
      }
    }
  }
}

function generateStraightCandidates(hand: readonly Card[], level: number, out: Card[][]): void {
  const wildPool = hand.filter((card) => isWild(card, level));
  for (const window of sequenceWindows(5)) {
    const chosen: Card[] = [];
    let wildsUsed = 0;
    let valid = true;
    for (const rank of window.ranks) {
      const natural = hand.find((card) => card.rank === rank && !isWild(card, level));
      if (natural) {
        chosen.push(natural);
      } else {
        const wild = wildPool[wildsUsed];
        if (!wild) {
          valid = false;
          break;
        }
        chosen.push(wild);
        wildsUsed += 1;
      }
    }
    if (valid) addCandidate(out, chosen);
  }
}

function generatePairChainCandidates(hand: readonly Card[], level: number, out: Card[][]): void {
  const wildPool = hand.filter((card) => isWild(card, level));
  for (const window of sequenceWindows(3)) {
    const chosen: Card[] = [];
    let wildsUsed = 0;
    let valid = true;
    for (const rank of window.ranks) {
      const naturals = hand.filter((card) => card.rank === rank && !isWild(card, level));
      const use = firstCards(naturals, 2);
      chosen.push(...use);
      const missing = 2 - use.length;
      for (let index = 0; index < missing; index += 1) {
        const wild = wildPool[wildsUsed];
        if (!wild) {
          valid = false;
          break;
        }
        chosen.push(wild);
        wildsUsed += 1;
      }
      if (!valid) break;
    }
    if (valid && chosen.length === 6) addCandidate(out, chosen);
  }

  for (const window of sequenceWindows(2)) {
    const chosen: Card[] = [];
    let wildsUsed = 0;
    let valid = true;
    for (const rank of window.ranks) {
      const naturals = hand.filter((card) => card.rank === rank && !isWild(card, level));
      const use = firstCards(naturals, 3);
      chosen.push(...use);
      const missing = 3 - use.length;
      for (let index = 0; index < missing; index += 1) {
        const wild = wildPool[wildsUsed];
        if (!wild) {
          valid = false;
          break;
        }
        chosen.push(wild);
        wildsUsed += 1;
      }
      if (!valid) break;
    }
    if (valid && chosen.length === 6) addCandidate(out, chosen);
  }
}

function generateStraightFlushCandidates(hand: readonly Card[], level: number, out: Card[][]): void {
  const wildPool = hand.filter((card) => isWild(card, level));
  for (const suit of SUITS) {
    for (const window of sequenceWindows(5)) {
      const chosen: Card[] = [];
      let wildsUsed = 0;
      let valid = true;
      for (const rank of window.ranks) {
        const natural = hand.find(
          (card) => card.suit === suit && card.rank === rank && !isWild(card, level),
        );
        if (natural) {
          chosen.push(natural);
        } else {
          const wild = wildPool[wildsUsed];
          if (!wild) {
            valid = false;
            break;
          }
          chosen.push(wild);
          wildsUsed += 1;
        }
      }
      if (valid) addCandidate(out, chosen);
    }
  }
}

function generateJokerBomb(hand: readonly Card[], out: Card[][]): void {
  const small = hand.filter((card) => card.rank === SMALL_JOKER);
  const big = hand.filter((card) => card.rank === BIG_JOKER);
  if (small.length >= 2 && big.length >= 2) {
    addCandidate(out, [...firstCards(small, 2), ...firstCards(big, 2)]);
  }
}

export function generateCandidates(hand: readonly Card[], level: number): Card[][] {
  const out: Card[][] = [];
  generateSetCandidates(hand, level, out);
  generateFullHouseCandidates(hand, level, out);
  generateStraightCandidates(hand, level, out);
  generatePairChainCandidates(hand, level, out);
  generateStraightFlushCandidates(hand, level, out);
  generateJokerBomb(hand, out);
  const seen = new Set<string>();
  return out.filter((cards) => {
    const key = cards
      .map((card) => card.id)
      .sort()
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------------- */
/* Turn engine                                                               */
/* ------------------------------------------------------------------------- */

function activeSeats(state: GameState): number[] {
  return [0, 1, 2, 3].filter(
    (seat) => state.hands[seat].length > 0 && !state.finish.includes(seat),
  );
}

function nextActive(state: GameState, from: number): number {
  for (let step = 1; step <= PLAYER_COUNT; step += 1) {
    const seat = (from + step) % PLAYER_COUNT;
    if (state.hands[seat].length > 0 && !state.finish.includes(seat)) return seat;
  }
  return -1;
}

function nextEligible(state: GameState, from: number): number {
  for (let step = 1; step <= PLAYER_COUNT; step += 1) {
    const seat = (from + step) % PLAYER_COUNT;
    if (state.hands[seat].length === 0 || state.finish.includes(seat)) continue;
    if (state.trick && state.passed[seat]) continue;
    return seat;
  }
  return -1;
}

function trickLeader(state: GameState, lastSeat: number): number {
  if (state.hands[lastSeat].length > 0 && !state.finish.includes(lastSeat)) return lastSeat;
  const partner = partnerOf(lastSeat);
  if (state.hands[partner].length > 0 && !state.finish.includes(partner)) return partner;
  return nextActive(state, lastSeat);
}

function clearTrick(state: GameState, leader: number): GameState {
  return {
    ...state,
    trick: null,
    passed: emptyPassed(),
    turn: leader >= 0 ? leader : state.turn,
  };
}

function removeCards(hand: readonly Card[], ids: Set<string>): Card[] {
  return hand.filter((card) => !ids.has(card.id));
}

export function legalPlays(state: GameState, seat: number): Combo[] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return [];
  if (state.trick && state.passed[seat]) return [];
  const previous = state.trick?.combo ?? null;
  const candidates = generateCandidates(state.hands[seat], state.levelRank);
  const seen = new Set<string>();
  const plays: Combo[] = [];
  for (const cards of candidates) {
    const combo = bestCombo(cards, state.levelRank, previous);
    if (!combo) continue;
    const key = [
      combo.type,
      combo.size,
      combo.rank,
      combo.tier,
      cards.map((card) => card.id).sort().join('|'),
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    plays.push(combo);
  }
  return plays.sort((a, b) => comboStrength(a) - comboStrength(b) || a.rank - b.rank);
}

export function play(
  state: GameState,
  seat: number,
  cardIds: readonly string[],
): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) {
    return { ok: false, state, error: 'wrong-turn' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (state.finish.includes(seat) || state.hands[seat].length === 0) {
    return { ok: false, state, error: 'finished' };
  }
  if (state.trick && state.passed[seat]) return { ok: false, state, error: 'already-passed' };
  if (cardIds.length === 0) return { ok: false, state, error: 'empty' };

  const hand = state.hands[seat];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) return { ok: false, state, error: 'duplicate-card' };
    seen.add(id);
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, state, error: 'not-your-card' };
    cards.push(card);
  }

  const combo = bestCombo(cards, state.levelRank, state.trick?.combo ?? null);
  if (!combo) {
    const any = detectCombos(cards, state.levelRank);
    return { ok: false, state, error: any.length > 0 ? 'does-not-beat' : 'invalid-combo' };
  }

  const ids = new Set(cards.map((card) => card.id));
  const hands = state.hands.map((items, index) =>
    index === seat ? removeCards(items, ids) : items.slice(),
  );
  const finish =
    hands[seat].length === 0 && !state.finish.includes(seat)
      ? [...state.finish, seat]
      : state.finish.slice();
  const trick: Trick = {
    seat,
    combo,
    cards: cards.slice(),
  };
  const passed = state.passed.slice();
  passed[seat] = false;

  const base: GameState = {
    ...state,
    hands,
    trick,
    finish,
    passed,
    actions: state.actions + 1,
    last: { seat, kind: 'play', combo },
    discard: [...state.discard, ...cards],
  };

  if (finish.length >= PLAYER_COUNT - 1) {
    const remaining = [0, 1, 2, 3].find(
      (item) => hands[item].length > 0 && !finish.includes(item),
    );
    const order = remaining !== undefined ? [...finish, remaining] : finish.slice();
    return { ok: true, state: finishRound(base, order) };
  }

  const candidate = nextEligible(base, seat);
  if (candidate < 0 || candidate === seat) {
    const leader = trickLeader(base, seat);
    return { ok: true, state: clearTrick(base, leader) };
  }
  return { ok: true, state: { ...base, turn: candidate } };
}

export function pass(state: GameState, seat: number): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) {
    return { ok: false, state, error: 'wrong-turn' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (state.finish.includes(seat) || state.hands[seat].length === 0) {
    return { ok: false, state, error: 'finished' };
  }
  if (!state.trick) return { ok: false, state, error: 'no-trick' };
  if (state.passed[seat]) return { ok: false, state, error: 'already-passed' };

  const passed = state.passed.slice();
  passed[seat] = true;
  const base: GameState = {
    ...state,
    passed,
    actions: state.actions + 1,
    last: { seat, kind: 'pass' },
  };
  const active = activeSeats(base).filter((item) => item !== state.trick!.seat);
  const reset = active.every((item) => passed[item]);
  if (reset) {
    const leader = trickLeader(base, state.trick.seat);
    return { ok: true, state: clearTrick(base, leader) };
  }
  const candidate = nextEligible(base, seat);
  if (candidate < 0 || candidate === state.trick.seat) {
    const leader = trickLeader(base, state.trick.seat);
    return { ok: true, state: clearTrick(base, leader) };
  }
  return { ok: true, state: { ...base, turn: candidate } };
}

export function applySeat(state: GameState, seat: number, action: PlayerAction): MoveResult {
  if (!action || typeof action !== 'object') return { ok: false, state, error: 'phase' };
  if (action.type === 'play') {
    if (!Array.isArray(action.cards)) return { ok: false, state, error: 'not-your-card' };
    return play(state, seat, action.cards);
  }
  if (action.type === 'pass') return pass(state, seat);
  return { ok: false, state, error: 'phase' };
}

/* ------------------------------------------------------------------------- */
/* Round, level and tribute                                                  */
/* ------------------------------------------------------------------------- */

export function levelGainFor(order: number[]): number {
  if (order.length !== 4) return 0;
  const first = order[0];
  const partnerPlace = order.indexOf(partnerOf(first));
  if (partnerPlace === 1) return 3;
  if (partnerPlace === 2) return 2;
  return 1;
}

function finishRound(state: GameState, order: number[]): GameState {
  const unique = order.filter((seat, index) => order.indexOf(seat) === index);
  for (let seat = 0; seat < PLAYER_COUNT; seat += 1) {
    if (!unique.includes(seat)) unique.push(seat);
  }
  const finalOrder = unique.slice(0, 4);
  const winnerTeam = teamOf(finalOrder[0]);
  const gain = levelGainFor(finalOrder);
  const levelsBefore: [number, number] = [state.levels[0], state.levels[1]];
  const levelsAfter: [number, number] = [levelsBefore[0], levelsBefore[1]];
  let matchWinner: Team | null = null;
  if (levelsBefore[winnerTeam] === LEVEL_HIGH) {
    matchWinner = winnerTeam;
  } else {
    levelsAfter[winnerTeam] = Math.min(LEVEL_HIGH, levelsBefore[winnerTeam] + gain);
  }
  const result: RoundResult = {
    order: finalOrder,
    winnerTeam,
    gain,
    levelsBefore,
    levelsAfter,
    matchWinner,
    nextLevel: levelsAfter[winnerTeam],
  };
  return {
    ...state,
    finish: finalOrder,
    order: finalOrder,
    phase: matchWinner === null ? 'round-over' : 'match-over',
    turn: -1,
    result,
    matchWinner,
    passed: emptyPassed(),
  };
}

function highestTributeCard(hand: readonly Card[], level: number): Card {
  const eligible = hand.filter((card) => !isWild(card, level));
  const pool = eligible.length > 0 ? eligible : hand;
  return pool
    .slice()
    .sort((a, b) => cardPower(b, level) - cardPower(a, level) || b.rank - a.rank)[0];
}

/**
 * A hand-aware return choice: keep wildcards, level cards and jokers, and try
 * not to break a pair or triple. This is the policy used for AI and automatic
 * human returns; a future manual tribute screen can expose the same choice.
 */
export function chooseReturnCard(
  hand: readonly Card[],
  level: number,
  exclude: Set<string> = new Set(),
): Card {
  const available = hand.filter((card) => !exclude.has(card.id));
  const pool = available.length > 0 ? available : hand.slice();
  const counts = new Map<number, number>();
  for (const card of pool) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  const nonWild = pool.filter((card) => !isWild(card, level));
  const choice = nonWild.length > 0 ? nonWild : pool;
  const score = (card: Card): number => {
    let value = cardPower(card, level);
    if ((counts.get(card.rank) ?? 0) > 1) value += 20;
    if (card.rank === level) value += 28;
    if (card.rank >= SMALL_JOKER) value += 34;
    if (isWild(card, level)) value += 50;
    return value;
  };
  return choice.slice().sort((a, b) => score(a) - score(b) || a.rank - b.rank)[0];
}

function moveCard(
  hands: Card[][],
  from: number,
  to: number,
  card: Card,
  level: number,
): void {
  hands[from] = hands[from].filter((item) => item.id !== card.id);
  hands[to] = sortHand([...hands[to], card], level);
}

function countBigJokers(hand: readonly Card[]): number {
  return hand.filter((card) => card.rank === BIG_JOKER).length;
}

export function buildTribute(
  hands: Card[][],
  result: RoundResult,
  level: number,
): TributeSummary {
  const order = result.order;
  const lastSeat = order[3];
  const winnerTeam = result.winnerTeam;
  const leader = order[0];

  if (teamOf(lastSeat) === winnerTeam) {
    return {
      kind: 'none',
      moves: [],
      antiSeats: [],
      leader,
      level,
      gain: result.gain,
    };
  }

  const double = result.gain === 3;
  const payerSeats = double ? [order[3], order[2]] : [order[3]];
  const anti = double
    ? countBigJokers(hands[payerSeats[0]]) + countBigJokers(hands[payerSeats[1]]) >= 2
    : countBigJokers(hands[payerSeats[0]]) >= 2;

  if (anti) {
    return {
      kind: 'anti',
      moves: [],
      antiSeats: payerSeats,
      leader: order[3],
      level,
      gain: result.gain,
    };
  }

  const pairs: { from: number; to: number }[] = double
    ? [
        { from: order[3], to: order[0] },
        { from: order[2], to: order[1] },
      ]
    : [{ from: order[3], to: order[0] }];

  const moves: TributeMove[] = [];
  for (const pair of pairs) {
    const given = highestTributeCard(hands[pair.from], level);
    moveCard(hands, pair.from, pair.to, given, level);
    const returned = chooseReturnCard(hands[pair.to], level, new Set([given.id]));
    moveCard(hands, pair.to, pair.from, returned, level);
    moves.push({ from: pair.from, to: pair.to, card: given, back: returned });
  }

  return {
    kind: double ? 'double' : 'single',
    moves,
    antiSeats: [],
    leader,
    level,
    gain: result.gain,
  };
}

/** Deal the next round and pause on tribute when the table owes cards. */
export function nextRound(state: GameState, rng: Rng): MoveResult {
  if (state.phase !== 'round-over' || !state.result || state.matchWinner !== null) {
    return { ok: false, state, error: 'not-ready' };
  }
  const result = state.result;
  const nextLevel = result.nextLevel;
  const hands = deal(rng, nextLevel);
  const tribute = buildTribute(hands, result, nextLevel);
  hands.forEach((hand, index) => {
    hands[index] = sortHand(hand, nextLevel);
  });
  const turn = tribute.leader;
  const next: GameState = {
    ...state,
    hands,
    levels: [result.levelsAfter[0], result.levelsAfter[1]],
    levelRank: nextLevel,
    round: state.round + 1,
    turn,
    trick: null,
    passed: emptyPassed(),
    finish: [],
    order: null,
    phase: tribute.kind === 'none' ? 'playing' : 'tribute',
    starter: turn,
    tribute: tribute.kind === 'none' ? null : tribute,
    result: tribute.kind === 'none' ? null : state.result,
    actions: state.actions + 1,
    last: null,
    discard: [],
  };
  return { ok: true, state: next };
}

/** Leave the tribute screen and begin play. */
export function beginRound(state: GameState): GameState {
  if (state.phase !== 'tribute') return state;
  return {
    ...state,
    phase: 'playing',
    trick: null,
    passed: emptyPassed(),
    last: null,
    actions: state.actions + 1,
    tribute: null,
    result: null,
  };
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < PLAYER_COUNT ? seat : 0;
  const finished = state.finish.includes(safeSeat);
  const canPlay =
    state.phase === 'playing' &&
    state.turn === safeSeat &&
    !finished &&
    state.hands[safeSeat].length > 0 &&
    !(state.trick !== null && state.passed[safeSeat]);
  return {
    seat: safeSeat,
    team: teamOf(safeSeat),
    partner: partnerOf(safeSeat),
    hand: sortHand(state.hands[safeSeat] ?? [], state.levelRank),
    handCounts: state.hands.map((hand) => hand.length),
    names: names.slice(0, PLAYER_COUNT),
    levels: [state.levels[0], state.levels[1]],
    levelRank: state.levelRank,
    round: state.round,
    turn: state.turn,
    phase: state.phase,
    trick: state.trick
      ? {
          seat: state.trick.seat,
          combo: { ...state.trick.combo, cards: state.trick.combo.cards.slice() },
          cards: state.trick.cards.slice(),
        }
      : null,
    passed: state.passed.slice(),
    finish: state.finish.slice(),
    order: state.order ? state.order.slice() : null,
    starter: state.starter,
    result: state.result
      ? {
          ...state.result,
          order: state.result.order.slice(),
          levelsBefore: [state.result.levelsBefore[0], state.result.levelsBefore[1]],
          levelsAfter: [state.result.levelsAfter[0], state.result.levelsAfter[1]],
        }
      : null,
    tribute: state.tribute
      ? {
          ...state.tribute,
          moves: state.tribute.moves.map((move) => ({
            ...move,
            card: { ...move.card },
            back: move.back ? { ...move.back } : null,
          })),
          antiSeats: state.tribute.antiSeats.slice(),
        }
      : null,
    matchWinner: state.matchWinner,
    actions: state.actions,
    last: state.last
      ? { ...state.last, combo: state.last.combo ? { ...state.last.combo } : undefined }
      : null,
    discard: state.discard.slice(),
    canPlay,
    canPass: canPlay && state.trick !== null,
    isTurn: state.phase === 'playing' && state.turn === safeSeat,
    finished,
    awaitingTribute: state.phase === 'tribute',
  };
}

export function comboNameKey(combo: Combo): string {
  return combo.type;
}

export function sequenceLabel(low: number | undefined, high: number | undefined): string {
  const start = low ?? 1;
  const end = high ?? start;
  return `${start === 1 ? 'A' : rankLabel(start)}–${rankLabel(end)}`;
}

export function comboRankText(combo: Combo): string {
  if (combo.type === 'straight' || combo.type === 'pair-chain' || combo.type === 'triple-chain' || combo.type === 'straight-flush') {
    return sequenceLabel(combo.low, combo.high);
  }
  if (combo.type === 'joker-bomb') return 'Joker';
  if (combo.type === 'bomb') {
    const setRank = combo.rank === 15 ? 'level' : rankLabel(combo.rank);
    return `${combo.size} × ${setRank}`;
  }
  if (combo.type === 'full-house') {
    const triple = combo.rank === 15 ? 'level' : rankLabel(combo.rank);
    const pair = combo.pairRank === 15 ? 'level' : rankLabel(combo.pairRank ?? 0);
    return `${triple} / ${pair}`;
  }
  if (combo.rank === 15) return 'level';
  return rankLabel(combo.rank);
}
