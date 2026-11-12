import {
  QUEEN_SPADES,
  TWO_CLUBS,
  cardPoints,
  isHeart,
  isQueenOfSpades,
  legalCards,
  playCard,
  rankOf,
  suitIndex,
  suitOf,
  type Card,
  type GameState,
  type Suit,
} from '../game/hearts';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const fixedRng: Rng = () => 0.5;

function randomFrom<T>(items: T[], rng: Rng): T {
  const raw = rng();
  const roll = Number.isFinite(raw) ? raw : 0.5;
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(roll * items.length)))];
}

function shuffleWithRng<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = rng();
    const roll = Number.isFinite(raw) ? raw : 0.5;
    const pick = Math.min(index, Math.max(0, Math.floor(roll * (index + 1))));
    const swap = copy[index];
    copy[index] = copy[pick];
    copy[pick] = swap;
  }
  return copy;
}

function sortedBy<T>(items: T[], score: (item: T) => number, descending = false): T[] {
  return items.slice().sort((a, b) => {
    const left = score(a);
    const right = score(b);
    return descending ? right - left : left - right;
  });
}

/** Danger of letting a card sit in hand: the queen is the worst, then high hearts. */
function passDanger(card: Card): number {
  if (card === TWO_CLUBS) return -1000;
  if (isQueenOfSpades(card)) return 1000;
  const rank = rankOf(card);
  if (isHeart(card)) return 300 + rank * 7 + (rank >= 11 ? 50 : 0);
  if (suitOf(card) === 'spades') return rank >= 12 ? 130 + rank * 3 : rank * 0.4;
  return rank * 0.3;
}

export function choosePass(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = fixedRng,
): Card[] {
  if (state.phase !== 'passing') return [];
  const hand = state.hands[seat];
  if (!hand || hand.length < 3) return hand ? hand.slice() : [];
  const ordered = sortedBy(hand, passDanger, true);

  if (level === 'easy') {
    if (rng() < 0.55) {
      const pool = hand.slice();
      const picks: Card[] = [];
      while (picks.length < 3 && pool.length > 0) {
        const card = randomFrom(pool, rng);
        picks.push(card);
        pool.splice(pool.indexOf(card), 1);
      }
      return picks;
    }
    return ordered.slice(0, 3);
  }

  if (level === 'companion') {
    if (rng() < 0.2) {
      // Gentle: still keep the two of clubs, but otherwise pass ordinary high cards.
      const safe = ordered.filter((card) => card !== TWO_CLUBS);
      return safe.slice(0, 3);
    }
    return ordered.slice(0, 3);
  }

  if (level === 'normal' && rng() < 0.18) {
    const third = randomFrom(hand.filter((card) => !ordered.slice(0, 2).includes(card)), rng);
    return [ordered[0], ordered[1], third];
  }

  return ordered.slice(0, 3);
}

function currentLeadSuit(state: GameState): ReturnType<typeof suitOf> | null {
  return state.trick.length > 0 ? suitOf(state.trick[0].card) : null;
}

function trickPointsOnTable(state: GameState): number {
  return state.trick.reduce((total, item) => total + cardPoints(item.card), 0);
}

function isWinningNow(state: GameState, card: Card): boolean {
  if (state.trick.length === 0) return false;
  const lead = suitOf(state.trick[0].card);
  if (suitOf(card) !== lead) return false;
  const rank = rankOf(card);
  return state.trick.every((item) => suitOf(item.card) !== lead || rankOf(item.card) < rank);
}

function cardsHigherUnseen(state: GameState, seat: number, card: Card): number {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const known = new Set([...state.hands[seat], ...state.playedCards]);
  let count = 0;
  for (let index = 0; index < 52; index += 1) {
    if (known.has(index)) continue;
    if (suitOf(index) === suit && rankOf(index) > rank) count += 1;
  }
  return count;
}

function queenStillUnseen(state: GameState, seat: number): boolean {
  return !state.playedCards.includes(QUEEN_SPADES) && !state.hands[seat].includes(QUEEN_SPADES);
}

function moonState(state: GameState, seat: number): { mine: boolean; threat: number | null } {
  const mine = state.handPoints[seat] >= 18;
  let threat: number | null = null;
  let best = 17;
  for (let index = 0; index < 4; index += 1) {
    if (index !== seat && state.handPoints[index] > best) {
      best = state.handPoints[index];
      threat = index;
    }
  }
  return { mine, threat };
}

/** Explainable one-trick heuristic used by Normal and as a tie-breaker for Hard. */
function heuristicValue(state: GameState, seat: number, card: Card): number {
  const lead = currentLeadSuit(state);
  const points = trickPointsOnTable(state) + cardPoints(card);
  const winningNow = isWinningNow(state, card);
  const rank = rankOf(card);
  const remaining = 4 - state.trick.length - 1;
  const higher = cardsHigherUnseen(state, seat, card);
  const likelyWin = winningNow
    ? higher === 0
      ? 1
      : Math.max(0, 1 - higher / Math.max(4, remaining + 2))
    : 0;
  const moon = moonState(state, seat);
  let value = -rank * 0.25;

  if (lead === null) {
    // Leading: low cards are generally safest. A low heart is fine once broken.
    value += isHeart(card) && state.heartsBroken ? 1.2 : 0;
    if (card === QUEEN_SPADES) value -= 50;
    if (moon.mine) value += cardPoints(card) * 0.8;
    return value;
  }

  if (suitOf(card) === lead) {
    value -= points * 3.4 * likelyWin;
    if (lead === 'spades' && queenStillUnseen(state, seat)) value -= 11 * likelyWin;
    if (moon.mine) value += points * 2.6 * likelyWin;
    if (moon.threat !== null && likelyWin && points > 0) value += points * 1.7;
    if (!likelyWin) value += 0.8;
  } else {
    // Void: shed danger, never win the trick off-suit.
    value += cardPoints(card) * 0.5;
    if (card === QUEEN_SPADES) value += 26;
    if (moon.threat !== null) value += cardPoints(card) * 0.6;
    else value += isHeart(card) ? 0.8 : 0;
  }
  return value;
}

