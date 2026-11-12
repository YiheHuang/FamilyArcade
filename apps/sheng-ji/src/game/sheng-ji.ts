/**
 * Sheng Ji (升级) · four-player partnership trick-taking engine.
 *
 * Pure TypeScript: no DOM, network, clock or Math.random. Every shuffle takes an
 * injected RNG. Seats 0 and 2 are partners (South–North); seats 1 and 3 are
 * partners (West–East). Play proceeds 0 → 1 → 2 → 3.
 *
 * Family-table choices are explicit and documented in docs/rules.md:
 *  - two decks for pairs and tractors, but a point-card face scores once per deal
 *    (so the classic table totals 100 points);
 *  - throws are led in one plain suit only and every component must be the
 *    current highest of its kind;
 *  - a throw can only be beaten by a matching trump ruff;
 *  - level cards are always trump, including in no-trump.
 */

export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';
export type PlainSuit = Exclude<Suit, 'J'>;
export type TrumpSuit = PlainSuit | 'NT';
export type NormalRank =
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
export type Rank = NormalRank | 'SJ' | 'BJ';
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type Phase = 'declare' | 'bury' | 'play' | 'deal-over';
export type Category = 'T' | PlainSuit;
export type Rng = () => number;

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  deck: 0 | 1;
}

export interface Declaration {
  seat: Seat;
  kind: 'suit' | 'nt';
  suit: PlainSuit | null;
  strength: 1 | 2 | 3;
  cards: string[];
}

export interface BidOption {
  kind: 'suit' | 'nt';
  suit: PlainSuit | null;
  strength: 1 | 2 | 3;
  cards: string[];
}

export interface PlayedCard {
  seat: Seat;
  cards: Card[];
}

export interface Trick {
  leader: Seat;
  plays: PlayedCard[];
  winner: Seat;
  points: number;
}

export interface DealResult {
  deal: number;
  declarer: Seat;
  declarerTeam: Team;
  trump: TrumpSuit;
  levelRank: NormalRank;
  levelsBefore: [number, number];
  levelsAfter: [number, number];
  declarerPoints: number;
  defenderPoints: number;
  availablePoints: number;
  buriedPoints: number;
  success: boolean;
  upgradeTeam: Team;
  jump: number;
  matchWinner: Team | null;
  reason: 'made' | 'held' | 'defenders' | 'shutout';
}

export interface GameState {
  phase: Phase;
  version: number;
  deal: number;
  dealer: Seat;
  declareTurn: Seat | -1;
  declarationActions: number;
  declarations: Declaration[];
  declaration: Declaration | null;
  declarer: Seat | null;
  trump: TrumpSuit | null;
  levelRank: NormalRank;
  levels: [number, number];
  hands: Card[][];
  bottom: Card[];
  bottomTaken: boolean;
  buried: Card[];
  turn: Seat | -1;
  currentTrick: PlayedCard[];
  tricks: Trick[];
  lastTrick: Trick | null;
  points: [number, number];
  results: DealResult[];
  lastResult: DealResult | null;
  matchWinner: Team | null;
}

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export type MoveError =
  | 'bad-phase'
  | 'bad-seat'
  | 'wrong-turn'
  | 'bad-bid'
  | 'bid-too-low'
  | 'bad-bury'
  | 'not-declarer'
  | 'not-your-card'
  | 'dup-card'
  | 'bad-count'
  | 'must-follow'
  | 'shape-mismatch'
  | 'illegal-throw'
  | 'bad-lead'
  | 'match-over'
  | 'no-play';

export type ShapeKind = 'single' | 'pair' | 'tractor' | 'throw';

export interface LeadShape {
  kind: ShapeKind;
  size: number;
  pairNeed: number;
  tractorLengths: number[];
  topPower: number;
  category: Category;
  cards: Card[];
}

export interface PlayValidation {
  ok: boolean;
  error?: MoveError;
  shape?: LeadShape;
  lead?: LeadShape;
}

export interface SeatView {
  seat: Seat;
  team: Team;
  partner: Seat;
  names: string[];
  phase: Phase;
  version: number;
  deal: number;
  dealer: Seat;
  currentTurn: Seat | -1;
  declareTurn: Seat | -1;
  trump: TrumpSuit | null;
  levelRank: NormalRank;
  levels: [number, number];
  declarer: Seat | null;
  declarerTeam: Team | null;
  hand: Card[];
  handCounts: number[];
  bottomTaken: boolean;
  buriedCount: number;
  buried: Card[] | null;
  canDeclare: boolean;
  canBury: boolean;
  canPlay: boolean;
  declarationOptions: BidOption[];
  declaration: Declaration | null;
  declarations: Declaration[];
  currentTrick: PlayedCard[];
  lastTrick: Trick | null;
  trickCount: number;
  points: [number, number];
  pointsAvailable: number | null;
  legalCards: string[];
  lastResult: DealResult | null;
  results: DealResult[];
  matchWinner: Team | null;
}

export const SUITS: readonly PlainSuit[] = ['S', 'H', 'C', 'D'];
export const RANKS: readonly NormalRank[] = [
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
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const TEAM_LABELS: readonly string[] = ['South–North', 'West–East'];

const JOKER_SUIT: Suit = 'J';
const SUIT_ORDER: Record<PlainSuit, number> = { S: 3, H: 2, C: 1, D: 0 };
const RANK_VALUE: Record<NormalRank, number> = {
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
const PLAIN_ORDER: Record<PlainSuit, number> = { S: 0, H: 1, C: 2, D: 3 };

export const teamOf = (seat: number): Team => (seat % 2 === 0 ? 0 : 1);
export const partnerOf = (seat: number): Seat => (((seat + 2) % 4) as Seat);
export const leftOf = (seat: number): Seat => (((seat + 1) % 4) as Seat);
export const levelRankFor = (level: number): NormalRank =>
  RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.floor(level)))];
