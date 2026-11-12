/**
 * Big Two — a pure, deterministic four-player engine.
 *
 * Rules implemented:
 * - one standard 52-card deck, 13 cards to each of four seats;
 * - ranks 3 low … 10, J, Q, K, A, 2 high;
 * - suits diamonds < clubs < hearts < spades;
 * - the holder of the 3 of diamonds leads and the first play must include it;
 * - combinations: single, pair, triple, five-card straight, flush, full house,
 *   four of a kind plus one, straight flush;
 * - five-card hands rank straight < flush < full house < four + one < straight flush;
 * - a follower must play the same number of cards and beat the table;
 * - passing skips the seat until the trick clears; when every other seat passes,
 *   the last player to play leads again;
 * - the first seat to empty its hand wins immediately;
 * - scoring: one point per remaining card, doubled at ten or more and tripled at thirteen.
 *
 * No DOM, network, clock or ambient randomness. Dealing and AI sampling use the
 * injected RNG. `view()` is the only shape that may cross a privacy boundary.
 */

export type Suit = 'D' | 'C' | 'H' | 'S';
export type Rng = () => number;

export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-plus-one'
  | 'straight-flush';

export interface Combo {
  type: ComboType;
  cards: Card[];
  size: number;
  /** 0–4 only for five-card hands; 0 for singles, pairs and triples. */
  category: number;
  /** Main comparison rank (pair rank, triple rank, straight high, quad rank, …). */
  rank: number;
  /** Full house pair rank; otherwise 0. */
  secondary: number;
  /** Highest suit in the combination, used as the final tie-break. */
  suit: number;
}

export interface Trick {
  seat: number;
  combo: Combo;
}

export type Phase = 'playing' | 'round-over';

export interface RoundResult {
  winner: number;
  counts: number[];
  multipliers: number[];
  penalties: number[];
  gain: number;
}

export interface LastAction {
  seat: number;
  kind: 'play' | 'pass';
  combo?: Combo;
}

export interface GameState {
  hands: Card[][];
  turn: number;
  trick: Trick | null;
  passed: boolean[];
  phase: Phase;
  winner: number | null;
  result: RoundResult | null;
  mustLeadDiamond: boolean;
  starter: number;
  discard: Card[];
  last: LastAction | null;
  actions: number;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export type MoveError =
  | 'phase'
  | 'wrong-seat'
  | 'wrong-turn'
  | 'finished'
  | 'not-your-card'
  | 'duplicate-card'
  | 'empty'
  | 'too-many'
  | 'invalid-combo'
  | 'too-low'
  | 'must-lead-diamond'
  | 'already-passed'
  | 'no-trick'
  | 'cannot-pass';

export type PlayerAction =
  | { type: 'play'; cards: string[] }
  | { type: 'pass' };

export interface SeatView {
  seat: number;
  hand: Card[];
  handCounts: number[];
  names: string[];
  turn: number;
  trick: Trick | null;
  passed: boolean[];
  phase: Phase;
  winner: number | null;
  result: RoundResult | null;
  mustLeadDiamond: boolean;
  leadSeat: number | null;
  starter: number;
  discard: Card[];
  last: LastAction | null;
  actions: number;
  canPlay: boolean;
  canPass: boolean;
  isTurn: boolean;
  finished: boolean;
}

export const SUITS: readonly Suit[] = ['D', 'C', 'H', 'S'];
export const RANKS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const PLAYER_COUNT = 4;

const SUIT_VALUE: Record<Suit, number> = { D: 0, C: 1, H: 2, S: 3 };

const RANK_LABEL: Record<number, string> = {
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
  15: '2',
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitSymbol(suit: Suit): string {
  return suit === 'D' ? '♦' : suit === 'C' ? '♣' : suit === 'H' ? '♥' : '♠';
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}

export function makeCard(suit: Suit, rank: number): Card {
  return { id: `${suit}${rankLabel(rank)}`, rank, suit };
}

function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push(makeCard(suit, rank));
  }
  return cards;
}

export const DECK: readonly Card[] = makeDeck();

export function compareCard(a: Card, b: Card): number {
  return a.rank - b.rank || SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
}

export function sortHand(cards: readonly Card[]): Card[] {
  return cards.slice().sort(compareCard);
}

export function seededRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(cards: Card[], rng: Rng): Card[] {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const j = Math.floor(value * (i + 1));
    const swap = deck[i];
    deck[i] = deck[j];
    deck[j] = swap;
  }
  return deck;
}

