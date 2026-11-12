/**
 * Dou Dizhu · pure three-player engine.
 *
 * No DOM, network, clock or Math.random. Every deal/redeal takes an injected RNG.
 *
 * Seats 0, 1 and 2. One landlord against two farmers. The landlord owns the three
 * bottom cards and the opening lead. A farmer side wins as soon as either farmer
 * empties their hand.
 */

export type Rng = () => number;
export type Seat = 0 | 1 | 2;
export type Suit = 'S' | 'H' | 'C' | 'D' | 'J';
export type Phase = 'bidding' | 'playing' | 'over';

export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}

export type ComboKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple-single'
  | 'triple-pair'
  | 'straight'
  | 'pairs'
  | 'airplane'
  | 'airplane-single'
  | 'airplane-pair'
  | 'four-two'
  | 'four-two-pairs'
  | 'bomb'
  | 'rocket';

export interface Combo {
  kind: ComboKind;
  /** Primary rank: the high card of a run, or the triple/four rank. */
  rank: number;
  /** Number of cards in the combination. Same-length chains only compare. */
  size: number;
  cards: string[];
}

export interface Play {
  seat: Seat;
  combo: Combo;
  cards: Card[];
}

export interface RoundResult {
  winnerSide: 'landlord' | 'farmers';
  winnerSeat: Seat;
  landlord: Seat;
  base: number;
  bombs: number;
  spring: boolean;
  multiplier: number;
  bombMultiplier: number;
  stake: number;
  landlordPoints: number;
  farmerPoints: number;
  plays: number[];
}

export interface GameState {
  phase: Phase;
  deal: number;
  firstBidder: Seat;
  turn: number;
  hands: Card[][];
  bottom: Card[];
  bids: (number | null)[];
  highestBid: number;
  highestBidder: number;
  landlord: number;
  lastPlay: Play | null;
  lastPlayer: number;
  passes: number;
  plays: number[];
  bombs: number;
  result: RoundResult | null;
}

export type MoveError =
  | 'bad-phase'
  | 'bad-seat'
  | 'wrong-turn'
  | 'bad-bid'
  | 'bid-too-low'
  | 'bad-cards'
  | 'not-your-card'
  | 'bad-combo'
  | 'does-not-beat'
  | 'must-play'
  | 'game-over';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SetupOptions {
  rng: Rng;
  firstBidder?: Seat;
}

export interface SeatView {
  seat: Seat;
  phase: Phase;
  deal: number;
  turn: number;
  hand: Card[];
  bottom: Card[];
  bottomRevealed: boolean;
  bids: (number | null)[];
  highestBid: number;
  highestBidder: number;
  landlord: number;
  lastPlay: Play | null;
  lastPlayer: number;
  passes: number;
  plays: number[];
  handCounts: number[];
  bombs: number;
  multiplier: number;
  result: RoundResult | null;
  canBid: boolean;
  canPlay: boolean;
  canPass: boolean;
  isLandlord: boolean;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];
export const MIN_RANK = 3;
export const MAX_RANK = 17;
export const SMALL_JOKER = 16;
export const BIG_JOKER = 17;

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3, J: 4 };

export function nextSeat(seat: number): Seat {
  return (((seat + 1) % 3) as Seat);
}

export function asSeat(value: number): Seat | null {
  return value === 0 || value === 1 || value === 2 ? (value as Seat) : null;
}

export function partnerOf(state: GameState, seat: number): number {
  if (state.landlord < 0 || seat === state.landlord) return -1;
  return [0, 1, 2].find((item) => item !== seat && item !== state.landlord) ?? -1;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = MIN_RANK; rank <= 15; rank += 1) {
    for (const suit of SUITS) {
      deck.push({ id: `${rank}${suit}`, rank, suit });
    }
  }
  deck.push({ id: 'SJ', rank: SMALL_JOKER, suit: 'J' });
  deck.push({ id: 'BJ', rank: BIG_JOKER, suit: 'J' });
  return deck;
}

export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const pick = Math.max(0, Math.min(index, raw));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

function deal(rng: Rng): { hands: Card[][]; bottom: Card[] } {
  const deck = shuffle(makeDeck(), rng);
  const hands = [0, 1, 2].map((seat) => sortHand(deck.slice(seat * 17, seat * 17 + 17)));
  return { hands, bottom: sortHand(deck.slice(51, 54)) };
}