export const levelLabel = (level: number): string => levelRankFor(level);
export const isPlainSuit = (suit: Suit): suit is PlainSuit => suit !== 'J';
export const isJoker = (card: Card): boolean => card.rank === 'BJ' || card.rank === 'SJ';
export const isNormalRank = (rank: Rank): rank is NormalRank =>
  rank !== 'BJ' && rank !== 'SJ';
export const rankValue = (rank: Rank): number =>
  isNormalRank(rank) ? RANK_VALUE[rank] : rank === 'BJ' ? 17 : 16;

export interface SetupOptions {
  rng: Rng;
  dealer?: Seat;
  levels?: [number, number];
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${suit}${rank}-${copy}`, suit, rank, deck: copy as 0 | 1 });
      }
    }
    deck.push({ id: `JBJ-${copy}`, suit: JOKER_SUIT, rank: 'BJ', deck: copy as 0 | 1 });
    deck.push({ id: `JSJ-${copy}`, suit: JOKER_SUIT, rank: 'SJ', deck: copy as 0 | 1 });
  }
  return deck;
}

/** A face scores once per deal; the duplicate copy is a blank point card. */
export function pointValue(card: Card): number {
  if (card.deck !== 0) return 0;
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

export function literalPointValue(card: Card): number {
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

export function totalDeckPoints(cards: Card[] = makeDeck()): number {
  return cards.reduce((sum, card) => sum + pointValue(card), 0);
}

export function sortHand(cards: Card[], trump: TrumpSuit, levelRank: NormalRank): Card[] {
  return cards.slice().sort((a, b) => {
    const ac = isTrump(a, trump, levelRank) ? 0 : 1 + PLAIN_ORDER[a.suit as PlainSuit];
    const bc = isTrump(b, trump, levelRank) ? 0 : 1 + PLAIN_ORDER[b.suit as PlainSuit];
    if (ac !== bc) return ac - bc;
    if (ac === 0) {
      const power = trumpPower(b, trump, levelRank) - trumpPower(a, trump, levelRank);
      if (power !== 0) return power;
    } else {
      const rank = rankValue(b.rank) - rankValue(a.rank);
      if (rank !== 0) return rank;
    }
    const suit = (a.suit === 'J' ? -1 : SUIT_ORDER[a.suit]) - (b.suit === 'J' ? -1 : SUIT_ORDER[b.suit]);
    if (suit !== 0) return suit;
    return a.deck - b.deck;
  });
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const pick = Math.floor(value * (index + 1));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

export function isLevelCard(card: Card, levelRank: NormalRank): boolean {
  return isNormalRank(card.rank) && card.rank === levelRank;
}

export function isTrump(card: Card, trump: TrumpSuit, levelRank: NormalRank): boolean {
  if (isJoker(card)) return true;
  if (isLevelCard(card, levelRank)) return true;
  return trump !== 'NT' && card.suit === trump;
}

export function categoryOf(card: Card, trump: TrumpSuit, levelRank: NormalRank): Category {
  return isTrump(card, trump, levelRank) ? 'T' : (card.suit as PlainSuit);
}

export function trumpPower(card: Card, trump: TrumpSuit, levelRank: NormalRank): number {
  if (card.rank === 'BJ') return 400;
  if (card.rank === 'SJ') return 390;
  if (isNormalRank(card.rank) && card.rank === levelRank) {
    if (trump !== 'NT' && card.suit === trump) return 380 + SUIT_ORDER[card.suit as PlainSuit];
    return 370 + (isPlainSuit(card.suit) ? SUIT_ORDER[card.suit] : 0);
  }
  if (trump !== 'NT' && card.suit === trump) {
    return 200 + (isNormalRank(card.rank) ? RANK_VALUE[card.rank] : 0);
  }
  return 0;
}

export function cardPower(card: Card, trump: TrumpSuit, levelRank: NormalRank): number {
  if (isTrump(card, trump, levelRank)) return trumpPower(card, trump, levelRank);
  return isNormalRank(card.rank) ? RANK_VALUE[card.rank] : 0;
}

export function sameFace(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function isPair(cards: Card[]): boolean {
  return cards.length === 2 && sameFace(cards[0], cards[1]);
}

export function countPairs(cards: Card[]): number {
  const groups = new Map<string, number>();
  for (const card of cards) {
    const key = `${card.suit}:${card.rank}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  let total = 0;
  for (const count of groups.values()) total += Math.floor(count / 2);
  return total;
}

