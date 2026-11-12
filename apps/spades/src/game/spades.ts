/**
 * Spades · four-player partnership engine.
 *
 * Pure TypeScript: no DOM, network, clock or Math.random. Every shuffle takes an
 * injected RNG. Seats 0 and 2 are partners (South–North); seats 1 and 3 are
 * partners (West–East). Play proceeds 0 → 1 → 2 → 3.
 */

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
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type Phase = 'bidding' | 'playing' | 'round-over' | 'done';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Bid {
  /** 0 means nil; 1–13 is a normal bid. */
  value: number;
  blind: boolean;
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

export interface Trick {
  leader: Seat;
  cards: PlayedCard[];
  winner: Seat;
}

export interface NilResult {
  seat: Seat;
  blind: boolean;
  made: boolean;
  points: number;
}

export interface RoundSummary {
  round: number;
  dealer: Seat;
  bids: Bid[];
  teamBids: [number, number];
  allTricks: [number, number];
  eligibleTricks: [number, number];
  tricksBySeat: number[];
  nilResults: NilResult[];
  contractPoints: [number, number];
  nilPoints: [number, number];
  bagPenalties: [number, number];
  points: [number, number];
  scoresBefore: [number, number];
  scores: [number, number];
  bags: [number, number];
  contractMade: [boolean, boolean];
}

export interface GameState {
  phase: Phase;
  round: number;
  dealer: Seat;
  turn: Seat | -1;
  target: number;
  blindNilAllowed: boolean;
  hands: Card[][];
  /** Whether each seat has looked at this deal. Blind nil needs false. */
  seen: boolean[];
  bids: (Bid | null)[];
  tricks: Trick[];
  currentTrick: PlayedCard[];
  /** Every played card, in order, for an honest AI card counter. */
  played: PlayedCard[];
  lastTrick: Trick | null;
  spadesBroken: boolean;
  scores: [number, number];
  bags: [number, number];
  tricksBySeat: [number, number, number, number];
  lastRound: RoundSummary | null;
  winner: Team | null;
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
  | 'not-seen'
  | 'blind-not-allowed'
  | 'not-your-card'
  | 'must-follow'
  | 'spades-not-broken';

export type Rng = () => number;

export interface SetupOptions {
  rng: Rng;
  dealer?: Seat;
  target?: number;
  blindNil?: boolean;
}

export interface SeatView {
  seat: Seat;
  team: Team;
  partner: Seat;
  phase: Phase;
  round: number;
  dealer: Seat;
  turn: Seat | -1;
  target: number;
  hand: Card[];
  seen: boolean;
  blindAvailable: boolean;
  canBid: boolean;
  canPlay: boolean;
  bids: (Bid | null)[];
  teamBids: [number, number];
  contract: [number, number];
  teamTricks: [number, number];
  eligibleTricks: [number, number];
  tricksBySeat: number[];
  currentTrick: PlayedCard[];
  lastTrick: Trick | null;
  spadesBroken: boolean;
  handCounts: number[];
  legal: string[];
  scores: [number, number];
  bags: [number, number];
  lastRound: RoundSummary | null;
  winner: Team | null;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];
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

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
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

export const teamOf = (seat: number): Team => (seat % 2 === 0 ? 0 : 1);
export const partnerOf = (seat: number): Seat => (((seat + 2) % 4) as Seat);
export const leftOf = (seat: number): Seat => (((seat + 1) % 4) as Seat);

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
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

function asSeat(value: number): Seat | null {
  return value === 0 || value === 1 || value === 2 || value === 3 ? (value as Seat) : null;
}

function deal(rng: Rng): Card[][] {
  const deck = shuffle(makeDeck(), rng);
  return [0, 1, 2, 3].map((seat) => sortHand(deck.slice(seat * 13, seat * 13 + 13)));
}

export function setup(options: SetupOptions): GameState {
  const dealer = options.dealer ?? 3;
  const target = Math.max(1, Math.floor(options.target ?? 500));
  const blindNilAllowed = options.blindNil ?? true;
  return {
    phase: 'bidding',
    round: 1,
    dealer,
    turn: leftOf(dealer),
    target,
    blindNilAllowed,
    hands: deal(options.rng),
    seen: [false, false, false, false],
    bids: [null, null, null, null],
    tricks: [],
    currentTrick: [],
    played: [],
    lastTrick: null,
    spadesBroken: false,
    scores: [0, 0],
    bags: [0, 0],
    tricksBySeat: [0, 0, 0, 0],
    lastRound: null,
    winner: null,
  };
}

/** Mark a seat as having looked at this deal. Blind nil is only legal before this. */
export function reveal(state: GameState, seat: number): GameState {
  if (state.phase !== 'bidding' || state.seen[seat] || asSeat(seat) === null) return state;
  const seen = state.seen.slice();
  seen[seat] = true;
  return { ...state, seen };
}

export function legalCards(state: GameState, seat: number): Card[] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  const hand = state.hands[seat] ?? [];
  const led = state.currentTrick.length > 0 ? state.currentTrick[0].card.suit : null;
  if (led) {
    const following = hand.filter((card) => card.suit === led);
    return following.length > 0 ? following : hand.slice();
  }
  if (state.spadesBroken) return hand.slice();
  const nonSpades = hand.filter((card) => card.suit !== 'S');
  return nonSpades.length > 0 ? nonSpades : hand.slice();
}

export function trickWinner(cards: PlayedCard[]): Seat | -1 {
  if (cards.length === 0) return -1;
  const lead = cards[0].card.suit;
  let best = cards[0];
  for (const played of cards.slice(1)) {
    const bestTrump = best.card.suit === 'S';
    const nextTrump = played.card.suit === 'S';
    if (nextTrump && !bestTrump) {
      best = played;
      continue;
    }
    if (nextTrump === bestTrump) {
      const inSuit = nextTrump || played.card.suit === lead;
      const bestInSuit = bestTrump || best.card.suit === lead;
      if (inSuit && bestInSuit && RANK_VALUE[played.card.rank] > RANK_VALUE[best.card.rank]) {
        best = played;
      } else if (inSuit && !bestInSuit) {
        best = played;
      }
    }
  }
  return best.seat;
}

export function teamContract(state: GameState, team: Team): number {
  let total = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (teamOf(seat) !== team) continue;
    const bid = state.bids[seat];
    if (bid && bid.value > 0) total += bid.value;
  }
  return total;
}

