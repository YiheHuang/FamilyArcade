/**
 * Pure four-player Hearts engine.
 *
 * No DOM, clock, network or Math.random. Shuffling takes an injected RNG so the
 * same seed always deals the same table. Hidden hands never leave through
 * `view()`: a seat only receives its own cards, public counts and public play.
 */

export const SUITS = ['clubs', 'diamonds', 'spades', 'hearts'] as const;
export type Suit = (typeof SUITS)[number];
export type Card = number;

export const DECK_SIZE = 52;
export const TWO_CLUBS: Card = 0;
export const QUEEN_SPADES: Card = 2 * 13 + 10;

export type PassDirection = 'left' | 'right' | 'across' | 'hold';
export type Phase = 'passing' | 'playing' | 'hand-over' | 'game-over';

export interface TrickCard {
  seat: number;
  card: Card;
}

export interface HandSummary {
  handNumber: number;
  points: number[];
  scores: number[];
  moon: number | null;
  handPointsBeforeMoon: number[];
}

export interface GameState {
  phase: Phase;
  handNumber: number;
  passDirection: PassDirection;
  hands: Card[][];
  passSelections: (Card[] | null)[];
  turn: number;
  leader: number;
  trick: TrickCard[];
  lastTrick: TrickCard[];
  lastTrickWinner: number | null;
  heartsBroken: boolean;
  scores: number[];
  handPoints: number[];
  playedCards: Card[];
  voids: boolean[][];
  trickNumber: number;
  firstTrick: boolean;
  mustLeadTwoClubs: boolean;
  moonShooter: number | null;
  handSummary: HandSummary | null;
  winners: number[];
}

export type MoveError =
  | 'phase'
  | 'bad-seat'
  | 'bad-card'
  | 'not-in-hand'
  | 'illegal'
  | 'wrong-turn'
  | 'bad-pass'
  | 'already-passed';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  seat: number;
  phase: Phase;
  handNumber: number;
  passDirection: PassDirection;
  hand: Card[];
  handCounts: number[];
  passSelected: Card[] | null;
  passReady: boolean[];
  turn: number;
  leader: number;
  trick: TrickCard[];
  lastTrick: TrickCard[];
  lastTrickWinner: number | null;
  playedCards: Card[];
  scores: number[];
  handPoints: number[];
  heartsBroken: boolean;
  trickNumber: number;
  playedCount: number;
  voids: boolean[][];
  firstTrick: boolean;
  mustLeadTwoClubs: boolean;
  moonShooter: number | null;
  handSummary: HandSummary | null;
  winners: number[];
  canAct: boolean;
  canPass: boolean;
  legal: Card[];
}

export interface SetupOptions {
  scores?: number[];
  handNumber?: number;
  lastTrickWinner?: number | null;
}

export function cardId(suit: Suit, rank: number): Card {
  return SUITS.indexOf(suit) * 13 + (rank - 2);
}

export function suitOf(card: Card): Suit {
  return SUITS[Math.floor(card / 13)] ?? 'clubs';
}

export function suitIndex(card: Card): number {
  return Math.floor(card / 13);
}

export function rankOf(card: Card): number {
  return (card % 13) + 2;
}

export function isHeart(card: Card): boolean {
  return suitOf(card) === 'hearts';
}

export function isQueenOfSpades(card: Card): boolean {
  return card === QUEEN_SPADES;
}

export function cardPoints(card: Card): number {
  if (isQueenOfSpades(card)) return 13;
  return isHeart(card) ? 1 : 0;
}

export function passDirectionFor(handNumber: number): PassDirection {
  return (['left', 'right', 'across', 'hold'] as const)[(Math.max(1, handNumber) - 1) % 4];
}

export function passTarget(seat: number, direction: PassDirection): number {
  if (direction === 'left') return (seat + 1) % 4;
  if (direction === 'right') return (seat + 3) % 4;
  if (direction === 'across') return (seat + 2) % 4;
  return seat;
}

function sorted(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => a - b);
}

function shuffle(deck: Card[], rng: () => number): Card[] {
  const cards = deck.slice();
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const raw = rng();
    const roll = Number.isFinite(raw) ? raw : 0;
    const pick = Math.min(index, Math.max(0, Math.floor(roll * (index + 1))));
    const swap = cards[index];
    cards[index] = cards[pick];
    cards[pick] = swap;
  }
  return cards;
}

function emptyVoids(): boolean[][] {
  return [0, 1, 2, 3].map(() => [false, false, false, false]);
}

function deal(rng: () => number): Card[][] {
  const deck = shuffle(Array.from({ length: DECK_SIZE }, (_, index) => index), rng);
  const hands: Card[][] = [[], [], [], []];
  for (let index = 0; index < deck.length; index += 1) {
    hands[index % 4].push(deck[index]);
  }
  return hands.map(sorted);
}

function findTwoClubs(hands: Card[][]): number {
  return hands.findIndex((hand) => hand.includes(TWO_CLUBS));
}

function validScores(scores: number[] | undefined): number[] {
  if (!scores || scores.length !== 4) return [0, 0, 0, 0];
  return scores.map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0));
}

