/**
 * President (Scum) — a pure, deterministic engine for 3–6 players.
 *
 * Rules implemented:
 * - one standard 52-card deck, dealt as evenly as possible;
 * - rank order 3 low … Ace, 2 highest; suits never compare;
 * - the holder of the 3 of clubs opens round one and must include it;
 * - a trick is a single, pair or triple; followers must match the count
 *   and play an equal-or-higher rank; passing is always allowed;
 * - a player who passes sits out until the trick is cleared;
 * - when everyone else passes, the last player to play leads the next trick;
 * - first out is President, last left is Scum, the finish order sets roles;
 * - from round two the President leads, and the Scum/President (plus
 *   Vice-Scum/Vice President at 5–6 players) exchange cards.
 *
 * No DOM, network, clock or ambient randomness. Dealing uses the injected
 * RNG. All public state is in `GameState`; `view()` exposes only one
 * player's hand, which is what LAN sends to each guest.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}

export type Phase = 'playing' | 'exchange' | 'round-over';
export type Role = 'president' | 'vice' | 'citizen' | 'vice-scum' | 'scum';
export type Rng = () => number;

export interface Trick {
  seat: number;
  rank: number;
  count: number;
  cards: Card[];
}

export interface LastAction {
  seat: number;
  kind: 'play' | 'pass';
  rank?: number;
  count?: number;
}

export interface ExchangeSummary {
  president: number;
  scum: number;
  count: number;
  vice: number | null;
  viceScum: number | null;
  viceCount: number;
}

export interface GameState {
  hands: Card[][];
  playerCount: number;
  turn: number;
  trick: Trick | null;
  passed: boolean[];
  finish: number[];
  /** Finish order of the most recently completed round (roles for the next). */
  order: number[] | null;
  phase: Phase;
  round: number;
  starter: number;
  exchangeEnabled: boolean;
  exchange: ExchangeSummary | null;
  actions: number;
  last: LastAction | null;
  discard: Card[];
  mustLeadClubs: boolean;
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
  | 'too-many'
  | 'mixed-rank'
  | 'count-mismatch'
  | 'too-low'
  | 'must-lead-clubs'
  | 'cannot-pass'
  | 'no-trick';

export type PlayerAction =
  | { type: 'play'; cards: string[] }
  | { type: 'pass' };

export interface SeatView {
  seat: number;
  hand: Card[];
  handCounts: number[];
  names: string[];
  playerCount: number;
  turn: number;
  phase: Phase;
  trick: Trick | null;
  passed: boolean[];
  finish: number[];
  order: number[] | null;
  roles: (Role | null)[];
  round: number;
  starter: number;
  exchangeEnabled: boolean;
  exchange: ExchangeSummary | null;
  actions: number;
  last: LastAction | null;
  discard: Card[];
  mustLeadClubs: boolean;
  canPlay: boolean;
  canPass: boolean;
  isTurn: boolean;
  finished: boolean;
}

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const PLAYER_COUNTS: readonly number[] = [3, 4, 5, 6];

const SUIT_ORDER: Record<Suit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

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
  return suit === 'clubs' ? '♣' : suit === 'diamonds' ? '♦' : suit === 'hearts' ? '♥' : '♠';
}

export function suitName(suit: Suit): string {
  return suit;
}

