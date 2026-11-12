/**
 * Pure cribbage engine.
 *
 * No DOM, network, clock or Math.random. All deals come from an injected seed and
 * every action returns a fresh state. The rules implemented here are standard
 * six-card cribbage for two players, and the five-card cut-throat game for three or
 * four players (each player keeps their own score; the crib belongs to the dealer).
 */

export type Card = number; // 0..51, suit * 13 + (rank - 1)

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type SuitName = (typeof SUITS)[number];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export const TARGET = 121;

export function suitOf(card: Card): number {
  return Math.floor(card / 13);
}

export function rankOf(card: Card): number {
  return (card % 13) + 1;
}

/** Face cards count ten; an ace counts one. */
export function cardValue(card: Card): number {
  return Math.min(rankOf(card), 10);
}

export function isRed(card: Card): boolean {
  const suit = suitOf(card);
  return suit === 1 || suit === 2;
}

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function freshDeck(): Card[] {
  return Array.from({ length: 52 }, (_, card) => card);
}

export function shuffle(deck: Card[], rng: () => number): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Phase = 'discard' | 'cut' | 'pegging' | 'count' | 'game-over';

export type ScoreKind = 'fifteens' | 'pairs' | 'runs' | 'flush' | 'nobs';

export interface ScorePart {
  kind: ScoreKind;
  /** Number of combinations (fifteens, pairs), runs, or 1 for flush/nobs. */
  count: number;
  /** Run length for a run, otherwise undefined. */
  n?: number;
  points: number;
}

export interface HandScore {
  owner: number | 'crib';
  cards: Card[];
  starter: Card;
  parts: ScorePart[];
  total: number;
  awarded: boolean;
}

export type PegEventKind =
  | 'deal'
  | 'cut'
  | 'heels'
  | 'play'
  | 'fifteen'
  | 'thirtyone'
  | 'pair'
  | 'run'
  | 'go'
  | 'last'
  | 'count'
  | 'win';

export interface PegEvent {
  kind: PegEventKind;
  seat: number | null;
  points: number;
  card?: Card;
  count?: number;
  n?: number;
}

export interface Seat {
  hand: Card[];
  score: number;
}

export interface BestHand {
  seat: number;
  points: number;
  cards: Card[];
  starter: Card;
}

export interface GameState {
  players: number;
  handSize: number;
  discardCount: number;
  seats: Seat[];
  dealer: number;
  phase: Phase;
  stock: Card[];
  crib: Card[];
  /** The four-card hands as they stood when pegging began, used for the show. */
  showHands: Card[][];
  starter: Card | null;
  turn: number;
  count: number;
  sequence: Card[];
  pegged: { seat: number; card: Card }[];
  passes: number[];
  lastPlayer: number | null;
  lastCard: Card | null;
  events: PegEvent[];
  handScores: HandScore[] | null;
  bestHand: BestHand | null;
  winner: number | null;
  handNo: number;
  seed: number;
}

export type ActionError =
  | 'phase'
  | 'turn'
  | 'seat'
  | 'cards'
  | 'count'
  | 'hand'
  | 'limit'
  | 'stock';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: ActionError;
}

function clampSeat(players: number, seat: number): number {
  return ((Math.floor(seat) % players) + players) % players;
}

export function poneOf(state: Pick<GameState, 'players' | 'dealer'>): number {
  return (state.dealer + 1) % state.players;
}

export function setup(players: number, dealer: number, seed: number): GameState {
  const count = Math.max(2, Math.min(4, Math.floor(players)));
  const handSize = count === 2 ? 6 : 5;
  const discardCount = count === 2 ? 2 : 1;
  const dealerSeat = clampSeat(count, dealer);
  const pone = (dealerSeat + 1) % count;
  const deck = shuffle(freshDeck(), makeRng(seed));
  const seats: Seat[] = Array.from({ length: count }, () => ({ hand: [], score: 0 }));

  for (let round = 0; round < handSize; round += 1) {
    for (let offset = 0; offset < count; offset += 1) {
      const seat = (pone + offset) % count;
      seats[seat].hand.push(deck.pop() as Card);
    }
  }

  return {
    players: count,
    handSize,
    discardCount,
    seats,
    dealer: dealerSeat,
    phase: 'discard',
    stock: deck,
    crib: [],
    showHands: [],
    starter: null,
    turn: pone,
    count: 0,
    sequence: [],
    pegged: [],
    passes: [],
    lastPlayer: null,
    lastCard: null,
    events: [{ kind: 'deal', seat: null, points: 0, n: handSize }],
    handScores: null,
    bestHand: null,
    winner: null,
    handNo: 1,
    seed,
  };
}