function dealState(
  rng: () => number,
  handNumber: number,
  scores: number[],
  lastTrickWinner: number | null,
): GameState {
  const hands = deal(rng);
  const direction = passDirectionFor(handNumber);
  const mustLeadTwoClubs = handNumber === 1;
  const openingLeader = mustLeadTwoClubs
    ? findTwoClubs(hands)
    : lastTrickWinner ?? findTwoClubs(hands);
  const passing = direction !== 'hold';
  return {
    phase: passing ? 'passing' : 'playing',
    handNumber,
    passDirection: direction,
    hands,
    passSelections: [null, null, null, null],
    turn: passing ? -1 : openingLeader,
    leader: passing ? -1 : openingLeader,
    trick: [],
    lastTrick: [],
    lastTrickWinner: passing ? lastTrickWinner : null,
    heartsBroken: false,
    scores: scores.slice(0, 4),
    handPoints: [0, 0, 0, 0],
    playedCards: [],
    voids: emptyVoids(),
    trickNumber: 0,
    firstTrick: true,
    mustLeadTwoClubs,
    moonShooter: null,
    handSummary: null,
    winners: [],
  };
}

const fixedRng = (): number => 0.5;

export function setup(rng: () => number = fixedRng, options: SetupOptions = {}): GameState {
  const handNumber = Math.max(1, Math.floor(options.handNumber ?? 1));
  return dealState(
    rng,
    handNumber,
    validScores(options.scores),
    options.lastTrickWinner ?? null,
  );
}

export function nextHand(state: GameState, rng: () => number = fixedRng): GameState {
  if (state.phase !== 'hand-over') return state;
  const handNumber = state.handNumber + 1;
  return dealState(rng, handNumber, state.scores, state.lastTrickWinner);
}

export function legalCards(state: GameState, seat: number): Card[] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  const hand = state.hands[seat];
  if (!hand || hand.length === 0) return [];

  if (state.trick.length === 0) {
    if (state.trickNumber === 0 && state.mustLeadTwoClubs) {
      return hand.includes(TWO_CLUBS) ? [TWO_CLUBS] : hand.slice();
    }
    let pool = hand.slice();
    if (state.firstTrick) {
      const safe = pool.filter((card) => !isHeart(card) && !isQueenOfSpades(card));
      if (safe.length > 0) {
        pool = safe;
      } else {
        const nonHearts = pool.filter((card) => !isHeart(card));
        if (nonHearts.length > 0) pool = nonHearts;
      }
    }
    if (!state.heartsBroken) {
      const nonHearts = pool.filter((card) => !isHeart(card));
      if (nonHearts.length > 0) pool = nonHearts;
    }
    return pool;
  }

  const leadSuit = suitOf(state.trick[0].card);
  const following = hand.filter((card) => suitOf(card) === leadSuit);
  if (following.length > 0) {
    if (state.firstTrick) {
      const safe = following.filter((card) => !isHeart(card) && !isQueenOfSpades(card));
      if (safe.length > 0) return safe;
    }
    return following;
  }

  if (state.firstTrick) {
    const safe = hand.filter((card) => !isHeart(card) && !isQueenOfSpades(card));
    if (safe.length > 0) return safe;
  }
  return hand.slice();
}

export function passCards(state: GameState, seat: number, cards: Card[]): MoveResult {
  if (state.phase !== 'passing') return { ok: false, state, error: 'phase' };
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (state.passSelections[seat] !== null) return { ok: false, state, error: 'already-passed' };
  if (!Array.isArray(cards) || cards.length !== 3) {
    return { ok: false, state, error: 'bad-pass' };
  }
  const unique = new Set(cards);
  if (unique.size !== 3) return { ok: false, state, error: 'bad-pass' };
  const hand = new Set(state.hands[seat]);
  if (cards.some((card) => !hand.has(card))) return { ok: false, state, error: 'not-in-hand' };

  const passSelections = state.passSelections.map((pick, index) =>
    index === seat ? sorted(cards) : pick,
  );
  if (passSelections.some((pick) => pick === null)) {
    return { ok: true, state: { ...state, passSelections } };
  }

  const selected = passSelections as Card[][];
  const hands = state.hands.map((handCards, index) => {
    const outgoing = new Set(selected[index]);
    return handCards.filter((card) => !outgoing.has(card));
  });
  for (let index = 0; index < 4; index += 1) {
    const target = passTarget(index, state.passDirection);
    hands[target].push(...selected[index]);
  }
  const leader =
    state.handNumber === 1
      ? findTwoClubs(hands)
      : state.lastTrickWinner ?? findTwoClubs(hands);

  return {
    ok: true,
    state: {
      ...state,
      phase: 'playing',
      hands: hands.map(sorted),
      passSelections: [null, null, null, null],
      turn: leader,
      leader,
      trick: [],
      lastTrick: [],
      lastTrickWinner: null,
      heartsBroken: false,
      handPoints: [0, 0, 0, 0],
      playedCards: [],
      voids: emptyVoids(),
      trickNumber: 0,
      firstTrick: true,
      mustLeadTwoClubs: state.handNumber === 1,
      moonShooter: null,
      handSummary: null,
      winners: [],
    },
  };
}