function newDeal(rng: Rng, firstBidder: Seat, dealNumber: number): GameState {
  const { hands, bottom } = deal(rng);
  return {
    phase: 'bidding',
    deal: dealNumber,
    firstBidder,
    turn: firstBidder,
    hands,
    bottom,
    bids: [null, null, null],
    highestBid: 0,
    highestBidder: -1,
    landlord: -1,
    lastPlay: null,
    lastPlayer: -1,
    passes: 0,
    plays: [0, 0, 0],
    bombs: 0,
    result: null,
  };
}

export function setup(options: SetupOptions): GameState {
  const firstBidder = options.firstBidder ?? 0;
  return newDeal(options.rng, firstBidder, 1);
}

function countsOf(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

function consecutive(values: number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) return false;
  }
  return true;
}

function airplane(
  cards: Card[],
  counts: Map<number, number>,
  triples: number,
  wingKind: 'bare' | 'single' | 'pair',
): Combo | null {
  if (triples < 2) return null;
  for (let start = 3; start + triples - 1 <= 14; start += 1) {
    let valid = true;
    for (let rank = start; rank < start + triples; rank += 1) {
      if ((counts.get(rank) ?? 0) < 3) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const rest = new Map(counts);
    for (let rank = start; rank < start + triples; rank += 1) {
      rest.set(rank, (rest.get(rank) ?? 0) - 3);
    }
    const restRanks = [...rest.keys()].filter((rank) => (rest.get(rank) ?? 0) > 0);
    if (wingKind === 'single') {
      const restCount = restRanks.reduce((sum, rank) => sum + (rest.get(rank) ?? 0), 0);
      const hasTripleWing = restRanks.some((rank) => (rest.get(rank) ?? 0) >= 3);
      if (restCount === triples && !hasTripleWing) {
        return {
          kind: 'airplane-single',
          rank: start + triples - 1,
          size: cards.length,
          cards: cards.map((card) => card.id),
        };
      }
    } else if (wingKind === 'pair') {
      if (
        restRanks.length === triples &&
        restRanks.every((rank) => rest.get(rank) === 2)
      ) {
        return {
          kind: 'airplane-pair',
          rank: start + triples - 1,
          size: cards.length,
          cards: cards.map((card) => card.id),
        };
      }
    } else {
      // Bare airplane: every rank is a triple in one consecutive run.
      const values = [...counts.entries()]
        .filter(([, count]) => count > 0)
        .map(([rank]) => rank)
        .sort((a, b) => a - b);
      if (
        values.length === triples &&
        values.every((rank) => counts.get(rank) === 3) &&
        values[0] >= 3 &&
        values[values.length - 1] <= 14 &&
        consecutive(values)
      ) {
        return {
          kind: 'airplane',
          rank: values[values.length - 1],
          size: cards.length,
          cards: cards.map((card) => card.id),
        };
      }
    }
  }
  return null;
}

/**
 * Detect a legal combination. Returns null for anything else.
 *
 * Table choices (also documented in docs/rules.md):
 * - Chains use ranks 3–A only; 2 and jokers never extend a chain.
 * - Four-with-two may carry a pair as two singles. Both jokers may be the two
 *   singles. Wings may not contain a card that would extend a different chain.
 * - Airplane single wings are any n spare cards; pair wings are n spare pairs.
 */
export function detectCombo(cards: Card[]): Combo | null {
  if (cards.length === 0) return null;
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return null;
  const counts = countsOf(cards);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const size = cards.length;
  const idList = cards.map((card) => card.id);

  if (size === 1) return { kind: 'single', rank: ranks[0], size, cards: idList };
  if (size === 2) {
    if (ranks.length === 2 && ranks[0] === SMALL_JOKER && ranks[1] === BIG_JOKER) {
      return { kind: 'rocket', rank: BIG_JOKER, size, cards: idList };
    }
    if (ranks.length === 1 && counts.get(ranks[0]) === 2) {
      return { kind: 'pair', rank: ranks[0], size, cards: idList };
    }
    return null;
  }
  if (size === 3) {
    if (ranks.length === 1 && counts.get(ranks[0]) === 3) {
      return { kind: 'triple', rank: ranks[0], size, cards: idList };
    }
    return null;
  }
  if (size === 4) {
    if (ranks.length === 1 && counts.get(ranks[0]) === 4) {
      return { kind: 'bomb', rank: ranks[0], size, cards: idList };
    }
    const triple = ranks.find((rank) => counts.get(rank) === 3);
    if (triple !== undefined && ranks.length === 2) {
      return { kind: 'triple-single', rank: triple, size, cards: idList };
    }
    return null;
  }

  // Triple + pair.
  if (size === 5) {
    const triple = ranks.find((rank) => counts.get(rank) === 3);
    if (triple !== undefined && ranks.length === 2 && counts.get(ranks.find((rank) => rank !== triple) ?? -1) === 2) {
      return { kind: 'triple-pair', rank: triple, size, cards: idList };
    }
  }

  // Straights.
  if (
    size >= 5 &&
    ranks.every((rank) => counts.get(rank) === 1) &&
    ranks[ranks.length - 1] <= 14 &&
    consecutive(ranks)
  ) {
    return { kind: 'straight', rank: ranks[ranks.length - 1], size, cards: idList };
  }

  // Consecutive pairs.
  if (
    size >= 6 &&
    size % 2 === 0 &&
    ranks.every((rank) => counts.get(rank) === 2) &&
    ranks.length >= 3 &&
    ranks[ranks.length - 1] <= 14 &&
    consecutive(ranks)
  ) {
    return { kind: 'pairs', rank: ranks[ranks.length - 1], size, cards: idList };
  }

  // Four with two singles.
  if (size === 6) {
    const quad = ranks.find((rank) => counts.get(rank) === 4);
    if (quad !== undefined) {
      const rest = ranks.filter((rank) => rank !== quad);
      const restCount = rest.reduce((sum, rank) => sum + (counts.get(rank) ?? 0), 0);
      if (restCount === 2) {
        return { kind: 'four-two', rank: quad, size, cards: idList };
      }
    }
  }

  // Four with two pairs.
  if (size === 8) {
    const quad = ranks.find((rank) => counts.get(rank) === 4);
    if (quad !== undefined) {
      const rest = ranks.filter((rank) => rank !== quad);
      if (rest.length === 2 && rest.every((rank) => counts.get(rank) === 2)) {
        return { kind: 'four-two-pairs', rank: quad, size, cards: idList };
      }
    }
  }

  // Bare airplane.
  if (size >= 6 && size % 3 === 0) {
    const found = airplane(cards, counts, size / 3, 'bare');
    if (found) return found;
  }

  // Airplane with single wings.
  if (size >= 8 && size % 4 === 0) {
    const found = airplane(cards, counts, size / 4, 'single');
    if (found) return found;
  }

  // Airplane with pair wings.
  if (size >= 10 && size % 5 === 0) {
    const found = airplane(cards, counts, size / 5, 'pair');
    if (found) return found;
  }

  return null;
}

export function beats(next: Combo, previous: Combo | null): boolean {
  if (!previous) return true;
  if (next.kind === 'rocket') return previous.kind !== 'rocket';
  if (previous.kind === 'rocket') return false;
  if (next.kind === 'bomb') {
    return previous.kind !== 'bomb' || next.rank > previous.rank;
  }
  if (previous.kind === 'bomb') return false;
  return next.kind === previous.kind && next.size === previous.size && next.rank > previous.rank;
}

export function validatePlay(
  state: GameState,
  seat: number,
  cards: Card[],
): { ok: boolean; combo?: Combo; error?: MoveError } {
  if (state.phase !== 'playing') return { ok: false, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, error: 'wrong-turn' };
  if (cards.length === 0) return { ok: false, error: 'bad-cards' };
  const hand = state.hands[seat] ?? [];
  const ids = new Set(hand.map((card) => card.id));
  if (cards.some((card) => !ids.has(card.id))) return { ok: false, error: 'not-your-card' };
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    return { ok: false, error: 'bad-cards' };
  }
  const combo = detectCombo(cards);
  if (!combo) return { ok: false, error: 'bad-combo' };
  if (state.lastPlay && !beats(combo, state.lastPlay.combo)) {
    return { ok: false, error: 'does-not-beat' };
  }
  return { ok: true, combo };
}