/** Remove selected cards from a hand and put them face down in the crib. */
export function discard(state: GameState, seat: number, cards: Card[]): ActionResult {
  if (state.phase !== 'discard') return { ok: false, state, error: 'phase' };
  if (seat !== state.turn) return { ok: false, state, error: 'turn' };
  if (seat < 0 || seat >= state.players) return { ok: false, state, error: 'seat' };
  const unique = new Set(cards);
  if (
    unique.size !== cards.length ||
    cards.length !== state.discardCount ||
    cards.some((card) => !Number.isInteger(card) || !state.seats[seat].hand.includes(card))
  ) {
    return {
      ok: false,
      state,
      error: cards.length === state.discardCount ? 'hand' : 'count',
    };
  }

  const seats = state.seats.map((item, index) =>
    index === seat ? { ...item, hand: item.hand.filter((card) => !unique.has(card)) } : item,
  );
  const done = seats.every((item) => item.hand.length === state.handSize - state.discardCount);

  if (!done) {
    let next = state.turn;
    for (let step = 1; step <= state.players; step += 1) {
      const candidate = (state.turn + step) % state.players;
      if (seats[candidate].hand.length > state.handSize - state.discardCount) {
        next = candidate;
        break;
      }
    }
    return {
      ok: true,
      state: {
        ...state,
        seats,
        turn: next,
        crib: [...state.crib, ...cards],
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      seats,
      crib: [...state.crib, ...cards],
      phase: 'cut',
      turn: (state.dealer + 1) % state.players,
    },
  };
}

/** The pone cuts the starter. A Jack gives the dealer two for his heels. */
export function cut(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'cut') return { ok: false, state, error: 'phase' };
  if (seat !== state.turn) return { ok: false, state, error: 'turn' };
  const stock = state.stock.slice();
  const starter = stock.pop();
  if (starter === undefined) return { ok: false, state, error: 'stock' };
  const showHands = state.seats.map((seat) => seat.hand.slice());

  const cutEvent: PegEvent = { kind: 'cut', seat, points: 0, card: starter };
  if (rankOf(starter) === 11) {
    const dealerScore = Math.min(TARGET, state.seats[state.dealer].score + 2);
    const seats = state.seats.map((item, index) =>
      index === state.dealer ? { ...item, score: dealerScore } : item,
    );
    const events = [
      ...state.events,
      cutEvent,
      { kind: 'heels' as const, seat: state.dealer, points: 2, card: starter },
    ];
    if (dealerScore >= TARGET) {
      return {
        ok: true,
        state: {
          ...state,
          stock,
          starter,
          showHands,
          seats,
          phase: 'game-over',
          winner: state.dealer,
          events: [...events, { kind: 'win', seat: state.dealer, points: 0 }],
        },
      };
    }
    return {
      ok: true,
      state: {
        ...state,
        stock,
        starter,
        showHands,
        seats,
        phase: 'pegging',
        turn: (state.dealer + 1) % state.players,
        events,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      stock,
      starter,
      showHands,
      phase: 'pegging',
      turn: (state.dealer + 1) % state.players,
      events: [...state.events, cutEvent],
    },
  };
}

export interface PegPart {
  kind: 'fifteen' | 'thirtyone' | 'pair' | 'run';
  points: number;
  n?: number;
}

/**
 * Longest valid run suffix. Duplicates can create multiple runs (a double run).
 * Returns null when the last card did not complete a run of three or more.
 */
export function pegRunSuffix(sequence: Card[]): { length: number; ways: number; points: number } | null {
  const counts = new Map<number, number>();
  let best: { length: number; ways: number; points: number } | null = null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = sequence.length - 1; index >= 0; index -= 1) {
    const rank = rankOf(sequence[index]);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
    min = Math.min(min, rank);
    max = Math.max(max, rank);
    if (max - min + 1 === counts.size && counts.size >= 3) {
      let ways = 1;
      for (const amount of counts.values()) ways *= amount;
      best = { length: counts.size, ways, points: counts.size * ways };
    }
  }
  return best;
}