export function isTractor(cards: Card[], trump: TrumpSuit, levelRank: NormalRank): boolean {
  if (cards.length < 4 || cards.length % 2 !== 0) return false;
  if (!cards.every((card) => categoryOf(card, trump, levelRank) === categoryOf(cards[0], trump, levelRank))) {
    return false;
  }
  const suit = cards[0].suit;
  if (!isPlainSuit(suit)) return false;
  if (!cards.every((card) => card.suit === suit)) return false;
  if (cards.some((card) => isJoker(card) || isLevelCard(card, levelRank))) return false;
  if (categoryOf(cards[0], trump, levelRank) === 'T' && trump === 'NT') return false;

  const groups = new Map<NormalRank, Card[]>();
  for (const card of cards) {
    if (!isNormalRank(card.rank)) return false;
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  const ranks = [...groups.keys()].sort((a, b) => rankValue(a) - rankValue(b));
  if (ranks.length < 2) return false;
  for (const rank of ranks) {
    if (groups.get(rank)?.length !== 2) return false;
  }
  for (let index = 1; index < ranks.length; index += 1) {
    if (rankValue(ranks[index]) !== rankValue(ranks[index - 1]) + 1) return false;
  }
  return true;
}

export interface ThrowComponent {
  kind: 'single' | 'pair' | 'tractor';
  cards: Card[];
  topRank: number;
  size: number;
}

/** Canonical decomposition: longest consecutive pair runs first, then pairs, then singles. */
export function decomposePlain(cards: Card[]): ThrowComponent[] {
  if (cards.length === 0) return [];
  const suit = cards[0].suit;
  if (!cards.every((card) => card.suit === suit)) return [];
  const groups = new Map<NormalRank, Card[]>();
  for (const card of cards) {
    if (!isNormalRank(card.rank)) return [];
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  const ranks = [...groups.keys()].sort((a, b) => rankValue(b) - rankValue(a));
  const components: ThrowComponent[] = [];
  let run: NormalRank[] = [];

  const flushRun = () => {
    if (run.length >= 2) {
      const runCards = run.flatMap((rank) => groups.get(rank) ?? []);
      components.push({
        kind: 'tractor',
        cards: runCards,
        topRank: rankValue(run[0]),
        size: runCards.length,
      });
    } else if (run.length === 1) {
      const runCards = groups.get(run[0]) ?? [];
      components.push({
        kind: 'pair',
        cards: runCards,
        topRank: rankValue(run[0]),
        size: 2,
      });
    }
    run = [];
  };

  for (const rank of ranks) {
    const group = groups.get(rank) ?? [];
    if (group.length === 2) {
      if (
        run.length === 0 ||
        rankValue(rank) === rankValue(run[run.length - 1]) - 1
      ) {
        run.push(rank);
      } else {
        flushRun();
        run.push(rank);
      }
    } else {
      flushRun();
      components.push({
        kind: 'single',
        cards: group.slice(0, 1),
        topRank: rankValue(rank),
        size: 1,
      });
    }
  }
  flushRun();
  return components;
}

export function analyzeCards(
  cards: Card[],
  trump: TrumpSuit,
  levelRank: NormalRank,
): LeadShape | null {
  if (cards.length === 0) return null;
  const category = categoryOf(cards[0], trump, levelRank);
  if (cards.some((card) => categoryOf(card, trump, levelRank) !== category)) return null;
  const topPower = Math.max(...cards.map((card) => cardPower(card, trump, levelRank)));
  if (cards.length === 1) {
    return { kind: 'single', size: 1, pairNeed: 0, tractorLengths: [], topPower, category, cards };
  }
  if (isPair(cards)) {
    return { kind: 'pair', size: 2, pairNeed: 1, tractorLengths: [], topPower, category, cards };
  }
  if (isTractor(cards, trump, levelRank)) {
    return {
      kind: 'tractor',
      size: cards.length,
      pairNeed: cards.length / 2,
      tractorLengths: [cards.length],
      topPower,
      category,
      cards,
    };
  }
  if (category === 'T') return null;
  const components = decomposePlain(cards);
  if (components.length < 2) return null;
  const pairNeed = components.reduce(
    (sum, component) => sum + (component.kind === 'single' ? 0 : component.size / 2),
    0,
  );
  return {
    kind: 'throw',
    size: cards.length,
    pairNeed,
    tractorLengths: components
      .filter((component) => component.kind === 'tractor')
      .map((component) => component.size),
    topPower,
    category,
    cards,
  };
}

function opponentCards(state: GameState, seat: Seat): Card[] {
  const cards: Card[] = [];
  for (const other of SEATS) {
    if (other !== seat) cards.push(...state.hands[other]);
  }
  return cards;
}

function plainCardsOfSuit(cards: Card[], suit: PlainSuit, trump: TrumpSuit, levelRank: NormalRank): Card[] {
  return cards.filter((card) => card.suit === suit && !isTrump(card, trump, levelRank));
}

function pairsOfSuit(cards: Card[], suit: PlainSuit, trump: TrumpSuit, levelRank: NormalRank): { rank: number; cards: Card[] }[] {
  const groups = new Map<NormalRank, Card[]>();
  for (const card of plainCardsOfSuit(cards, suit, trump, levelRank)) {
    if (!isNormalRank(card.rank)) continue;
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  const pairs: { rank: number; cards: Card[] }[] = [];
  for (const [rank, group] of groups) {
    if (group.length >= 2) pairs.push({ rank: rankValue(rank), cards: group.slice(0, 2) });
  }
  return pairs;
}

function tractorRunsOfSuit(
  cards: Card[],
  suit: PlainSuit,
  trump: TrumpSuit,
  levelRank: NormalRank,
): { size: number; topRank: number; ranks: number[] }[] {
  const pairs = pairsOfSuit(cards, suit, trump, levelRank);
  const ranks = [...new Set(pairs.map((pair) => pair.rank))].sort((a, b) => a - b);
  const runs: { size: number; topRank: number; ranks: number[] }[] = [];
  let run: number[] = [];
  for (const rank of ranks) {
    if (run.length === 0 || rank === run[run.length - 1] + 1) run.push(rank);
    else {
      if (run.length >= 2) runs.push({ size: run.length * 2, topRank: run[run.length - 1], ranks: run.slice() });
      run = [rank];
    }
  }
  if (run.length >= 2) runs.push({ size: run.length * 2, topRank: run[run.length - 1], ranks: run.slice() });
  return runs;
}

interface ComponentCheck {
  ok: boolean;
  component: ThrowComponent;
}

function componentIsHighest(
  state: GameState,
  seat: Seat,
  suit: PlainSuit,
  component: ThrowComponent,
): ComponentCheck {
  const opponents = opponentCards(state, seat);
  if (component.kind === 'single') {
    const higher = plainCardsOfSuit(opponents, suit, state.trump ?? 'NT', state.levelRank).some(
      (card) => rankValue(card.rank) > component.topRank,
    );
    return { ok: !higher, component };
  }
  if (component.kind === 'pair') {
    const higher = pairsOfSuit(opponents, suit, state.trump ?? 'NT', state.levelRank).some(
      (pair) => pair.rank > component.topRank,
    );
    return { ok: !higher, component };
  }
  const higher = tractorRunsOfSuit(opponents, suit, state.trump ?? 'NT', state.levelRank).some(
    (run) => run.size >= component.size && run.topRank > component.topRank,
  );
  return { ok: !higher, component };
}

export function throwIsLegal(state: GameState, seat: Seat, cards: Card[]): boolean {
  const shape = analyzeCards(cards, state.trump ?? 'NT', state.levelRank);
  if (!shape || shape.kind !== 'throw' || shape.category === 'T') return false;
  const components = decomposePlain(cards);
  return components.every(
    (component) => componentIsHighest(state, seat, shape.category as PlainSuit, component).ok,
  );
}

export function legalThrows(state: GameState, seat: Seat): Card[][] {
  if (state.phase !== 'play' || state.turn !== seat) return [];
  const trump = state.trump ?? 'NT';
  const hand = state.hands[seat];
  const candidates: Card[][] = [];
  for (const suit of SUITS) {
    const pool = hand.filter((card) => card.suit === suit && !isTrump(card, trump, state.levelRank));
    if (pool.length < 2) continue;
    let chosen = pool.slice();
    for (let guard = 0; guard < 8; guard += 1) {
      const shape = analyzeCards(chosen, trump, state.levelRank);
      if (!shape || shape.kind !== 'throw') break;
      const components = decomposePlain(chosen);
      const bad = components.find(
        (component) => !componentIsHighest(state, seat, suit, component).ok,
      );
      if (!bad) {
        candidates.push(chosen);
        break;
      }
      const badIds = new Set(bad.cards.map((card) => card.id));
      chosen = chosen.filter((card) => !badIds.has(card.id));
      if (chosen.length < 2) break;
    }
  }
  return candidates;
}

export function makePlay(seat: Seat, cards: Card[]): PlayedCard {
  return { seat, cards: cards.slice() };
}

function cardsInTrick(trick: PlayedCard[]): Card[] {
  return trick.flatMap((play) => play.cards);
}

export function trickWinner(
  trick: PlayedCard[],
  trump: TrumpSuit,
  levelRank: NormalRank,
): Seat {
  if (trick.length === 0) return 0;
  const lead = analyzeCards(trick[0].cards, trump, levelRank);
  if (!lead) return trick[0].seat;
  let bestSeat = trick[0].seat;
  let bestCategory = lead.category;
  let bestPower = lead.topPower;
  for (const play of trick.slice(1)) {
    if (play.cards.length !== lead.size) continue;
    const shape = analyzeCards(play.cards, trump, levelRank);
    let category: Category | null = shape?.category ?? null;
    let power = shape?.topPower ?? 0;
    let eligible = false;
    if (shape) {
      if (shape.category === lead.category) {
        // A legal throw is already the highest of every component in its suit;
        // only a matching trump ruff can take it away.
        eligible = lead.kind !== 'throw' && shapeMatches(shape, lead);
      } else if (lead.category !== 'T' && shape.category === 'T') {
        eligible = shapeMatches(shape, lead);
      }
    } else if (
      lead.kind === 'throw' &&
      lead.category !== 'T' &&
      play.cards.every((card) => isTrump(card, trump, levelRank)) &&
      countPairs(play.cards) >= lead.pairNeed
    ) {
      // A mixed trump ruff of a throw has no plain-suit shape, but still needs
      // the same card count and pair count.
      category = 'T';
      power = Math.max(...play.cards.map((card) => cardPower(card, trump, levelRank)));
      eligible = true;
    }
    if (!eligible || category === null) continue;
    if (category === 'T' && bestCategory !== 'T') {
      bestSeat = play.seat;
      bestCategory = 'T';
      bestPower = power;
      continue;
    }
    if (category !== bestCategory) continue;
    if (power > bestPower) {
      bestSeat = play.seat;
      bestPower = power;
    }
  }
  return bestSeat;
}

function shapeMatches(shape: LeadShape, lead: LeadShape): boolean {
  if (shape.size !== lead.size) return false;
  if (lead.kind === 'single') return shape.kind === 'single';
  if (lead.kind === 'pair') return shape.kind === 'pair';
  if (lead.kind === 'tractor') {
    return shape.kind === 'tractor' && shape.size === lead.size;
  }
  return shape.pairNeed >= lead.pairNeed;
}

function shapeForFollow(
  cards: Card[],
  lead: LeadShape,
  trump: TrumpSuit,
  levelRank: NormalRank,
): LeadShape | null {
  const shape = analyzeCards(cards, trump, levelRank);
  if (!shape) {
    if (lead.kind === 'throw' && cards.length === lead.size) {
      const category = categoryOf(cards[0], trump, levelRank);
      if (cards.every((card) => categoryOf(card, trump, levelRank) === category)) {
        return {
          kind: 'throw',
          size: cards.length,
          pairNeed: countPairs(cards),
          tractorLengths: [],
          topPower: Math.max(...cards.map((card) => cardPower(card, trump, levelRank))),
          category,
          cards,
        };
      }
    }
    return null;
  }
  return shape;
}

export function trickPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + pointValue(card), 0);
}

export function validatePlay(state: GameState, seat: number, ids: string[]): PlayValidation {
  if (state.phase !== 'play') return { ok: false, error: 'bad-phase' };
  if (!isSeat(seat)) return { ok: false, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, error: 'wrong-turn' };
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'dup-card' };
  const hand = state.hands[safeSeat];
  const cards: Card[] = [];
  for (const id of ids) {
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, error: 'not-your-card' };
    cards.push(card);
  }
  if (cards.length === 0) return { ok: false, error: 'bad-count' };

  const trump = state.trump ?? 'NT';
  if (state.currentTrick.length === 0) {
    const shape = analyzeCards(cards, trump, state.levelRank);
    if (!shape) return { ok: false, error: 'bad-lead' };
    if (shape.kind === 'throw' && !throwIsLegal(state, safeSeat, cards)) {
      return { ok: false, error: 'illegal-throw', shape };
    }
    return { ok: true, shape };
  }

  const lead = analyzeCards(state.currentTrick[0].cards, trump, state.levelRank);
  if (!lead) return { ok: false, error: 'bad-lead' };
  if (cards.length !== lead.size) return { ok: false, error: 'bad-count', lead };
  const followCards = hand.filter(
    (card) => categoryOf(card, trump, state.levelRank) === lead.category,
  );
  if (followCards.length >= lead.size) {
    if (!cards.every((card) => categoryOf(card, trump, state.levelRank) === lead.category)) {
      return { ok: false, error: 'must-follow', lead };
    }
    if (lead.kind === 'pair') {
      if (countPairs(followCards) >= 1 && !isPair(cards)) {
        return { ok: false, error: 'shape-mismatch', lead };
      }
    } else if (lead.kind === 'tractor') {
      const hasTractor = tractorCandidates(followCards, trump, state.levelRank).some(
        (candidate) => candidate.length === lead.size,
      );
      if (hasTractor && !isTractor(cards, trump, state.levelRank)) {
        return { ok: false, error: 'shape-mismatch', lead };
      }
      if (!hasTractor && countPairs(followCards) >= lead.pairNeed && countPairs(cards) < lead.pairNeed) {
        return { ok: false, error: 'shape-mismatch', lead };
      }
    } else if (lead.kind === 'throw') {
      if (countPairs(followCards) >= lead.pairNeed && countPairs(cards) < lead.pairNeed) {
        return { ok: false, error: 'shape-mismatch', lead };
      }
    }
  } else {
    const selectedIds = new Set(ids);
    if (!followCards.every((card) => selectedIds.has(card.id))) {
      return { ok: false, error: 'must-follow', lead };
    }
  }
  return { ok: true, lead, shape: shapeForFollow(cards, lead, trump, state.levelRank) ?? undefined };
}