export function deal(rng: Rng): Card[][] {
  const deck = shuffle([...DECK], rng);
  const hands: Card[][] = Array.from({ length: PLAYER_COUNT }, () => []);
  deck.forEach((card, index) => hands[index % PLAYER_COUNT].push(card));
  return hands.map(sortHand);
}

export function setup(rng: Rng): GameState {
  const hands = deal(rng);
  const starter = hands.findIndex((hand) => hand.some((card) => card.id === 'D3'));
  return {
    hands,
    turn: starter < 0 ? 0 : starter,
    trick: null,
    passed: Array.from({ length: PLAYER_COUNT }, () => false),
    phase: 'playing',
    winner: null,
    result: null,
    mustLeadDiamond: starter >= 0,
    starter: starter < 0 ? 0 : starter,
    discard: [],
    last: null,
    actions: 0,
  };
}

function emptyPassed(): boolean[] {
  return Array.from({ length: PLAYER_COUNT }, () => false);
}

function groupByRank(hand: readonly Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of hand) {
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  for (const list of groups.values()) list.sort(compareCard);
  return groups;
}

function combinationKey(cards: readonly Card[]): string {
  return cards
    .map((card) => card.id)
    .sort()
    .join('-');
}

function chooseCombinations<T>(items: readonly T[], choose: number): T[][] {
  if (choose < 0 || choose > items.length) return [];
  if (choose === 0) return [[]];
  if (choose === items.length) return [items.slice()];
  const result: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length === choose) {
      result.push(picked.slice());
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      picked.push(items[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return result;
}

/** Classify a legal Big Two combination, or return null. */
export function classify(cards: readonly Card[]): Combo | null {
  if (!cards || cards.length === 0 || cards.length === 4 || cards.length > 5) return null;
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return null;
  const sorted = sortHand(cards);
  const size = sorted.length;
  const top = sorted[sorted.length - 1];
  const typeBySize: Record<number, ComboType> = { 1: 'single', 2: 'pair', 3: 'triple' };

  if (size <= 3) {
    const rank = sorted[0].rank;
    if (sorted.some((card) => card.rank !== rank)) return null;
    const suit = Math.max(...sorted.map((card) => SUIT_VALUE[card.suit]));
    return { type: typeBySize[size], cards: sorted, size, category: 0, rank, secondary: 0, suit };
  }

  const counts = new Map<number, number>();
  for (const card of sorted) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const sameSuit = sorted.every((card) => card.suit === sorted[0].suit);
  const ranks = sorted.map((card) => card.rank);
  const consecutive =
    new Set(ranks).size === 5 &&
    ranks[4] - ranks[0] === 4 &&
    ranks[4] <= 14; // The 2 is high-only and never appears in a straight.

  if (sameSuit && consecutive) {
    return {
      type: 'straight-flush',
      cards: sorted,
      size: 5,
      category: 4,
      rank: ranks[4],
      secondary: 0,
      suit: SUIT_VALUE[top.suit],
    };
  }

  const four = [...counts.entries()].find(([, count]) => count === 4);
  if (four) {
    const kicker = sorted.find((card) => card.rank !== four[0]);
    return {
      type: 'four-plus-one',
      cards: sorted,
      size: 5,
      category: 3,
      rank: four[0],
      secondary: kicker ? kicker.rank : 0,
      suit: Math.max(...sorted.filter((card) => card.rank === four[0]).map((card) => SUIT_VALUE[card.suit])),
    };
  }

  const triple = [...counts.entries()].find(([, count]) => count === 3);
  const pair = [...counts.entries()].find(([, count]) => count === 2);
  if (triple && pair && counts.size === 2) {
    return {
      type: 'full-house',
      cards: sorted,
      size: 5,
      category: 2,
      rank: triple[0],
      secondary: pair[0],
      suit: Math.max(...sorted.filter((card) => card.rank === triple[0]).map((card) => SUIT_VALUE[card.suit])),
    };
  }

  if (sameSuit) {
    return {
      type: 'flush',
      cards: sorted,
      size: 5,
      category: 1,
      rank: top.rank,
      secondary: 0,
      suit: SUIT_VALUE[top.suit],
    };
  }

  if (consecutive) {
    return {
      type: 'straight',
      cards: sorted,
      size: 5,
      category: 0,
      rank: ranks[4],
      secondary: 0,
      suit: SUIT_VALUE[top.suit],
    };
  }

  return null;
}

/** True when `a` beats `b` under the table rules. */
export function beats(a: Combo, b: Combo): boolean {
  if (a.size !== b.size) return false;
  if (a.size === 5) {
    if (a.category !== b.category) return a.category > b.category;
    if (a.rank !== b.rank) return a.rank > b.rank;
    if (a.secondary !== b.secondary) return a.secondary > b.secondary;
    return a.suit > b.suit;
  }
  if (a.type !== b.type) return false;
  if (a.rank !== b.rank) return a.rank > b.rank;
  return a.suit > b.suit;
}

export function compareCombo(a: Combo, b: Combo): number {
  return (
    a.size - b.size ||
    a.category - b.category ||
    a.rank - b.rank ||
    a.secondary - b.secondary ||
    a.suit - b.suit
  );
}

function fiveCardCombos(hand: readonly Card[]): Combo[] {
  const found = new Map<string, Combo>();
  const add = (cards: Card[]) => {
    const combo = classify(cards);
    if (combo && combo.size === 5) found.set(combinationKey(combo.cards), combo);
  };
  const groups = groupByRank(hand);

  // Straights, including straight flushes. Ace is high; the 2 is not used.
  for (let start = 3; start <= 10; start += 1) {
    const choices: Card[][] = [];
    let possible = true;
    for (let rank = start; rank < start + 5; rank += 1) {
      const group = groups.get(rank);
      if (!group) {
        possible = false;
        break;
      }
      choices.push(group);
    }
    if (!possible) continue;
    const picked: Card[] = [];
    const walk = (index: number) => {
      if (index === choices.length) {
        add(picked.slice());
        return;
      }
      for (const card of choices[index]) {
        picked.push(card);
        walk(index + 1);
        picked.pop();
      }
    };
    walk(0);
  }

  // Flushes, including straight flushes.
  for (const suit of SUITS) {
    const suited = hand.filter((card) => card.suit === suit);
    if (suited.length < 5) continue;
    for (const cards of chooseCombinations(suited, 5)) add(cards);
  }

  // Full houses.
  const triples = [...groups.entries()].filter(([, cards]) => cards.length >= 3);
  const pairs = [...groups.entries()].filter(([, cards]) => cards.length >= 2);
  for (const [tripleRank, tripleCards] of triples) {
    for (const [pairRank, pairCards] of pairs) {
      if (pairRank === tripleRank) continue;
      for (const three of chooseCombinations(tripleCards, 3)) {
        for (const two of chooseCombinations(pairCards, 2)) {
          add([...three, ...two]);
        }
      }
    }
  }

  // Four of a kind plus one.
  for (const [quadRank, quadCards] of [...groups.entries()]) {
    if (quadCards.length !== 4) continue;
    for (const card of hand) {
      if (card.rank !== quadRank) add([...quadCards, card]);
    }
  }

  return [...found.values()];
}

/** All legal combinations for a seat's current turn. */
export function legalCombos(state: GameState, seat: number): Combo[] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) return [];
  const hand = state.hands[seat];
  if (hand.length === 0) return [];
  const leading = state.trick === null;
  const wanted = leading ? 0 : state.trick!.combo.size;
  const groups = groupByRank(hand);
  const combos: Combo[] = [];

  if (leading || wanted === 1) {
    for (const card of hand) {
      const combo = classify([card]);
      if (combo) combos.push(combo);
    }
  }
  if (leading || wanted === 2) {
    for (const cards of groups.values()) {
      if (cards.length < 2) continue;
      for (const pair of chooseCombinations(cards, 2)) {
        const combo = classify(pair);
        if (combo) combos.push(combo);
      }
    }
  }
  if (leading || wanted === 3) {
    for (const cards of groups.values()) {
      if (cards.length < 3) continue;
      for (const triple of chooseCombinations(cards, 3)) {
        const combo = classify(triple);
        if (combo) combos.push(combo);
      }
    }
  }
  if (leading || wanted === 5) {
    combos.push(...fiveCardCombos(hand));
  }

  const unique = new Map<string, Combo>();
  for (const combo of combos) unique.set(combinationKey(combo.cards), combo);
  const result = [...unique.values()];
  const filtered = state.trick ? result.filter((combo) => beats(combo, state.trick!.combo)) : result;
  if (state.mustLeadDiamond && state.trick === null) {
    return filtered
      .filter((combo) => combo.cards.some((card) => card.id === 'D3'))
      .sort(compareCombo);
  }
  return filtered.sort(compareCombo);
}