/** Immediate pegging score for playing `card` onto the current sequence. */
export function pegPlayScore(
  sequence: Card[],
  count: number,
  card: Card,
): { count: number; parts: PegPart[]; points: number } {
  const nextCount = count + cardValue(card);
  const nextSequence = [...sequence, card];
  const parts: PegPart[] = [];

  if (nextCount === 15) parts.push({ kind: 'fifteen', points: 2 });
  if (nextCount === 31) parts.push({ kind: 'thirtyone', points: 2 });

  let same = 1;
  for (let index = nextSequence.length - 2; index >= 0; index -= 1) {
    if (rankOf(nextSequence[index]) === rankOf(card)) same += 1;
    else break;
  }
  if (same >= 2) parts.push({ kind: 'pair', points: same * (same - 1), n: same });

  const run = pegRunSuffix(nextSequence);
  if (run) parts.push({ kind: 'run', points: run.points, n: run.length });

  return {
    count: nextCount,
    parts,
    points: parts.reduce((sum, part) => sum + part.points, 0),
  };
}

export function play(state: GameState, seat: number, card: Card): ActionResult {
  if (state.phase !== 'pegging') return { ok: false, state, error: 'phase' };
  if (seat !== state.turn) return { ok: false, state, error: 'turn' };
  if (seat < 0 || seat >= state.players) return { ok: false, state, error: 'seat' };
  if (!state.seats[seat].hand.includes(card)) return { ok: false, state, error: 'hand' };
  if (state.count + cardValue(card) > 31) return { ok: false, state, error: 'limit' };

  const peg = pegPlayScore(state.sequence, state.count, card);
  const seats = state.seats.map((item, index) =>
    index === seat ? { ...item, hand: item.hand.filter((value) => value !== card) } : item,
  );
  const score = Math.min(TARGET, state.seats[seat].score + peg.points);
  const scoringEvents: PegEvent[] = peg.parts.map((part) => ({
    kind: part.kind,
    seat,
    points: part.points,
    ...(part.n !== undefined ? { n: part.n } : {}),
    count: peg.count,
  }));
  const events: PegEvent[] = [
    ...state.events,
    { kind: 'play', seat, points: 0, card, count: peg.count },
    ...scoringEvents,
  ];

  if (score >= TARGET) {
    return {
      ok: true,
      state: {
        ...state,
        seats: seats.map((item, index) => (index === seat ? { ...item, score } : item)),
        count: peg.count,
        sequence: [...state.sequence, card],
        pegged: [...state.pegged, { seat, card }],
        lastPlayer: seat,
        lastCard: card,
        events: [...events, { kind: 'win', seat, points: 0 }],
        phase: 'game-over',
        winner: seat,
        handScores: null,
      },
    };
  }

  const next: GameState = {
    ...state,
    seats: seats.map((item, index) => (index === seat ? { ...item, score } : item)),
    count: peg.count,
    sequence: [...state.sequence, card],
    pegged: [...state.pegged, { seat, card }],
    lastPlayer: seat,
    lastCard: card,
    events,
  };

  if (peg.count === 31) return { ok: true, state: endSequence(next) };
  if (next.seats.every((item) => item.hand.length === 0)) {
    return { ok: true, state: endSequence(next) };
  }
  return { ok: true, state: advance(next) };
}

function advance(state: GameState): GameState {
  const last = state.lastPlayer;
  if (last === null) return state;
  let passes = state.passes.slice();
  const events = state.events.slice();

  for (let step = 1; step <= state.players; step += 1) {
    const seat = (last + step) % state.players;
    const hand = state.seats[seat].hand;
    if (hand.length === 0) continue;
    if (passes.includes(seat)) continue;
    if (hand.some((card) => state.count + cardValue(card) <= 31)) {
      return { ...state, passes, events, turn: seat };
    }
    passes = [...passes, seat];
    events.push({ kind: 'go', seat, points: 0, count: state.count });
  }

  return endSequence({ ...state, passes, events });
}

function nextSeatWithCards(state: GameState, from: number): number {
  for (let step = 1; step <= state.players; step += 1) {
    const seat = (from + step) % state.players;
    if (state.seats[seat].hand.length > 0) return seat;
  }
  return (from + 1) % state.players;
}

function addPoint(state: GameState, seat: number, points: number, event: PegEvent): GameState {
  const seats = state.seats.map((item, index) =>
    index === seat ? { ...item, score: Math.min(TARGET, item.score + points) } : item,
  );
  return { ...state, seats, events: [...state.events, event] };
}

function endSequence(state: GameState): GameState {
  const last = state.lastPlayer;
  let next = state;

  if (last !== null && next.count > 0 && next.count !== 31) {
    next = addPoint(next, last, 1, {
      kind: 'last',
      seat: last,
      points: 1,
      count: next.count,
    });
    if (next.seats[last].score >= TARGET) {
      return {
        ...next,
        phase: 'game-over',
        winner: last,
        handScores: null,
        events: [...next.events, { kind: 'win', seat: last, points: 0 }],
      };
    }
  }

  const lead = last === null ? next.turn : nextSeatWithCards(next, last);
  next = {
    ...next,
    count: 0,
    sequence: [],
    passes: [],
    lastPlayer: null,
    lastCard: null,
    turn: lead,
  };

  if (next.seats.every((item) => item.hand.length === 0)) return enterCount(next);
  return next;
}