export function teamEligibleTricks(state: GameState, team: Team): number {
  let total = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (teamOf(seat) !== team) continue;
    const bid = state.bids[seat];
    if (bid && bid.value > 0) total += state.tricksBySeat[seat];
  }
  return total;
}

export function teamTricks(state: GameState, team: Team): number {
  let total = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (teamOf(seat) === team) total += state.tricksBySeat[seat];
  }
  return total;
}

export function matchWinner(scores: [number, number], target: number): Team | null {
  const reachedA = scores[0] >= target;
  const reachedB = scores[1] >= target;
  if (reachedA && reachedB) {
    if (scores[0] === scores[1]) return null;
    return scores[0] > scores[1] ? 0 : 1;
  }
  if (reachedA) return 0;
  if (reachedB) return 1;
  return null;
}

export function bid(state: GameState, seat: number, value: number, blind = false): ActionResult {
  if (state.phase !== 'bidding') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!Number.isInteger(value) || value < 0 || value > 13) {
    return { ok: false, state, error: 'bad-bid' };
  }
  if (blind) {
    if (!state.blindNilAllowed || value !== 0) {
      return { ok: false, state, error: 'blind-not-allowed' };
    }
    if (state.seen[seat]) return { ok: false, state, error: 'blind-not-allowed' };
  } else if (!state.seen[seat]) {
    return { ok: false, state, error: 'not-seen' };
  }

  const bids = state.bids.slice();
  bids[seat] = { value, blind: blind && value === 0 };
  const seen = state.seen.slice();
  seen[seat] = true;
  const complete = bids.every((item) => item !== null);

  if (!complete) {
    return {
      ok: true,
      state: { ...state, bids, seen, turn: leftOf(seat) },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      bids,
      seen: [true, true, true, true],
      phase: 'playing',
      turn: leftOf(state.dealer),
    },
  };
}