export function legalMoves(state: GameState, seat: number): Card[][] {
  if (state.phase !== 'play' || state.turn !== seat || !isSeat(seat)) return [];
  const safeSeat = seat as Seat;
  const trump = state.trump ?? 'NT';
  const hand = state.hands[safeSeat];
  const byId = new Map(hand.map((card) => [card.id, card]));
  const seen = new Set<string>();
  const output: Card[][] = [];
  const push = (ids: string[]) => {
    const key = ids.slice().sort().join('|');
    if (seen.has(key)) return;
    const validation = validatePlay(state, safeSeat, ids);
    if (!validation.ok) return;
    seen.add(key);
    output.push(ids.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card)));
  };

  if (state.currentTrick.length === 0) {
    for (const card of hand) push([card.id]);
    for (const pair of pairCandidates(hand)) push(pair);
    for (const tractor of tractorCandidates(hand, trump, state.levelRank)) push(tractor);
    for (const throwCards of legalThrows(state, safeSeat)) push(throwCards.map((card) => card.id));
    return output;
  }

  const lead = analyzeCards(state.currentTrick[0].cards, trump, state.levelRank);
  if (!lead) return [];
  const follow = hand.filter((card) => categoryOf(card, trump, state.levelRank) === lead.category);
  const others = hand.filter((card) => categoryOf(card, trump, state.levelRank) !== lead.category);
  const size = lead.size;

  if (follow.length >= size) {
    if (lead.kind === 'tractor') {
      const tractors = tractorCandidates(follow, trump, state.levelRank).filter(
        (candidate) => candidate.length === size,
      );
      for (const tractor of tractors) push(tractor);
    }
    if (lead.kind === 'pair') {
      for (const pair of pairCandidates(follow)) push(pair);
    }
    const sortedLow = follow.slice().sort((a, b) => cardPower(a, trump, state.levelRank) - cardPower(b, trump, state.levelRank));
    const sortedHigh = follow.slice().sort((a, b) => cardPower(b, trump, state.levelRank) - cardPower(a, trump, state.levelRank));
    const pairLow = pickPairs(follow, trump, state.levelRank, lead.pairNeed, 'low');
    const pairHigh = pickPairs(follow, trump, state.levelRank, lead.pairNeed, 'high');
    for (const base of [pairLow, pairHigh]) {
      const baseIds = new Set(base.map((card) => card.id));
      const restLow = sortedLow.filter((card) => !baseIds.has(card.id));
      const restHigh = sortedHigh.filter((card) => !baseIds.has(card.id));
      push([...base, ...restLow.slice(0, size - base.length)].map((card) => card.id));
      push([...base, ...restHigh.slice(0, size - base.length)].map((card) => card.id));
    }
    push(sortedLow.slice(0, size).map((card) => card.id));
    push(sortedHigh.slice(0, size).map((card) => card.id));
  } else {
    const base = follow.slice();
    const fillLow = others
      .slice()
      .sort((a, b) => cardPower(a, trump, state.levelRank) - cardPower(b, trump, state.levelRank));
    const fillHigh = others
      .slice()
      .sort((a, b) => cardPower(b, trump, state.levelRank) - cardPower(a, trump, state.levelRank));
    for (const filler of [fillLow, fillHigh]) {
      push([...base, ...filler.slice(0, size - base.length)].map((card) => card.id));
    }
    if (base.length === 0) {
      const trumpCards = hand.filter((card) => categoryOf(card, trump, state.levelRank) === 'T');
      const trumpLow = trumpCards.slice().sort((a, b) => cardPower(a, trump, state.levelRank) - cardPower(b, trump, state.levelRank));
      const trumpHigh = trumpCards.slice().sort((a, b) => cardPower(b, trump, state.levelRank) - cardPower(a, trump, state.levelRank));
      if (lead.kind === 'pair') {
        for (const pair of pairCandidates(trumpCards)) push(pair);
      } else if (lead.kind === 'tractor') {
        for (const tractor of tractorCandidates(trumpCards, trump, state.levelRank)) {
          if (tractor.length === size) push(tractor);
        }
      }
      const trumpPairs = pickPairs(trumpCards, trump, state.levelRank, lead.pairNeed, 'high');
      if (trumpPairs.length === size) push(trumpPairs.map((card) => card.id));
      push(trumpLow.slice(0, size).map((card) => card.id));
      push(trumpHigh.slice(0, size).map((card) => card.id));
    }
  }

  if (output.length === 0) {
    const fallback = follow.slice(0, size);
    if (fallback.length < size) {
      const fill = others.slice(0, size - fallback.length);
      fallback.push(...fill);
    }
    push(fallback.map((card) => card.id));
  }
  return output;
}