/** Count every hand and the crib in traditional order: pone first, dealer last. */
function enterCount(state: GameState): GameState {
  if (state.handScores !== null || state.starter === null) return state;
  const starter = state.starter;
  const handScores: HandScore[] = [];

  for (let offset = 0; offset < state.players; offset += 1) {
    const seat = (state.dealer + 1 + offset) % state.players;
    const cards = state.showHands[seat] ?? state.seats[seat].hand;
    const score = scoreCards(cards, starter, false);
    handScores.push({
      owner: seat,
      cards: cards.slice(),
      starter,
      parts: score.parts,
      total: score.total,
      awarded: false,
    });
  }

  const cribScore = scoreCards(state.crib, starter, true);
  handScores.push({
    owner: 'crib',
    cards: state.crib.slice(),
    starter,
    parts: cribScore.parts,
    total: cribScore.total,
    awarded: false,
  });

  const seats = state.seats.map((item) => ({ ...item }));
  let winner: number | null = null;
  let bestHand = state.bestHand;

  for (const detail of handScores) {
    if (winner !== null) break;
    if (detail.owner === 'crib') {
      seats[state.dealer].score = Math.min(TARGET, seats[state.dealer].score + detail.total);
      detail.awarded = true;
      if (seats[state.dealer].score >= TARGET) winner = state.dealer;
    } else {
      seats[detail.owner].score = Math.min(TARGET, seats[detail.owner].score + detail.total);
      detail.awarded = true;
      if (
        bestHand === null ||
        detail.total > bestHand.points ||
        (detail.total === bestHand.points && detail.owner < bestHand.seat)
      ) {
        bestHand = {
          seat: detail.owner,
          points: detail.total,
          cards: detail.cards.slice(),
          starter,
        };
      }
      if (seats[detail.owner].score >= TARGET) winner = detail.owner;
    }
  }

  const events: PegEvent[] = [...state.events, { kind: 'count', seat: null, points: 0 }];
  if (winner !== null) events.push({ kind: 'win', seat: winner, points: 0 });

  return {
    ...state,
    seats,
    handScores,
    bestHand,
    phase: winner !== null ? 'game-over' : 'count',
    winner,
    turn: state.dealer,
    events,
  };
}

export function nextHand(state: GameState, seed: number): GameState {
  if (state.phase !== 'count') return state;
  const nextDealer = (state.dealer + 1) % state.players;
  const fresh = setup(state.players, nextDealer, seed);
  return {
    ...fresh,
    handNo: state.handNo + 1,
    bestHand: state.bestHand,
    seats: fresh.seats.map((item, index) => ({
      ...item,
      score: state.seats[index].score,
    })),
  };
}

export interface SeatView {
  seat: number;
  players: number;
  phase: Phase;
  dealer: number;
  turn: number;
  scores: number[];
  hand: Card[];
  handCounts: number[];
  cribCount: number;
  stockCount: number;
  starter: Card | null;
  count: number;
  sequence: Card[];
  pegged: { seat: number; card: Card }[];
  passes: number[];
  lastPlayer: number | null;
  lastCard: Card | null;
  events: PegEvent[];
  handScores: HandScore[] | null;
  bestHand: BestHand | null;
  winner: number | null;
  handNo: number;
  discardCount: number;
  legal: Card[];
  canDiscard: boolean;
  canCut: boolean;
  canPlay: boolean;
  revealedHands: { seat: number; cards: Card[] }[] | null;
  crib: Card[] | null;
}