function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${suit[0].toUpperCase()}${rank}`, rank, suit });
    }
  }
  return cards;
}

export const DECK: readonly Card[] = makeDeck();

function compareCard(a: Card, b: Card): number {
  return a.rank - b.rank || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

export function sortHand(cards: readonly Card[]): Card[] {
  return cards.slice().sort(compareCard);
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

function deal(playerCount: number, rng: Rng): Card[][] {
  const deck = shuffle([...DECK], rng);
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, index) => {
    hands[index % playerCount].push(card);
  });
  return hands.map(sortHand);
}

function emptyPassed(playerCount: number): boolean[] {
  return Array.from({ length: playerCount }, () => false);
}

function activeSeats(state: GameState): number[] {
  return state.hands
    .map((hand, seat) => ({ hand, seat }))
    .filter(({ hand, seat }) => hand.length > 0 && !state.finish.includes(seat))
    .map(({ seat }) => seat);
}

function nextActive(state: GameState, from: number): number {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (from + step) % state.playerCount;
    if (state.hands[seat].length > 0 && !state.finish.includes(seat)) return seat;
  }
  return -1;
}

function nextEligible(state: GameState, from: number): number {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (from + step) % state.playerCount;
    if (state.hands[seat].length === 0 || state.finish.includes(seat)) continue;
    if (state.trick && state.passed[seat]) continue;
    return seat;
  }
  return -1;
}

function clearTrick(state: GameState, leader: number): GameState {
  return {
    ...state,
    trick: null,
    passed: emptyPassed(state.playerCount),
    turn: leader,
    mustLeadClubs: false,
  };
}

export function setup(
  playerCount: number,
  rng: Rng,
  exchangeEnabled = true,
): GameState {
  const count = PLAYER_COUNTS.includes(playerCount) ? playerCount : 4;
  const hands = deal(count, rng);
  const starter = hands.findIndex((hand) => hand.some((card) => card.id === 'C3'));
  return {
    hands,
    playerCount: count,
    turn: starter < 0 ? 0 : starter,
    trick: null,
    passed: emptyPassed(count),
    finish: [],
    order: null,
    phase: 'playing',
    round: 1,
    starter: starter < 0 ? 0 : starter,
    exchangeEnabled,
    exchange: null,
    actions: 0,
    last: null,
    discard: [],
    mustLeadClubs: starter >= 0,
  };
}

function removeCards(hand: Card[], ids: Set<string>): Card[] {
  return hand.filter((card) => !ids.has(card.id));
}

function takeHighest(hand: Card[], count: number): Card[] {
  return hand.slice().sort((a, b) => compareCard(b, a)).slice(0, count);
}

function takeLowest(hand: Card[], count: number): Card[] {
  return hand.slice().sort(compareCard).slice(0, count);
}

export function performExchange(
  hands: Card[][],
  order: number[],
  playerCount: number,
): ExchangeSummary {
  const president = order[0];
  const scum = order[playerCount - 1];
  const count = 2;
  const fromScum = takeHighest(hands[scum], count);
  const scumIds = new Set(fromScum.map((card) => card.id));
  hands[scum] = removeCards(hands[scum], scumIds);
  hands[president] = sortHand([...hands[president], ...fromScum]);

  const fromPresident = takeLowest(hands[president], count);
  const presidentIds = new Set(fromPresident.map((card) => card.id));
  hands[president] = removeCards(hands[president], presidentIds);
  hands[scum] = sortHand([...hands[scum], ...fromPresident]);

  let vice: number | null = null;
  let viceScum: number | null = null;
  let viceCount = 0;

  if (playerCount >= 5) {
    vice = order[1];
    viceScum = order[playerCount - 2];
    viceCount = 1;
    const fromViceScum = takeHighest(hands[viceScum], 1);
    const viceScumIds = new Set(fromViceScum.map((card) => card.id));
    hands[viceScum] = removeCards(hands[viceScum], viceScumIds);
    hands[vice] = sortHand([...hands[vice], ...fromViceScum]);

    const fromVice = takeLowest(hands[vice], 1);
    const viceIds = new Set(fromVice.map((card) => card.id));
    hands[vice] = removeCards(hands[vice], viceIds);
    hands[viceScum] = sortHand([...hands[viceScum], ...fromVice]);
  }

  return { president, scum, count, vice, viceScum, viceCount };
}

/** Deal the next round. The previous finish order supplies the roles. */
export function nextRound(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'round-over' || !state.order || state.order.length !== state.playerCount) {
    return state;
  }
  const hands = deal(state.playerCount, rng);
  const order = state.order.slice();
  const exchange = state.exchangeEnabled
    ? performExchange(hands, order, state.playerCount)
    : null;
  return {
    ...state,
    hands,
    turn: order[0],
    trick: null,
    passed: emptyPassed(state.playerCount),
    finish: [],
    order,
    phase: exchange ? 'exchange' : 'playing',
    round: state.round + 1,
    starter: order[0],
    exchange,
    actions: state.actions + 1,
    last: null,
    discard: [],
    mustLeadClubs: false,
  };
}

/** Leave the exchange screen and begin the first trick. */
export function beginRound(state: GameState): GameState {
  if (state.phase !== 'exchange') return state;
  return {
    ...state,
    phase: 'playing',
    turn: state.starter,
    trick: null,
    passed: emptyPassed(state.playerCount),
    last: null,
    actions: state.actions + 1,
    mustLeadClubs: false,
  };
}

export function groupByRank(hand: readonly Card[]): { rank: number; cards: Card[] }[] {
  const groups = new Map<number, Card[]>();
  for (const card of hand) {
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  return [...groups.entries()]
    .map(([rank, cards]) => ({ rank, cards: sortHand(cards) }))
    .sort((a, b) => a.rank - b.rank);
}

export interface PlayCheck {
  ok: boolean;
  error?: MoveError;
  cards: Card[];
}

export function checkPlay(state: GameState, seat: number, cardIds: readonly string[]): PlayCheck {
  if (state.phase !== 'playing') return { ok: false, error: 'phase', cards: [] };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.playerCount) {
    return { ok: false, error: 'wrong-turn', cards: [] };
  }
  if (state.turn !== seat) return { ok: false, error: 'wrong-turn', cards: [] };
  if (state.finish.includes(seat) || state.hands[seat].length === 0) {
    return { ok: false, error: 'finished', cards: [] };
  }
  if (state.trick && state.passed[seat]) return { ok: false, error: 'already-passed', cards: [] };
  if (cardIds.length === 0) return { ok: false, error: 'empty', cards: [] };
  if (cardIds.length > 3) return { ok: false, error: 'too-many', cards: [] };

  const hand = state.hands[seat];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) return { ok: false, error: 'not-your-card', cards: [] };
    seen.add(id);
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, error: 'not-your-card', cards: [] };
    cards.push(card);
  }
  if (cards.some((card) => card.rank !== cards[0].rank)) {
    return { ok: false, error: 'mixed-rank', cards: [] };
  }
  if (state.trick) {
    if (cards.length !== state.trick.count) {
      return { ok: false, error: 'count-mismatch', cards: [] };
    }
    if (cards[0].rank < state.trick.rank) return { ok: false, error: 'too-low', cards: [] };
  } else if (state.mustLeadClubs && !cards.some((card) => card.id === 'C3')) {
    return { ok: false, error: 'must-lead-clubs', cards: [] };
  }

  return { ok: true, cards };
}

export function legalPlays(state: GameState, seat: number): Card[][] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return [];
  if (state.trick && state.passed[seat]) return [];
  const groups = groupByRank(state.hands[seat]);
  const plays: Card[][] = [];

  if (!state.trick) {
    for (const group of groups) {
      if (state.mustLeadClubs && (group.rank !== 3 || !group.cards.some((card) => card.id === 'C3'))) {
        continue;
      }
      const max = Math.min(3, group.cards.length);
      for (let count = 1; count <= max; count += 1) plays.push(group.cards.slice(0, count));
    }
  } else {
    for (const group of groups) {
      if (group.rank < state.trick.rank) continue;
      if (group.cards.length < state.trick.count) continue;
      plays.push(group.cards.slice(0, state.trick.count));
    }
  }

  return plays.sort((a, b) => a[0].rank - b[0].rank || a.length - b.length);
}

export function play(state: GameState, seat: number, cardIds: readonly string[]): MoveResult {
  const check = checkPlay(state, seat, cardIds);
  if (!check.ok) return { ok: false, state, error: check.error };
  const cards = check.cards;
  const ids = new Set(cards.map((card) => card.id));
  const hands = state.hands.map((hand, index) =>
    index === seat ? removeCards(hand, ids) : hand,
  );

  const finish =
    hands[seat].length === 0 && !state.finish.includes(seat)
      ? [...state.finish, seat]
      : state.finish.slice();
  const playedTrick: Trick = {
    seat,
    rank: cards[0].rank,
    count: cards.length,
    cards: cards.slice(),
  };
  const base: GameState = {
    ...state,
    hands,
    trick: playedTrick,
    finish,
    passed: state.passed.slice(),
    actions: state.actions + 1,
    last: { seat, kind: 'play', rank: playedTrick.rank, count: playedTrick.count },
    discard: [...state.discard, ...cards],
    mustLeadClubs: false,
  };
  base.passed[seat] = false;

  if (finish.length >= state.playerCount - 1) {
    const remaining = hands.findIndex(
      (hand, index) => hand.length > 0 && !finish.includes(index),
    );
    const complete = remaining >= 0 ? [...finish, remaining] : finish.slice();
    // Keep every seat exactly once, in finish order.
    const order = complete.filter((item, index) => complete.indexOf(item) === index);
    return {
      ok: true,
      state: {
        ...base,
        finish: order,
        order,
        phase: 'round-over',
        turn: remaining >= 0 ? remaining : seat,
        passed: emptyPassed(state.playerCount),
      },
    };
  }

  const candidate = nextEligible(base, seat);
  if (candidate < 0) {
    const leader = nextActive(base, seat);
    return { ok: true, state: clearTrick(base, leader >= 0 ? leader : seat) };
  }
  if (candidate === playedTrick.seat) {
    return { ok: true, state: clearTrick(base, playedTrick.seat) };
  }
  return { ok: true, state: { ...base, turn: candidate } };
}

export function pass(state: GameState, seat: number): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
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
  const active = activeSeats(base);
  const need = active.filter((item) => item !== state.trick!.seat);
  const reset = need.every((item) => passed[item]);

  if (reset) {
    const trickSeat = state.trick.seat;
    const leader = active.includes(trickSeat) ? trickSeat : nextActive(base, trickSeat);
    return { ok: true, state: clearTrick(base, leader >= 0 ? leader : seat) };
  }

  const candidate = nextEligible(base, seat);
  if (candidate < 0) {
    const leader = active.includes(state.trick.seat)
      ? state.trick.seat
      : nextActive(base, state.trick.seat);
    return { ok: true, state: clearTrick(base, leader >= 0 ? leader : seat) };
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

export function rolesFor(order: number[] | null, playerCount: number): (Role | null)[] {
  const roles: (Role | null)[] = Array.from({ length: playerCount }, () => null);
  if (!order || order.length !== playerCount) return roles;
  order.forEach((seat, index) => {
    if (seat < 0 || seat >= playerCount || roles[seat] !== null) return;
    if (index === 0) roles[seat] = 'president';
    else if (index === playerCount - 1) roles[seat] = 'scum';
    else if (playerCount === 3) roles[seat] = 'citizen';
    else if (index === 1) roles[seat] = 'vice';
    else if (index === playerCount - 2) roles[seat] = 'vice-scum';
    else roles[seat] = 'citizen';
  });
  return roles;
}

export function roleFor(state: GameState, seat: number): Role | null {
  return rolesFor(state.order, state.playerCount)[seat] ?? null;
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.playerCount ? seat : 0;
  const finished = state.finish.includes(safeSeat);
  const canPlay =
    state.phase === 'playing' &&
    state.turn === safeSeat &&
    !finished &&
    state.hands[safeSeat].length > 0 &&
    !(state.trick !== null && state.passed[safeSeat]);
  return {
    seat: safeSeat,
    hand: sortHand(state.hands[safeSeat] ?? []),
    handCounts: state.hands.map((hand) => hand.length),
    names: names.slice(0, state.playerCount),
    playerCount: state.playerCount,
    turn: state.turn,
    phase: state.phase,
    trick: state.trick
      ? { ...state.trick, cards: state.trick.cards.slice() }
      : null,
    passed: state.passed.slice(),
    finish: state.finish.slice(),
    order: state.order ? state.order.slice() : null,
    roles: rolesFor(state.order, state.playerCount),
    round: state.round,
    starter: state.starter,
    exchangeEnabled: state.exchangeEnabled,
    exchange: state.exchange ? { ...state.exchange } : null,
    actions: state.actions,
    last: state.last ? { ...state.last } : null,
    discard: state.discard.slice(),
    mustLeadClubs:
      state.phase === 'playing' &&
      state.mustLeadClubs &&
      state.trick === null &&
      state.turn === safeSeat,
    canPlay,
    canPass: canPlay && state.trick !== null,
    isTurn: state.phase === 'playing' && state.turn === safeSeat,
    finished,
  };
}

export function presidentOf(state: GameState): number | null {
  return state.order && state.order.length > 0 ? state.order[0] : null;
}

export function scumOf(state: GameState): number | null {
  return state.order && state.order.length === state.playerCount
    ? state.order[state.playerCount - 1]
    : null;
}

export function trickLabel(rank: number, count: number): string {
  return `${count}-${rankLabel(rank)}`;
}