export function play(state: GameState, seat: number, id: string): ActionResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, state, error: 'wrong-turn' };
  const hand = state.hands[safeSeat] ?? [];
  const card = hand.find((item) => cardId(item) === id);
  if (!card) return { ok: false, state, error: 'not-your-card' };
  const legal = legalCards(state, safeSeat);
  if (!legal.some((item) => cardId(item) === id)) {
    const led = state.currentTrick.length > 0 ? state.currentTrick[0].card.suit : null;
    if (!led && card.suit === 'S' && !state.spadesBroken) {
      return { ok: false, state, error: 'spades-not-broken' };
    }
    return { ok: false, state, error: 'must-follow' };
  }

  const hands = state.hands.map((items, index) =>
    index === safeSeat ? items.filter((item) => cardId(item) !== id) : items.slice(),
  );
  const currentTrick: PlayedCard[] = [...state.currentTrick, { seat: safeSeat, card }];
  const played: PlayedCard[] = [...state.played, { seat: safeSeat, card }];
  const spadesBroken = state.spadesBroken || card.suit === 'S';

  if (currentTrick.length < 4) {
    return {
      ok: true,
      state: {
        ...state,
        hands,
        currentTrick,
        played,
        spadesBroken,
        turn: leftOf(safeSeat),
      },
    };
  }

  const winner = trickWinner(currentTrick) as Seat;
  const trick: Trick = {
    leader: currentTrick[0].seat,
    cards: currentTrick,
    winner,
  };
  const tricks = [...state.tricks, trick];
  const tricksBySeat = state.tricksBySeat.slice() as [number, number, number, number];
  tricksBySeat[winner] += 1;
  const base: GameState = {
    ...state,
    hands,
    currentTrick: [],
    played,
    spadesBroken,
    tricks,
    lastTrick: trick,
    tricksBySeat,
    turn: winner,
  };

  if (tricks.length < 13) return { ok: true, state: base };
  return { ok: true, state: finishRound(base) };
}

export interface ScoreInput {
  bids: Bid[];
  tricksBySeat: number[];
  scores: [number, number];
  bags: [number, number];
  round: number;
  dealer: Seat;
}

export interface ScoreResult {
  summary: RoundSummary;
  scores: [number, number];
  bags: [number, number];
}

/**
 * Score one completed round. Exported so the exact arithmetic is testable without
 * dealing a whole round of cards.
 */
export function scoreRound(input: ScoreInput): ScoreResult {
  const teamBids: [number, number] = [0, 0];
  const allTricks: [number, number] = [0, 0];
  const eligibleTricks: [number, number] = [0, 0];
  const nilPoints: [number, number] = [0, 0];
  const nilResults: NilResult[] = [];

  for (let seat = 0; seat < 4; seat += 1) {
    const bid = input.bids[seat] ?? { value: 0, blind: false };
    const team = teamOf(seat);
    const tricks = input.tricksBySeat[seat] ?? 0;
    allTricks[team] += tricks;
    if (bid.value > 0) {
      teamBids[team] += bid.value;
      eligibleTricks[team] += tricks;
    } else {
      const made = tricks === 0;
      const amount = bid.blind ? 200 : 100;
      const points = made ? amount : -amount;
      nilPoints[team] += points;
      nilResults.push({ seat: seat as Seat, blind: bid.blind, made, points });
    }
  }

  const contractPoints: [number, number] = [0, 0];
  const bagPenalties: [number, number] = [0, 0];
  const points: [number, number] = [0, 0];
  const scores: [number, number] = [input.scores[0], input.scores[1]];
  const bags: [number, number] = [input.bags[0], input.bags[1]];
  const contractMade: [boolean, boolean] = [false, false];

  for (const team of [0, 1] as Team[]) {
    const contract = teamBids[team];
    const eligible = eligibleTricks[team];
    let roundPoints = 0;
    let overtricks = 0;
    if (eligible >= contract) {
      contractMade[team] = true;
      overtricks = eligible - contract;
      roundPoints = contract * 10 + overtricks;
    } else {
      roundPoints = -contract * 10;
    }
    bags[team] += overtricks;
    while (bags[team] >= 10) {
      bags[team] -= 10;
      bagPenalties[team] += 100;
      roundPoints -= 100;
    }
    contractPoints[team] = contract * 10 * (contractMade[team] ? 1 : -1);
    points[team] = roundPoints + nilPoints[team];
    scores[team] += points[team];
  }

  return {
    summary: {
      round: input.round,
      dealer: input.dealer,
      bids: input.bids.map((bid) => ({ ...bid })),
      teamBids,
      allTricks,
      eligibleTricks,
      tricksBySeat: input.tricksBySeat.slice(),
      nilResults,
      contractPoints,
      nilPoints,
      bagPenalties,
      points,
      scoresBefore: [input.scores[0], input.scores[1]],
      scores: [scores[0], scores[1]],
      bags: [bags[0], bags[1]],
      contractMade,
    },
    scores,
    bags,
  };
}