function pairCandidates(cards: Card[]): string[][] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.suit}:${card.rank}`;
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  const result: string[][] = [];
  for (const group of groups.values()) {
    if (group.length >= 2) result.push([group[0].id, group[1].id]);
  }
  return result;
}

function tractorCandidates(cards: Card[], trump: TrumpSuit, levelRank: NormalRank): string[][] {
  const result: string[][] = [];
  const suits: PlainSuit[] = [...SUITS];
  for (const suit of suits) {
    const groups = new Map<NormalRank, Card[]>();
    for (const card of cards) {
      if (card.suit !== suit) continue;
      if (isJoker(card) || isLevelCard(card, levelRank)) continue;
      if (!isNormalRank(card.rank)) continue;
      const list = groups.get(card.rank) ?? [];
      list.push(card);
      groups.set(card.rank, list);
    }
    const pairRanks = [...groups.entries()]
      .filter(([, group]) => group.length >= 2)
      .map(([rank]) => rank)
      .sort((a, b) => rankValue(a) - rankValue(b));
    let run: NormalRank[] = [];
    const flush = () => {
      if (run.length >= 2) {
        for (let start = 0; start < run.length; start += 1) {
          for (let end = start + 1; end < run.length; end += 1) {
            const rankSlice = run.slice(start, end + 1);
            const tractor = rankSlice.flatMap((rank) => (groups.get(rank) ?? []).slice(0, 2));
            if (isTractor(tractor, trump, levelRank)) result.push(tractor.map((card) => card.id));
          }
        }
      }
      run = [];
    };
    for (const rank of pairRanks) {
      if (run.length === 0 || rankValue(rank) === rankValue(run[run.length - 1]) + 1) run.push(rank);
      else {
        flush();
        run.push(rank);
      }
    }
    flush();
  }
  return result;
}

function pickPairs(
  cards: Card[],
  trump: TrumpSuit,
  levelRank: NormalRank,
  needed: number,
  mode: 'low' | 'high',
): Card[] {
  if (needed <= 0) return [];
  const pairs = pairCandidates(cards).map((ids) => {
    const found = ids.map((id) => cards.find((card) => card.id === id)).filter((card): card is Card => Boolean(card));
    return found;
  });
  pairs.sort((a, b) => {
    const pa = cardPower(a[0], trump, levelRank);
    const pb = cardPower(b[0], trump, levelRank);
    return mode === 'low' ? pa - pb : pb - pa;
  });
  const result: Card[] = [];
  const used = new Set<string>();
  for (const pair of pairs) {
    if (result.length >= needed * 2) break;
    if (pair.some((card) => used.has(card.id))) continue;
    result.push(...pair);
    for (const card of pair) used.add(card.id);
  }
  return result;
}

function isSeat(value: number): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function sortLevels(levels: [number, number]): [number, number] {
  return [
    Math.max(0, Math.min(12, Math.floor(levels[0]))),
    Math.max(0, Math.min(12, Math.floor(levels[1]))),
  ];
}

function dealHands(rng: Rng): { hands: Card[][]; bottom: Card[] } {
  const deck = shuffle(makeDeck(), rng);
  const hands = [0, 1, 2, 3].map((seat) =>
    sortHand(deck.slice(seat * 25, seat * 25 + 25), 'NT', '2'),
  );
  return { hands, bottom: deck.slice(100, 108) };
}

function baseDeal(
  levels: [number, number],
  dealer: Seat,
  rng: Rng,
  deal: number,
  results: DealResult[] = [],
): GameState {
  const { hands, bottom } = dealHands(rng);
  return {
    phase: 'declare',
    version: 0,
    deal,
    dealer,
    declareTurn: leftOf(dealer),
    declarationActions: 0,
    declarations: [],
    declaration: null,
    declarer: null,
    trump: null,
    levelRank: levelRankFor(levels[teamOf(dealer)]),
    levels: sortLevels(levels),
    hands,
    bottom,
    bottomTaken: false,
    buried: [],
    turn: -1,
    currentTrick: [],
    tricks: [],
    lastTrick: null,
    points: [0, 0],
    results: results.map((result) => ({ ...result, levelsBefore: [...result.levelsBefore] as [number, number], levelsAfter: [...result.levelsAfter] as [number, number] })),
    lastResult: results.length > 0 ? { ...results[results.length - 1] } : null,
    matchWinner: null,
  };
}

export function setup(options: SetupOptions): GameState {
  const dealer = options.dealer ?? 3;
  const levels = sortLevels(options.levels ?? [0, 0]);
  return baseDeal(levels, dealer, options.rng, 1);
}

export function declarationOptions(state: GameState, seat: number): BidOption[] {
  if (state.phase !== 'declare' || state.declareTurn !== seat || !isSeat(seat)) return [];
  const team = teamOf(seat);
  const rank = levelRankFor(state.levels[team]);
  const hand = state.hands[seat];
  const options: BidOption[] = [];
  for (const suit of SUITS) {
    const cards = hand.filter((card) => card.suit === suit && card.rank === rank);
    if (cards.length >= 1) {
      options.push({ kind: 'suit', suit, strength: 1, cards: [cards[0].id] });
    }
    if (cards.length >= 2) {
      options.push({ kind: 'suit', suit, strength: 2, cards: [cards[0].id, cards[1].id] });
    }
  }
  for (const rankKey of ['BJ', 'SJ'] as const) {
    const jokers = hand.filter((card) => card.rank === rankKey);
    if (jokers.length >= 2) {
      options.push({ kind: 'nt', suit: null, strength: 3, cards: [jokers[0].id, jokers[1].id] });
    }
  }
  return options;
}

export function declare(state: GameState, seat: number, option: BidOption): ActionResult {
  if (state.phase !== 'declare') return { ok: false, state, error: 'bad-phase' };
  if (!isSeat(seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.declareTurn !== seat) return { ok: false, state, error: 'wrong-turn' };
  const options = declarationOptions(state, seat);
  const wanted = new Set(option.cards);
  const match = options.find(
    (item) =>
      item.kind === option.kind &&
      item.suit === option.suit &&
      item.strength === option.strength &&
      item.cards.length === option.cards.length &&
      item.cards.every((id) => wanted.has(id)),
  );
  if (!match) return { ok: false, state, error: 'bad-bid' };
  if (state.declaration && match.strength <= state.declaration.strength) {
    return { ok: false, state, error: 'bid-too-low' };
  }
  const declaration: Declaration = {
    seat: seat as Seat,
    kind: match.kind,
    suit: match.suit,
    strength: match.strength,
    cards: match.cards.slice(),
  };
  const next: GameState = {
    ...state,
    version: state.version + 1,
    declaration,
    declarations: [...state.declarations, declaration],
    declarationActions: state.declarationActions + 1,
  };
  if (next.declarationActions >= 4) return { ok: true, state: finalizeDeclaration(next) };
  return { ok: true, state: { ...next, declareTurn: leftOf(seat) } };
}

export function passDeclaration(state: GameState, seat: number, rng: Rng = () => 0.5): ActionResult {
  if (state.phase !== 'declare') return { ok: false, state, error: 'bad-phase' };
  if (!isSeat(seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.declareTurn !== seat) return { ok: false, state, error: 'wrong-turn' };
  const next: GameState = {
    ...state,
    version: state.version + 1,
    declarationActions: state.declarationActions + 1,
  };
  if (next.declarationActions >= 4) {
    if (!next.declaration) {
      return {
        ok: true,
        state: baseDeal(next.levels, leftOf(next.dealer), rng, next.deal + 1, next.results),
      };
    }
    return { ok: true, state: finalizeDeclaration(next) };
  }
  return { ok: true, state: { ...next, declareTurn: leftOf(seat) } };
}

function finalizeDeclaration(state: GameState): GameState {
  const declaration = state.declaration;
  if (!declaration) return state;
  const declarer = declaration.seat;
  const team = teamOf(declarer);
  const trump: TrumpSuit = declaration.kind === 'nt' ? 'NT' : (declaration.suit as PlainSuit);
  const levelRank = levelRankFor(state.levels[team]);
  const hands = state.hands.map((hand) => hand.slice());
  hands[declarer] = sortHand([...hands[declarer], ...state.bottom], trump, levelRank);
  return {
    ...state,
    phase: 'bury',
    version: state.version + 1,
    declarer,
    trump,
    levelRank,
    hands,
    bottom: [],
    bottomTaken: true,
    turn: declarer,
    declareTurn: -1,
  };
}

export function bury(state: GameState, seat: number, ids: string[]): ActionResult {
  if (state.phase !== 'bury') return { ok: false, state, error: 'bad-phase' };
  if (!isSeat(seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.declarer !== seat) return { ok: false, state, error: 'not-declarer' };
  if (ids.length !== 8 || new Set(ids).size !== 8) return { ok: false, state, error: 'bad-bury' };
  const hand = state.hands[seat];
  const buried: Card[] = [];
  for (const id of ids) {
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, state, error: 'not-your-card' };
    buried.push(card);
  }
  const remaining = hand.filter((card) => !ids.includes(card.id));
  if (remaining.length !== 25) return { ok: false, state, error: 'bad-bury' };
  return {
    ok: true,
    state: {
      ...state,
      version: state.version + 1,
      phase: 'play',
      hands: state.hands.map((cards, index) => (index === seat ? remaining : cards.slice())),
      buried,
      turn: seat,
    },
  };
}

export function play(state: GameState, seat: number, ids: string[]): ActionResult {
  const validation = validatePlay(state, seat, ids);
  if (!validation.ok) return { ok: false, state, error: validation.error ?? 'no-play' };
  const safeSeat = seat as Seat;
  const cards = ids.map((id) => state.hands[safeSeat].find((card) => card.id === id)).filter((card): card is Card => Boolean(card));
  const hands = state.hands.map((hand, index) =>
    index === safeSeat ? hand.filter((card) => !ids.includes(card.id)) : hand.slice(),
  );
  const currentTrick: PlayedCard[] = [...state.currentTrick, { seat: safeSeat, cards }];
  if (currentTrick.length < 4) {
    return {
      ok: true,
      state: {
        ...state,
        version: state.version + 1,
        hands,
        currentTrick,
        turn: leftOf(safeSeat),
      },
    };
  }

  const trump = state.trump ?? 'NT';
  const winner = trickWinner(currentTrick, trump, state.levelRank);
  const trick: Trick = {
    leader: currentTrick[0].seat,
    plays: currentTrick,
    winner,
    points: trickPoints(cardsInTrick(currentTrick)),
  };
  const points: [number, number] = [state.points[0], state.points[1]];
  points[teamOf(winner)] += trick.points;
  const tricks = [...state.tricks, trick];
  const next: GameState = {
    ...state,
    version: state.version + 1,
    hands,
    currentTrick: [],
    tricks,
    lastTrick: trick,
    points,
    turn: winner,
  };
  if (tricks.length >= 25 || hands.every((hand) => hand.length === 0)) {
    return { ok: true, state: finishDeal(next) };
  }
  return { ok: true, state: next };
}

export function finishDeal(state: GameState): GameState {
  const declarer = state.declarer;
  if (declarer === null) return state;
  const declarerTeam = teamOf(declarer);
  const defenderTeam: Team = declarerTeam === 0 ? 1 : 0;
  const levelRank = state.levelRank;
  const declarerPoints = state.points[declarerTeam];
  const defenderPoints = state.points[defenderTeam];
  const buriedPoints = state.buried.reduce((sum, card) => sum + pointValue(card), 0);
  const availablePoints = Math.max(0, 100 - buriedPoints);
  const levelsBefore: [number, number] = [state.levels[0], state.levels[1]];
  const levelsAfter: [number, number] = [state.levels[0], state.levels[1]];
  let success = false;
  let upgradeTeam: Team = declarerTeam;
  let jump = 0;
  let reason: DealResult['reason'] = 'defenders';
  let matchWinner: Team | null = null;

  if (declarerPoints >= 80) {
    success = true;
    upgradeTeam = declarerTeam;
    jump = 1;
    reason = 'made';
    if (levelsBefore[declarerTeam] === 12) {
      matchWinner = declarerTeam;
    } else {
      levelsAfter[declarerTeam] = Math.min(12, levelsAfter[declarerTeam] + 1);
    }
  } else if (declarerPoints >= 40) {
    upgradeTeam = defenderTeam;
    jump = 0;
    reason = 'held';
  } else if (declarerPoints > 0) {
    upgradeTeam = defenderTeam;
    jump = 1;
    reason = 'defenders';
    levelsAfter[defenderTeam] = Math.min(12, levelsAfter[defenderTeam] + 1);
  } else {
    upgradeTeam = defenderTeam;
    jump = 3;
    reason = 'shutout';
    levelsAfter[defenderTeam] = Math.min(12, levelsAfter[defenderTeam] + 3);
  }

  const result: DealResult = {
    deal: state.deal,
    declarer,
    declarerTeam,
    trump: state.trump ?? 'NT',
    levelRank,
    levelsBefore,
    levelsAfter,
    declarerPoints,
    defenderPoints,
    availablePoints,
    buriedPoints,
    success,
    upgradeTeam,
    jump,
    matchWinner,
    reason,
  };
  return {
    ...state,
    phase: 'deal-over',
    version: state.version + 1,
    turn: -1,
    levels: levelsAfter,
    results: [...state.results, result],
    lastResult: result,
    matchWinner,
  };
}

export function nextDeal(state: GameState, rng: Rng): ActionResult {
  if (state.phase !== 'deal-over') return { ok: false, state, error: 'bad-phase' };
  if (state.matchWinner !== null) return { ok: false, state, error: 'match-over' };
  const next = baseDeal(
    state.levels,
    leftOf(state.dealer),
    rng,
    state.deal + 1,
    state.results,
  );
  return { ok: true, state: next };
}

export function pointsInPlay(state: GameState): number {
  return Math.max(
    0,
    100 - state.buried.reduce((sum, card) => sum + pointValue(card), 0),
  );
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = isSeat(seat) ? seat : 0;
  const team = teamOf(safeSeat);
  const trumpForSort: TrumpSuit =
    state.trump ?? (state.declaration?.kind === 'nt' ? 'NT' : state.declaration?.suit ?? 'NT');
  const sortRank = state.trump ? state.levelRank : levelRankFor(state.levels[team]);
  const canDeclare = state.phase === 'declare' && state.declareTurn === safeSeat;
  const canBury = state.phase === 'bury' && state.declarer === safeSeat;
  const canPlay = state.phase === 'play' && state.turn === safeSeat;
  const legalCards = canPlay
    ? [...new Set(legalMoves(state, safeSeat).flatMap((cards) => cards.map((card) => card.id)))]
    : [];
  const lastResult = state.lastResult;
  return {
    seat: safeSeat,
    team,
    partner: partnerOf(safeSeat),
    names: names.slice(0, 4),
    phase: state.phase,
    version: state.version,
    deal: state.deal,
    dealer: state.dealer,
    currentTurn: state.turn,
    declareTurn: state.declareTurn,
    trump: state.trump,
    levelRank: state.levelRank,
    levels: [state.levels[0], state.levels[1]],
    declarer: state.declarer,
    declarerTeam: state.declarer === null ? null : teamOf(state.declarer),
    hand: sortHand(state.hands[safeSeat], trumpForSort, sortRank),
    handCounts: state.hands.map((hand) => hand.length),
    bottomTaken: state.bottomTaken,
    buriedCount: state.buried.length,
    buried:
      state.phase === 'deal-over' || state.declarer === safeSeat
        ? state.buried.map((card) => ({ ...card }))
        : null,
    canDeclare,
    canBury,
    canPlay,
    declarationOptions: canDeclare ? declarationOptions(state, safeSeat) : [],
    declaration: state.declaration ? { ...state.declaration, cards: state.declaration.cards.slice() } : null,
    declarations: state.declarations.map((item) => ({ ...item, cards: item.cards.slice() })),
    currentTrick: state.currentTrick.map((play) => ({
      seat: play.seat,
      cards: play.cards.map((card) => ({ ...card })),
    })),
    lastTrick: state.lastTrick
      ? {
          ...state.lastTrick,
          plays: state.lastTrick.plays.map((play) => ({
            seat: play.seat,
            cards: play.cards.map((card) => ({ ...card })),
          })),
        }
      : null,
    trickCount: state.tricks.length,
    points: [state.points[0], state.points[1]],
    pointsAvailable: state.phase === 'deal-over' ? pointsInPlay(state) : null,
    legalCards,
    lastResult,
    results: state.results.map((result) => ({
      ...result,
      levelsBefore: [...result.levelsBefore] as [number, number],
      levelsAfter: [...result.levelsAfter] as [number, number],
    })),
    matchWinner: state.matchWinner,
  };
}

export function isAiSeat(state: GameState, seat: number): boolean {
  return isAiTurn(state, seat);
}

export function isAiTurn(state: GameState, seat: number): boolean {
  if (state.phase === 'declare') return state.declareTurn === seat;
  if (state.phase === 'bury') return state.declarer === seat;
  if (state.phase === 'play') return state.turn === seat;
  return false;
}

export function describeShape(shape: LeadShape): string {
  if (shape.kind === 'single') return 'single';
  if (shape.kind === 'pair') return 'pair';
  if (shape.kind === 'tractor') return `tractor-${shape.size}`;
  return `throw-${shape.size}`;
}