export interface PlayCheck {
  ok: boolean;
  error?: MoveError;
  combo?: Combo;
  cards: Card[];
}

export function checkPlay(state: GameState, seat: number, cardIds: readonly string[]): PlayCheck {
  if (state.phase !== 'playing') return { ok: false, error: 'phase', cards: [] };
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) {
    return { ok: false, error: 'wrong-seat', cards: [] };
  }
  if (state.turn !== seat) return { ok: false, error: 'wrong-turn', cards: [] };
  if (state.hands[seat].length === 0) return { ok: false, error: 'finished', cards: [] };
  if (state.trick && state.passed[seat]) return { ok: false, error: 'already-passed', cards: [] };
  if (!Array.isArray(cardIds) || cardIds.length === 0) return { ok: false, error: 'empty', cards: [] };
  if (cardIds.length > 5) return { ok: false, error: 'too-many', cards: [] };

  const hand = state.hands[seat];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) return { ok: false, error: 'duplicate-card', cards: [] };
    seen.add(id);
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, error: 'not-your-card', cards: [] };
    cards.push(card);
  }
  const combo = classify(cards);
  if (!combo) return { ok: false, error: 'invalid-combo', cards: [] };
  if (state.mustLeadDiamond && state.trick === null) {
    if (!cards.some((card) => card.id === 'D3')) {
      return { ok: false, error: 'must-lead-diamond', cards: [] };
    }
  }
  if (state.trick && !beats(combo, state.trick.combo)) {
    return { ok: false, error: 'too-low', cards: [] };
  }
  return { ok: true, combo, cards };
}