function finishRound(state: GameState): GameState {
  const bids = state.bids.map((bid) => bid ?? { value: 0, blind: false });
  const result = scoreRound({
    bids,
    tricksBySeat: state.tricksBySeat,
    scores: state.scores,
    bags: state.bags,
    round: state.round,
    dealer: state.dealer,
  });
  const winner = matchWinner(result.scores, state.target);
  return {
    ...state,
    phase: winner === null ? 'round-over' : 'done',
    turn: -1,
    bids,
    scores: result.scores,
    bags: result.bags,
    lastRound: result.summary,
    winner,
  };
}

export function nextRound(state: GameState, rng: Rng): ActionResult {
  if (state.phase !== 'round-over') return { ok: false, state, error: 'bad-phase' };
  const dealer = leftOf(state.dealer);
  return {
    ok: true,
    state: {
      ...state,
      phase: 'bidding',
      round: state.round + 1,
      dealer,
      turn: leftOf(dealer),
      hands: deal(rng),
      seen: [false, false, false, false],
      bids: [null, null, null, null],
      tricks: [],
      currentTrick: [],
      played: [],
      lastTrick: null,
      spadesBroken: false,
      tricksBySeat: [0, 0, 0, 0],
      winner: null,
    },
  };
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = (asSeat(seat) ?? 0) as Seat;
  const team = teamOf(safeSeat);
  const bidding = state.phase === 'bidding';
  const canSeeHand = !bidding || state.seen[safeSeat];
  const hand = canSeeHand ? state.hands[safeSeat].map((card) => ({ ...card })) : [];
  return {
    seat: safeSeat,
    team,
    partner: partnerOf(safeSeat),
    phase: state.phase,
    round: state.round,
    dealer: state.dealer,
    turn: state.turn,
    target: state.target,
    hand,
    seen: state.seen[safeSeat],
    blindAvailable: bidding && state.blindNilAllowed && !state.seen[safeSeat],
    canBid: bidding && state.turn === safeSeat,
    canPlay: state.phase === 'playing' && state.turn === safeSeat,
    bids: state.bids.map((bid) => (bid ? { ...bid } : null)),
    teamBids: [teamContract(state, 0), teamContract(state, 1)],
    contract: [teamContract(state, 0), teamContract(state, 1)],
    teamTricks: [teamTricks(state, 0), teamTricks(state, 1)],
    eligibleTricks: [teamEligibleTricks(state, 0), teamEligibleTricks(state, 1)],
    tricksBySeat: state.tricksBySeat.slice(),
    currentTrick: state.currentTrick.map((item) => ({
      seat: item.seat,
      card: { ...item.card },
    })),
    lastTrick: state.lastTrick
      ? {
          leader: state.lastTrick.leader,
          winner: state.lastTrick.winner,
          cards: state.lastTrick.cards.map((item) => ({
            seat: item.seat,
            card: { ...item.card },
          })),
        }
      : null,
    spadesBroken: state.spadesBroken,
    handCounts: state.hands.map((items) => items.length),
    legal: legalCards(state, safeSeat).map(cardId),
    scores: [state.scores[0], state.scores[1]],
    bags: [state.bags[0], state.bags[1]],
    lastRound: state.lastRound
      ? {
          ...state.lastRound,
          bids: state.lastRound.bids.map((bid) => ({ ...bid })),
          tricksBySeat: state.lastRound.tricksBySeat.slice(),
          nilResults: state.lastRound.nilResults.map((item) => ({ ...item })),
        }
      : null,
    winner: state.winner,
  };
}