export function bid(state: GameState, seat: number, value: number, rng: Rng): ActionResult {
  if (state.phase !== 'bidding') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    return { ok: false, state, error: 'bad-bid' };
  }
  if (value !== 0 && value <= state.highestBid) {
    return { ok: false, state, error: 'bid-too-low' };
  }

  const bids = state.bids.slice();
  bids[seat] = value;
  const highestBid = Math.max(state.highestBid, value);
  const highestBidder = value > state.highestBid ? seat : state.highestBidder;
  const acted = bids.filter((item) => item !== null).length;
  const base: GameState = {
    ...state,
    bids,
    highestBid,
    highestBidder,
  };

  if (value === 3 || acted === 3) {
    if (highestBid === 0) {
      // All pass: redeal to the next first bidder.
      return {
        ok: true,
        state: newDeal(rng, nextSeat(state.firstBidder), state.deal + 1),
      };
    }
    return { ok: true, state: startPlaying(base, highestBidder as Seat) };
  }

  return {
    ok: true,
    state: { ...base, turn: nextSeat(seat) },
  };
}

function startPlaying(state: GameState, landlord: Seat): GameState {
  const hands = state.hands.map((hand) => hand.slice());
  hands[landlord] = sortHand([...hands[landlord], ...state.bottom]);
  return {
    ...state,
    phase: 'playing',
    landlord,
    hands,
    turn: landlord,
    lastPlay: null,
    lastPlayer: -1,
    passes: 0,
    plays: [0, 0, 0],
    bombs: 0,
    result: null,
  };
}