function cheapestCard(state: GameState, seat: number): Card {
  const legal = legalCards(state, seat);
  if (legal.length === 0) return -1;
  return sortedBy(legal, (card) => {
    return rankOf(card) + cardPoints(card) * 9 + (isQueenOfSpades(card) ? 80 : 0);
  })[0];
}

/**
 * Sample a plausible world using only public information: the AI's own hand,
 * cards already played, hand counts and known voids. Hidden hands are never read.
 */
function sampleWorld(state: GameState, seat: number, rng: Rng): GameState {
  const seen = new Set<number>([...state.hands[seat], ...state.playedCards]);
  const unseen: Card[] = [];
  for (let index = 0; index < 52; index += 1) if (!seen.has(index)) unseen.push(index);
  const shuffled = shuffleWithRng(unseen, rng);
  const hands = state.hands.map((hand) => hand.slice());
  const remaining = shuffled.slice();

  for (let player = 0; player < 4; player += 1) {
    if (player === seat) continue;
    const need = state.hands[player].length;
    const picked: Card[] = [];
    const allowed = remaining.filter((card) => !state.voids[player][suitIndex(card)]);
    while (picked.length < need && allowed.length > 0) {
      const card = allowed.shift() as Card;
      const at = remaining.indexOf(card);
      if (at >= 0) remaining.splice(at, 1);
      picked.push(card);
    }
    while (picked.length < need && remaining.length > 0) {
      picked.push(remaining.shift() as Card);
    }
    hands[player] = picked;
  }
  return { ...state, hands, phase: state.phase };
}

function playLowestForEveryone(worldIn: GameState): GameState {
  let world = worldIn;
  let guard = 0;
  while (world.phase === 'playing' && guard < 80) {
    guard += 1;
    const card = cheapestCard(world, world.turn);
    if (card < 0) break;
    const result = playCard(world, world.turn, card);
    if (!result.ok) break;
    world = result.state;
  }
  return world;
}

function evaluateWorld(world: GameState, seat: number): number {
  const mine = world.scores[seat];
  const others = world.scores.filter((_, index) => index !== seat);
  const bestOther = others.length > 0 ? Math.min(...others) : 0;
  let value = (bestOther - mine) * 1.6 - mine * 0.25;
  if (mine < bestOther) value += 22;
  if (mine === bestOther) value += 8;
  if (world.moonShooter === seat) value += 42;
  else if (world.moonShooter !== null) value -= 42;
  return value;
}

function simulateCandidate(
  state: GameState,
  seat: number,
  card: Card,
  rng: Rng,
  worlds: number,
): number {
  let total = 0;
  let count = 0;
  for (let index = 0; index < worlds; index += 1) {
    const sampled = sampleWorld(state, seat, rng);
    const result = playCard(sampled, seat, card);
    if (!result.ok) continue;
    const finished = playLowestForEveryone(result.state);
    total += evaluateWorld(finished, seat);
    count += 1;
  }
  return count > 0 ? total / count : heuristicValue(state, seat, card);
}

export function chooseMove(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = fixedRng,
): Card {
  if (state.phase !== 'playing' || state.turn !== seat) return -1;
  const legal = legalCards(state, seat);
  if (legal.length === 0) return -1;
  if (legal.length === 1) return legal[0];

  if (level === 'easy') {
    if (rng() < 0.5) return randomFrom(legal, rng);
    return sortedBy(legal, (card) => {
      return rankOf(card) + cardPoints(card) * 20 + (isQueenOfSpades(card) ? 200 : 0);
    }, false)[0];
  }

  if (level === 'companion') {
    return sortedBy(legal, (card) => {
      const risky = cardPoints(card) * 7 + rankOf(card) * 0.3 + (isQueenOfSpades(card) ? 130 : 0);
      return risky;
    }, false)[0];
  }

  if (level === 'normal') {
    if (rng() < 0.14) return randomFrom(legal, rng);
    return sortedBy(legal, (card) => heuristicValue(state, seat, card), true)[0];
  }

  const worlds = state.trick.length === 0 ? 10 : 14;
  let bestCard = legal[0];
  let best = -Infinity;
  for (const card of legal) {
    const sampled = simulateCandidate(state, seat, card, rng, worlds);
    const value = sampled + heuristicValue(state, seat, card) * 0.35;
    if (value > best) {
      best = value;
      bestCard = card;
    }
  }
  return bestCard;
}

/** Test/demo helper: a stable shuffled deal from an integer seed. */
export function seededRng(seed: number): Rng {
  let value = Math.floor(seed) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Useful for tests and the hint panel: all cards of a suit still unseen. */
export function unseenOfSuit(state: GameState, seat: number, suit: Suit): number[] {
  const base = ['clubs', 'diamonds', 'spades', 'hearts'].indexOf(suit) * 13;
  const known = new Set([...state.hands[seat], ...state.playedCards]);
  return Array.from({ length: 13 }, (_, index) => base + index).filter(
    (card) => !known.has(card),
  );
}