export function penaltyForCount(count: number): number {
  if (count >= 13) return count * 3;
  if (count >= 10) return count * 2;
  return count;
}

export function multiplierForCount(count: number): number {
  if (count >= 13) return 3;
  if (count >= 10) return 2;
  return 1;
}

export function scoreRound(hands: readonly Card[][], winner: number): RoundResult {
  const counts = hands.map((hand) => hand.length);
  const multipliers = counts.map((count, seat) =>
    seat === winner ? 0 : multiplierForCount(count),
  );
  const penalties = counts.map((count, seat) =>
    seat === winner ? 0 : penaltyForCount(count),
  );
  return {
    winner,
    counts,
    multipliers,
    penalties,
    gain: penalties.reduce((total, value) => total + value, 0),
  };
}

function nextEligible(state: GameState, from: number): number {
  for (let step = 1; step <= PLAYER_COUNT; step += 1) {
    const seat = (from + step) % PLAYER_COUNT;
    if (state.hands[seat].length === 0) continue;
    if (state.trick && state.passed[seat]) continue;
    return seat;
  }
  return -1;
}

function clearTrick(state: GameState, leader: number): GameState {
  return {
    ...state,
    trick: null,
    passed: emptyPassed(),
    turn: leader,
    mustLeadDiamond: false,
  };
}

export function play(state: GameState, seat: number, cardIds: readonly string[]): MoveResult {
  const check = checkPlay(state, seat, cardIds);
  if (!check.ok || !check.combo) return { ok: false, state, error: check.error };
  const combo = check.combo;
  const ids = new Set(check.cards.map((card) => card.id));
  const hands = state.hands.map((hand, index) =>
    index === seat ? hand.filter((card) => !ids.has(card.id)) : hand,
  );
  const passed = state.passed.slice();
  passed[seat] = false;
  const base: GameState = {
    ...state,
    hands,
    trick: { seat, combo },
    passed,
    mustLeadDiamond: false,
    discard: [...state.discard, ...check.cards],
    last: { seat, kind: 'play', combo },
    actions: state.actions + 1,
  };

  if (hands[seat].length === 0) {
    return {
      ok: true,
      state: {
        ...base,
        phase: 'round-over',
        winner: seat,
        result: scoreRound(hands, seat),
        turn: seat,
        passed: emptyPassed(),
      },
    };
  }

  const next = nextEligible(base, seat);
  if (next < 0 || next === seat) {
    return { ok: true, state: clearTrick(base, seat) };
  }
  return { ok: true, state: { ...base, turn: next } };
}