export function view(state: GameState, seat: number): SeatView {
  const mine = seat >= 0 && seat < state.players ? seat : 0;
  const reveal = state.phase === 'count' || state.phase === 'game-over';
  const legal =
    state.phase === 'discard' && state.turn === mine
      ? state.seats[mine].hand.slice()
      : state.phase === 'pegging' && state.turn === mine
        ? state.seats[mine].hand.filter((card) => state.count + cardValue(card) <= 31)
        : [];

  return {
    seat: mine,
    players: state.players,
    phase: state.phase,
    dealer: state.dealer,
    turn: state.turn,
    scores: state.seats.map((item) => item.score),
    hand: state.seats[mine].hand.slice(),
    handCounts: state.seats.map((item) => item.hand.length),
    cribCount: state.crib.length,
    stockCount: state.stock.length,
    starter: state.starter,
    count: state.count,
    sequence: state.sequence.slice(),
    pegged: state.pegged.map((item) => ({ ...item })),
    passes: state.passes.slice(),
    lastPlayer: state.lastPlayer,
    lastCard: state.lastCard,
    events: state.events.map((item) => ({ ...item })),
    handScores: reveal && state.handScores ? state.handScores.map((item) => ({ ...item })) : null,
    bestHand: state.bestHand ? { ...state.bestHand } : null,
    winner: state.winner,
    handNo: state.handNo,
    discardCount: state.discardCount,
    legal,
    canDiscard: state.phase === 'discard' && state.turn === mine,
    canCut: state.phase === 'cut' && state.turn === mine,
    canPlay: state.phase === 'pegging' && state.turn === mine && legal.length > 0,
    revealedHands: reveal
      ? state.seats.map((item, index) => ({
          seat: index,
          cards: (state.showHands[index] ?? item.hand).slice(),
        }))
      : null,
    crib: reveal ? state.crib.slice() : null,
  };
}

/** Score a hand or crib (not including the starter in `cards`). */
export function scoreCards(
  cards: Card[],
  starter: Card,
  crib: boolean,
): { parts: ScorePart[]; total: number } {
  const all = [...cards, starter];
  const parts: ScorePart[] = [];

  let fifteenCount = 0;
  const combinations = 1 << all.length;
  for (let mask = 1; mask < combinations; mask += 1) {
    let sum = 0;
    for (let index = 0; index < all.length; index += 1) {
      if (mask & (1 << index)) sum += cardValue(all[index]);
    }
    if (sum === 15) fifteenCount += 1;
  }
  if (fifteenCount > 0) parts.push({ kind: 'fifteens', count: fifteenCount, points: fifteenCount * 2 });

  const rankCounts = new Map<number, number>();
  for (const card of all) {
    const rank = rankOf(card);
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }
  let pairCount = 0;
  for (const amount of rankCounts.values()) pairCount += (amount * (amount - 1)) / 2;
  if (pairCount > 0) parts.push({ kind: 'pairs', count: pairCount, points: pairCount * 2 });

  const ranks = [...rankCounts.keys()].sort((a, b) => a - b);
  let runPoints = 0;
  let runWays = 0;
  let runLength = 0;
  let index = 0;
  while (index < ranks.length) {
    let end = index;
    while (end + 1 < ranks.length && ranks[end + 1] === ranks[end] + 1) end += 1;
    const length = end - index + 1;
    if (length >= 3) {
      let ways = 1;
      for (let rankIndex = index; rankIndex <= end; rankIndex += 1) {
        ways *= rankCounts.get(ranks[rankIndex]) ?? 1;
      }
      runPoints += length * ways;
      runWays += ways;
      runLength = Math.max(runLength, length);
    }
    index = end + 1;
  }
  if (runPoints > 0) {
    parts.push({ kind: 'runs', count: runWays, n: runLength, points: runPoints });
  }

  const handSuit = cards.length > 0 ? suitOf(cards[0]) : -1;
  const handFlush =
    cards.length > 0 && cards.every((card) => suitOf(card) === handSuit);
  let flush = 0;
  if (!crib) {
    if (handFlush && cards.length === 4) {
      flush = 4 + (suitOf(starter) === handSuit ? 1 : 0);
    }
  } else if (handFlush && cards.length >= 3 && suitOf(starter) === handSuit) {
    flush = cards.length + 1;
  }
  if (flush > 0) parts.push({ kind: 'flush', count: 1, points: flush });

  const nobs = cards.some((card) => rankOf(card) === 11 && suitOf(card) === suitOf(starter))
    ? 1
    : 0;
  if (nobs > 0) parts.push({ kind: 'nobs', count: 1, points: 1 });

  return {
    parts,
    total: parts.reduce((sum, part) => sum + part.points, 0),
  };
}

/** The classic 29 hand: three fives and the matching Jack, starter the fourth five. */
export function skunkFor(state: GameState): 'none' | 'skunk' | 'double' {
  if (state.winner === null) return 'none';
  const losers = state.seats
    .map((item, index) => (index === state.winner ? -1 : item.score))
    .filter((score) => score >= 0);
  if (losers.length === 0) return 'none';
  const bestLoser = Math.max(...losers);
  if (bestLoser < 61) return 'double';
  if (bestLoser < 91) return 'skunk';
  return 'none';
}

export function scoreLabel(part: ScorePart): string {
  return part.kind;
}