function trickPoints(trick: TrickCard[]): number {
  return trick.reduce((total, item) => total + cardPoints(item.card), 0);
}

function resolveTrick(state: GameState, trick: TrickCard[]): GameState {
  const leadSuit = suitOf(trick[0].card);
  let winner = trick[0].seat;
  let best = rankOf(trick[0].card);
  for (let index = 1; index < trick.length; index += 1) {
    const entry = trick[index];
    if (suitOf(entry.card) === leadSuit && rankOf(entry.card) > best) {
      winner = entry.seat;
      best = rankOf(entry.card);
    }
  }
  const points = trickPoints(trick);
  const handPoints = state.handPoints.slice();
  handPoints[winner] += points;
  const trickNumber = state.trickNumber + 1;

  if (trickNumber < 13) {
    return {
      ...state,
      handPoints,
      trickNumber,
      trick: [],
      lastTrick: trick,
      lastTrickWinner: winner,
      turn: winner,
      leader: winner,
      firstTrick: false,
    };
  }

  const beforeMoon = handPoints.slice();
  const moonShooter = handPoints.findIndex((value) => value === 26);
  if (moonShooter >= 0) {
    for (let index = 0; index < 4; index += 1) {
      handPoints[index] = index === moonShooter ? 0 : 26;
    }
  }
  const scores = state.scores.map((value, index) => value + handPoints[index]);
  const winners = [0, 1, 2, 3]
    .filter((index) => scores[index] === Math.min(...scores))
    .sort((a, b) => a - b);
  const gameOver = scores.some((value) => value >= 100);
  return {
    ...state,
    phase: gameOver ? 'game-over' : 'hand-over',
    handPoints,
    scores,
    trickNumber,
    trick: [],
    lastTrick: trick,
    lastTrickWinner: winner,
    turn: winner,
    leader: winner,
    firstTrick: false,
    moonShooter: moonShooter >= 0 ? moonShooter : null,
    winners: gameOver ? winners : [],
    handSummary: {
      handNumber: state.handNumber,
      points: handPoints.slice(),
      scores: scores.slice(),
      moon: moonShooter >= 0 ? moonShooter : null,
      handPointsBeforeMoon: beforeMoon,
    },
  };
}

export function playCard(state: GameState, seat: number, card: Card): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!Number.isInteger(card) || card < 0 || card >= DECK_SIZE) {
    return { ok: false, state, error: 'bad-card' };
  }
  if (!state.hands[seat].includes(card)) return { ok: false, state, error: 'not-in-hand' };
  if (!legalCards(state, seat).includes(card)) return { ok: false, state, error: 'illegal' };

  const hands = state.hands.map((hand, index) =>
    index === seat ? hand.filter((item) => item !== card) : hand.slice(),
  );
  const trick = [...state.trick, { seat, card }];
  const voids = state.voids.map((row) => row.slice());
  if (state.trick.length > 0) {
    const leadSuit = suitOf(state.trick[0].card);
    if (suitOf(card) !== leadSuit) voids[seat][SUITS.indexOf(leadSuit)] = true;
  }
  const playedCards = [...state.playedCards, card];
  const heartsBroken = state.heartsBroken || isHeart(card);

  if (trick.length < 4) {
    return {
      ok: true,
      state: {
        ...state,
        hands,
        trick,
        voids,
        playedCards,
        heartsBroken,
        turn: (seat + 1) % 4,
      },
    };
  }

  return { ok: true, state: resolveTrick({ ...state, hands, trick, voids, playedCards, heartsBroken }, trick) };
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat <= 3 ? seat : 0;
  return {
    seat: safeSeat,
    phase: state.phase,
    handNumber: state.handNumber,
    passDirection: state.passDirection,
    hand: state.hands[safeSeat].slice(),
    handCounts: state.hands.map((hand) => hand.length),
    passSelected: state.passSelections[safeSeat]?.slice() ?? null,
    passReady: state.passSelections.map((pick) => pick !== null),
    turn: state.turn,
    leader: state.leader,
    trick: state.trick.slice(),
    lastTrick: state.lastTrick.slice(),
    lastTrickWinner: state.lastTrickWinner,
    playedCards: state.playedCards.slice(),
    scores: state.scores.slice(),
    handPoints: state.handPoints.slice(),
    heartsBroken: state.heartsBroken,
    trickNumber: state.trickNumber,
    playedCount: state.playedCards.length,
    voids: state.voids.map((row) => row.slice()),
    firstTrick: state.firstTrick,
    mustLeadTwoClubs: state.mustLeadTwoClubs,
    moonShooter: state.moonShooter,
    handSummary: state.handSummary
      ? {
          ...state.handSummary,
          points: state.handSummary.points.slice(),
          scores: state.handSummary.scores.slice(),
          handPointsBeforeMoon: state.handSummary.handPointsBeforeMoon.slice(),
        }
      : null,
    winners: state.winners.slice(),
    canAct: state.phase === 'playing' && state.turn === safeSeat,
    canPass: state.phase === 'passing' && state.passSelections[safeSeat] === null,
    legal: legalCards(state, safeSeat),
  };
}