export function pass(state: GameState, seat: number): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) {
    return { ok: false, state, error: 'wrong-seat' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (state.hands[seat].length === 0) return { ok: false, state, error: 'finished' };
  if (!state.trick) return { ok: false, state, error: 'no-trick' };
  if (state.passed[seat]) return { ok: false, state, error: 'already-passed' };

  const passed = state.passed.slice();
  passed[seat] = true;
  const base: GameState = {
    ...state,
    passed,
    last: { seat, kind: 'pass' },
    actions: state.actions + 1,
  };
  const trickSeat = state.trick.seat;
  const next = nextEligible(base, seat);
  if (next < 0 || next === trickSeat) {
    return { ok: true, state: clearTrick(base, trickSeat) };
  }
  return { ok: true, state: { ...base, turn: next } };
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

export function fallbackAction(state: GameState, seat: number): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const combos = legalCombos(state, seat);
  if (combos.length > 0) {
    return { type: 'play', cards: combos[0].cards.map((card) => card.id) };
  }
  if (state.trick) return { type: 'pass' };
  return null;
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < PLAYER_COUNT ? seat : 0;
  const isTurn = state.phase === 'playing' && state.turn === safeSeat;
  return {
    seat: safeSeat,
    hand: sortHand(state.hands[safeSeat] ?? []),
    handCounts: state.hands.map((hand) => hand.length),
    names: names.slice(0, PLAYER_COUNT),
    turn: state.turn,
    trick: state.trick
      ? { ...state.trick, combo: { ...state.trick.combo, cards: state.trick.combo.cards.slice() } }
      : null,
    passed: state.passed.slice(),
    phase: state.phase,
    winner: state.winner,
    result: state.result
      ? {
          ...state.result,
          counts: state.result.counts.slice(),
          multipliers: state.result.multipliers.slice(),
          penalties: state.result.penalties.slice(),
        }
      : null,
    mustLeadDiamond: isTurn && state.trick === null && state.mustLeadDiamond,
    leadSeat: state.mustLeadDiamond && state.trick === null ? state.turn : null,
    starter: state.starter,
    discard: state.discard.slice(),
    last: state.last
      ? {
          ...state.last,
          ...(state.last.combo
            ? { combo: { ...state.last.combo, cards: state.last.combo.cards.slice() } }
            : {}),
        }
      : null,
    actions: state.actions,
    canPlay: isTurn,
    canPass: isTurn && state.trick !== null,
    isTurn,
    finished: state.phase === 'round-over' && state.winner === safeSeat,
  };
}

/** Greedy hand decomposition used by the AI: five-card blocks first, then groups. */
export interface Decomposition {
  groups: Card[][];
  units: number;
  fiveCard: number;
  controls: number;
}

function basicUnits(cards: readonly Card[]): number {
  let units = 0;
  for (const group of groupByRank(cards).values()) {
    units += Math.ceil(group.length / 3);
  }
  return units;
}

/** Cheap estimate of the number of plays left in a hand; used by the AI. */
export function handUnits(cards: readonly Card[]): number {
  return basicUnits(cards);
}

/** Weighted high-card control; used by the AI, never by the rules. */
export function handControl(cards: readonly Card[]): number {
  return controlCount(cards);
}

function controlCount(cards: readonly Card[]): number {
  return cards.filter((card) => card.rank >= 13).reduce((total, card) => {
    const weight = card.rank === 15 ? 4 : card.rank === 14 ? 3 : 1.5;
    return total + weight + SUIT_VALUE[card.suit] * 0.25;
  }, 0);
}

function bestFiveBlock(cards: readonly Card[]): { combo: Combo; units: number; rest: Card[] } | null {
  const combos = fiveCardCombos(cards);
  if (combos.length === 0) return null;
  let best: { combo: Combo; units: number; rest: Card[] } | null = null;
  for (const combo of combos) {
    const ids = new Set(combo.cards.map((card) => card.id));
    const rest = cards.filter((card) => !ids.has(card.id));
    const units = 1 + basicUnits(rest);
    const value = units - combo.category * 0.18 - combo.rank * 0.012;
    if (
      !best ||
      value < best.units - best.combo.category * 0.18 - best.combo.rank * 0.012 ||
      (Math.abs(value - (best.units - best.combo.category * 0.18 - best.combo.rank * 0.012)) < 1e-9 &&
        compareCombo(combo, best.combo) < 0)
    ) {
      best = { combo, units, rest };
    }
  }
  return best;
}

export function decomposeHand(hand: readonly Card[]): Decomposition {
  let remaining = sortHand(hand);
  const groups: Card[][] = [];
  let fiveCard = 0;

  for (let round = 0; round < 2; round += 1) {
    const block = bestFiveBlock(remaining);
    if (!block) break;
    // Only keep a five-card block when it genuinely reduces the number of plays.
    if (block.units >= basicUnits(remaining)) break;
    groups.push(block.combo.cards);
    remaining = block.rest;
    fiveCard += 1;
  }

  const rankGroups = groupByRank(remaining);
  const triples: Card[][] = [];
  const pairs: Card[][] = [];
  const singles: Card[][] = [];
  for (const cards of rankGroups.values()) {
    let rest = cards.slice();
    while (rest.length >= 3) {
      triples.push(rest.slice(0, 3));
      rest = rest.slice(3);
    }
    if (rest.length === 2) pairs.push(rest);
    else if (rest.length === 1) singles.push(rest);
  }
  groups.push(...triples, ...pairs, ...singles);

  return {
    groups,
    units: groups.length,
    fiveCard,
    controls: controlCount(hand),
  };
}