export function play(state: GameState, seat: number, cards: Card[]): ActionResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  const check = validatePlay(state, seat, cards);
  if (!check.ok || !check.combo) {
    return { ok: false, state, error: check.error ?? 'bad-combo' };
  }
  const used = new Set(cards.map((card) => card.id));
  const hands = state.hands.map((hand, index) =>
    index === seat ? hand.filter((card) => !used.has(card.id)) : hand.slice(),
  );
  const plays = state.plays.slice();
  plays[seat] += 1;
  const bombs = state.bombs + (check.combo.kind === 'bomb' || check.combo.kind === 'rocket' ? 1 : 0);
  const next: GameState = {
    ...state,
    hands,
    plays,
    bombs,
    passes: 0,
    lastPlay: { seat: seat as Seat, combo: check.combo, cards: cards.map((card) => ({ ...card })) },
    lastPlayer: seat,
    turn: nextSeat(seat),
  };
  if (hands[seat].length === 0) return { ok: true, state: finishRound(next, seat as Seat) };
  return { ok: true, state: next };
}

export function pass(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!state.lastPlay) return { ok: false, state, error: 'must-play' };

  const passes = state.passes + 1;
  if (passes >= 2) {
    return {
      ok: true,
      state: {
        ...state,
        passes: 0,
        lastPlay: null,
        turn: state.lastPlayer as Seat,
      },
    };
  }
  return {
    ok: true,
    state: { ...state, passes, turn: nextSeat(seat) },
  };
}

function finishRound(state: GameState, winnerSeat: Seat): GameState {
  const landlord = state.landlord as Seat;
  const winnerSide = winnerSeat === landlord ? 'landlord' : 'farmers';
  const spring =
    winnerSide === 'landlord'
      ? [0, 1, 2].every((seat) => seat === landlord || state.plays[seat] === 0)
      : state.plays[landlord] === 1;
  const base = Math.max(1, state.highestBid);
  const bombMultiplier = 2 ** state.bombs;
  const multiplier = bombMultiplier * (spring ? 2 : 1);
  const stake = base * multiplier;
  const result: RoundResult = {
    winnerSide,
    winnerSeat,
    landlord,
    base,
    bombs: state.bombs,
    spring,
    multiplier,
    bombMultiplier,
    stake,
    landlordPoints: winnerSide === 'landlord' ? stake * 2 : -stake * 2,
    farmerPoints: winnerSide === 'farmers' ? stake : -stake,
    plays: state.plays.slice(),
  };
  return {
    ...state,
    phase: 'over',
    turn: -1,
    lastPlay: state.lastPlay,
    result,
  };
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = asSeat(seat) ?? 0;
  const revealed = state.phase !== 'bidding';
  return {
    seat: safeSeat,
    phase: state.phase,
    deal: state.deal,
    turn: state.turn,
    hand: state.hands[safeSeat].map((card) => ({ ...card })),
    bottom: revealed ? state.bottom.map((card) => ({ ...card })) : [],
    bottomRevealed: revealed,
    bids: state.bids.slice(),
    highestBid: state.highestBid,
    highestBidder: state.highestBidder,
    landlord: state.landlord,
    lastPlay: state.lastPlay
      ? {
          seat: state.lastPlay.seat,
          combo: { ...state.lastPlay.combo, cards: state.lastPlay.combo.cards.slice() },
          cards: state.lastPlay.cards.map((card) => ({ ...card })),
        }
      : null,
    lastPlayer: state.lastPlayer,
    passes: state.passes,
    plays: state.plays.slice(),
    handCounts: state.hands.map((hand) => hand.length),
    bombs: state.bombs,
    multiplier: 2 ** state.bombs,
    result: state.result
      ? {
          ...state.result,
          plays: state.result.plays.slice(),
        }
      : null,
    canBid: state.phase === 'bidding' && state.turn === safeSeat,
    canPlay: state.phase === 'playing' && state.turn === safeSeat,
    canPass: state.phase === 'playing' && state.turn === safeSeat && state.lastPlay !== null,
    isLandlord: state.landlord === safeSeat,
  };
}
