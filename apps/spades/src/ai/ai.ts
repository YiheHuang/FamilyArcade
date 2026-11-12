import {
  RANK_VALUE,
  cardId,
  legalCards,
  makeDeck,
  partnerOf,
  teamContract,
  teamEligibleTricks,
  teamOf,
  trickWinner,
  type Bid,
  type Card,
  type GameState,
  type PlayedCard,
  type Seat,
  type Suit,
} from '../game/spades';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

export interface BidChoice {
  value: number;
  blind: boolean;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

function rank(card: Card): number {
  return RANK_VALUE[card.rank];
}

function bySuit(hand: Card[]): Record<Suit, Card[]> {
  const groups: Record<Suit, Card[]> = { S: [], H: [], C: [], D: [] };
  for (const card of hand) groups[card.suit].push(card);
  for (const suit of Object.keys(groups) as Suit[]) {
    groups[suit].sort((a, b) => rank(b) - rank(a));
  }
  return groups;
}

/**
 * A public, explainable estimate of how many tricks a hand should take.
 * It deliberately favours top cards and cannot see any other hand.
 */
export function handStrength(hand: Card[]): number {
  const groups = bySuit(hand);
  let tricks = 0;

  const spades = groups.S;
  const spadeLength = spades.length;
  for (const card of spades) {
    const value = rank(card);
    if (value === 14) tricks += 1;
    else if (value === 13) tricks += spadeLength >= 2 ? 0.85 : 0.6;
    else if (value === 12) tricks += spadeLength >= 3 ? 0.55 : 0.3;
    else if (value === 11) tricks += spadeLength >= 4 ? 0.3 : 0.12;
    else if (spadeLength >= 5) tricks += 0.14;
  }
  if (spadeLength >= 5) tricks += 0.25;
  if (spadeLength === 0) tricks += 0.15;

  for (const suit of ['H', 'C', 'D'] as Suit[]) {
    const cards = groups[suit];
    const length = cards.length;
    const hasAce = cards.some((card) => card.rank === 'A');
    const hasKing = cards.some((card) => card.rank === 'K');
    const hasQueen = cards.some((card) => card.rank === 'Q');
    if (hasAce) tricks += 0.95;
    if (hasKing) tricks += hasAce ? 0.75 : length >= 3 ? 0.5 : 0.3;
    if (hasQueen) tricks += (hasAce || hasKing) && length >= 3 ? 0.28 : 0.08;
    if (length >= 5) tricks += 0.18;
    if (length >= 6) tricks += 0.18;
    if (length === 0) tricks += 0.34;
    else if (length === 1) tricks += 0.18;
  }

  return Math.max(0, Math.min(13, tricks));
}

function bidContext(state: GameState, seat: Seat): {
  partnerBid: number | null;
  teamBid: number;
  bags: number;
} {
  const partner = partnerOf(seat);
  const partnerBid = state.bids[partner]?.value ?? null;
  let teamBid = 0;
  for (let index = 0; index < 4; index += 1) {
    if (teamOf(index) !== teamOf(seat)) continue;
    const bid = state.bids[index];
    if (bid && bid.value > 0) teamBid += bid.value;
  }
  return { partnerBid, teamBid, bags: state.bags[teamOf(seat)] };
}

export function chooseBid(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng = Math.random,
): BidChoice {
  if (state.phase !== 'bidding' || state.turn !== seat) return { value: 1, blind: false };
  if (!state.seen[seat]) {
    return { value: 0, blind: state.blindNilAllowed };
  }

  const hand = state.hands[seat];
  const strength = handStrength(hand);
  const groups = bySuit(hand);
  const context = bidContext(state, seat);
  const partnerNil = context.partnerBid === 0;
  const weak = strength <= 0.85;
  const veryWeak = strength <= 0.55;

  let value = Math.max(1, Math.min(13, Math.round(strength - 0.05)));

  if (partnerNil) value += 1;
  else if (context.partnerBid !== null && context.partnerBid >= 5) value -= 1;
  else if (context.partnerBid !== null && context.partnerBid <= 2) value += 1;

  if (context.bags >= 8 && strength >= 2) value += 1;

  const cap = Math.max(0, 13 - context.teamBid);
  if (value > cap) value = Math.max(1, cap);

  if (level === 'companion') {
    value = Math.max(1, value - (context.partnerBid !== null && context.partnerBid >= 4 ? 1 : 0));
    if (value > 5 && groups.S.length < 4) value -= 1;
    return { value: Math.max(1, Math.min(13, value)), blind: false };
  }

  if (level === 'easy') {
    if (rng() < 0.18) value = Math.max(1, Math.min(13, value + (rng() < 0.5 ? -1 : 1)));
    if (veryWeak && rng() < 0.3) return { value: 0, blind: false };
    return { value: Math.max(1, Math.min(13, value)), blind: false };
  }

  if (level === 'normal') {
    if (weak && context.partnerBid !== null && context.partnerBid >= 2) {
      return { value: 0, blind: false };
    }
    if (value < 1) value = 1;
    return { value: Math.max(1, Math.min(13, value)), blind: false };
  }

  // Hard: partner cover, bag risk, and a slightly more willing nil with cover.
  if (veryWeak && context.partnerBid !== null && context.partnerBid >= 2) {
    return { value: 0, blind: false };
  }
  if (weak && context.partnerBid !== null && context.partnerBid >= 4) {
    return { value: 0, blind: false };
  }
  if (groups.S.length >= 5 || groups.S.some((card) => card.rank === 'A')) {
    value += 1;
  }
  if (context.bags >= 8 && value >= 2) value += 1;
  return { value: Math.max(1, Math.min(13, value)), blind: false };
}

function currentWinner(trick: PlayedCard[]): number {
  return trickWinner(trick);
}

function teamNeed(state: GameState, seat: Seat): number {
  const team = teamOf(seat);
  return Math.max(0, teamContract(state, team) - teamEligibleTricks(state, team));
}

function hasNilBid(state: GameState, seat: number): boolean {
  return state.bids[seat]?.value === 0;
}

function cardScore(state: GameState, seat: Seat, card: Card): number {
  const team = teamOf(seat);
  const partner = partnerOf(seat);
  const trick = state.currentTrick;
  const led = trick.length > 0 ? trick[0].card.suit : null;
  const leading = trick.length === 0;
  const last = trick.length === 3;
  const myNil = hasNilBid(state, seat);
  const partnerNil = hasNilBid(state, partner);
  const need = teamNeed(state, seat);
  const bags = state.bags[team];
  const value = rank(card);
  const withCard: PlayedCard[] = [...trick, { seat, card }];
  const winner = currentWinner(withCard);
  const beforeWinner = trick.length > 0 ? currentWinner(trick) : -1;
  const wins = winner === seat;
  const partnerWins = beforeWinner === partner;
  const nilOpponentWinning =
    beforeWinner >= 0 && teamOf(beforeWinner) !== team && hasNilBid(state, beforeWinner);
  let score = 0;

  if (myNil) {
    if (wins) score -= 14;
    score += (14 - value) * 0.4;
    if (!leading && card.suit === 'S' && led !== 'S') score -= 3;
    return score;
  }

  if (leading) {
    score += (value - 8) * 0.08;
    if (card.suit === 'S') {
      score += 1.1;
      if (!state.spadesBroken) score -= 1.6;
      if (value >= 13) score += 1.4;
    } else if (value === 14) score += 3.4;
    else if (value === 13) score += 2;
    else if (value >= 12) score += 0.8;
    else score += 0.2;

    const sameSuit = state.hands[seat].filter((item) => item.suit === card.suit).length;
    if (sameSuit === 1 && card.suit !== 'S') score += 0.35;
    if (partnerNil && value >= 12) score += 1.1;
    if (need === 0 && bags >= 8) score -= (value - 7) * 0.18;
    return score;
  }

  if (partnerWins && !partnerNil) {
    score += (14 - value) * 0.15;
    if (wins) score -= 9;
    if (wins && last) score -= 4;
    return score;
  }

  if (partnerWins && partnerNil) {
    if (wins) {
      score += 6.5 + (14 - value) * 0.08;
      if (card.suit === 'S' && led !== 'S') score += 1;
    } else {
      score -= 1.5;
      score += (14 - value) * 0.08;
    }
    return score;
  }

  if (nilOpponentWinning) {
    score += wins ? -9 : 2.2;
    score += (14 - value) * 0.1;
    return score;
  }

  if (wins) {
    score += last ? 6 : 2.6;
    score += (14 - value) * 0.1;
    if (card.suit === 'S' && led !== 'S') score += 1.3;
    if (need === 0 && bags >= 8) score -= 5.5;
    if (last && need > 0) score += 2;
  } else {
    score += (14 - value) * 0.12;
    if (card.suit === 'S' && led !== 'S') score -= 1.1;
    if (last && need > 0) score -= 0.8;
  }
  return score;
}

function simulatedLegal(hand: Card[], trick: PlayedCard[], spadesBroken: boolean): Card[] {
  if (trick.length > 0) {
    const led = trick[0].card.suit;
    const following = hand.filter((card) => card.suit === led);
    return following.length > 0 ? following : hand.slice();
  }
  if (spadesBroken) return hand.slice();
  const nonSpades = hand.filter((card) => card.suit !== 'S');
  return nonSpades.length > 0 ? nonSpades : hand.slice();
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

function pickRandom<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] ?? items[0];
}

/**
 * Determinised trick simulation. It uses only public information: the AI hand,
 * played cards, the current trick and hand counts. Hidden hands are sampled.
 */
function winChance(
  state: GameState,
  seat: Seat,
  card: Card,
  rng: Rng,
  samples = 18,
): number {
  const known = new Set<string>();
  for (const item of state.hands[seat]) known.add(cardId(item));
  for (const item of state.played) known.add(cardId(item.card));
  for (const item of state.currentTrick) known.add(cardId(item.card));
  const pool = makeDeck().filter((item) => !known.has(cardId(item)));
  const others = [0, 1, 2, 3].filter((item) => item !== seat) as Seat[];
  const counts = others.map((item) => state.hands[item].length);
  if (pool.length < counts.reduce((sum, item) => sum + item, 0)) return 0;

  let wins = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const shuffled = shuffle(pool, rng);
    const hands = new Map<Seat, Card[]>();
    let cursor = 0;
    others.forEach((other, index) => {
      hands.set(other, shuffled.slice(cursor, cursor + counts[index]));
      cursor += counts[index];
    });
    const trick: PlayedCard[] = [...state.currentTrick, { seat, card }];
    let next = ((seat + 1) % 4) as Seat;
    while (trick.length < 4) {
      const hand = hands.get(next);
      if (!hand || hand.length === 0) break;
      const legal = simulatedLegal(hand, trick, state.spadesBroken);
      if (legal.length === 0) break;
      const picked = pickRandom(legal, rng);
      hand.splice(hand.findIndex((item) => cardId(item) === cardId(picked)), 1);
      trick.push({ seat: next, card: picked });
      next = ((next + 1) % 4) as Seat;
    }
    if (trick.length === 4 && trickWinner(trick) === seat) wins += 1;
  }
  return samples > 0 ? wins / samples : 0;
}

export function chooseCard(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng = Math.random,
): string {
  const legal = legalCards(state, seat);
  if (legal.length === 0) return '';
  if (legal.length === 1) return cardId(legal[0]);

  if (level === 'easy' && rng() < 0.35) {
    return cardId(pickRandom(legal, rng));
  }

  const scored = legal.map((card) => ({
    card,
    score: cardScore(state, seat, card) + (level === 'easy' ? (rng() - 0.5) * 1.2 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || SUIT_ORDER[a.card.suit] - SUIT_ORDER[b.card.suit]);

  if (level === 'hard') {
    const top = scored.slice(0, Math.min(4, scored.length));
    const need = teamNeed(state, seat);
    const bags = state.bags[teamOf(seat)];
    const weight = need > 0 ? 5 : bags >= 8 ? 2.4 : 3.6;
    let best = top[0];
    let bestScore = -Infinity;
    for (const item of top) {
      const chance = winChance(state, seat, item.card, rng);
      const finalScore = item.score + chance * weight;
      if (finalScore > bestScore + 1e-9) {
        best = item;
        bestScore = finalScore;
      }
    }
    return cardId(best.card);
  }

  if (level === 'companion') {
    const friendlier = scored.map((item) => ({
      ...item,
      score: item.score + (item.card.suit === 'S' ? -0.15 : 0),
    }));
    friendlier.sort((a, b) => b.score - a.score);
    return cardId(friendlier[0].card);
  }

  const winner = currentWinner(state.currentTrick);
  const partner = partnerOf(seat);
  const partnerWinning = winner === partner;
  if (level === 'normal' && partnerWinning && !hasNilBid(state, partner)) {
    const sorted = legal
      .slice()
      .sort((a, b) => rank(a) - rank(b));
    return cardId(sorted[0]);
  }

  const bestScore = scored[0].score;
  const ties = scored.filter((item) => Math.abs(item.score - bestScore) < 1e-9);
  return cardId(pickRandom(ties, rng).card);
}

export function chooseBidForHint(state: GameState, seat: Seat): BidChoice {
  return chooseBid(state, seat, 'hard', () => 0.5);
}

export interface BidHint {
  value: number;
  blind: boolean;
  kind: 'nil' | 'partnerCover' | 'strongSpades' | 'sideAces' | 'bagGuard' | 'balanced';
}

export function hintBid(state: GameState, seat: Seat): BidHint | null {
  if (state.phase !== 'bidding' || state.turn !== seat || !state.seen[seat]) return null;
  const choice = chooseBidForHint(state, seat);
  const hand = state.hands[seat];
  const groups = bySuit(hand);
  const spades = groups.S;
  const aces = hand.filter((card) => card.rank === 'A').length;
  let kind: BidHint['kind'] = 'balanced';
  if (choice.value === 0) kind = 'nil';
  else if (state.bids[partnerOf(seat)]?.value === 0) kind = 'partnerCover';
  else if (spades.length >= 5 || spades.some((card) => card.rank === 'A')) {
    kind = 'strongSpades';
  } else if (state.bags[teamOf(seat)] >= 8) kind = 'bagGuard';
  else if (aces >= 2) kind = 'sideAces';
  return { ...choice, kind };
}

export interface PlayHint {
  cardId: string;
  kind: 'win' | 'lead' | 'follow' | 'duck' | 'trump' | 'coverNil' | 'bagGuard' | 'low';
}

export function hintPlay(state: GameState, seat: Seat): PlayHint | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const id = chooseCard(state, seat, 'hard', () => 0.5);
  if (!id) return null;
  const card = state.hands[seat].find((item) => cardId(item) === id);
  if (!card) return null;
  const partner = partnerOf(seat);
  const partnerNil = state.bids[partner]?.value === 0;
  const myNil = state.bids[seat]?.value === 0;
  const before = currentWinner(state.currentTrick);
  const withCard: PlayedCard[] = [...state.currentTrick, { seat, card }];
  const after = currentWinner(withCard);
  const need = teamNeed(state, seat);
  const bags = state.bags[teamOf(seat)];
  const led = state.currentTrick.length > 0 ? state.currentTrick[0].card.suit : null;

  let kind: PlayHint['kind'];
  if (myNil) kind = 'low';
  else if (state.currentTrick.length === 0) kind = 'lead';
  else if (partnerNil && after === seat) kind = 'coverNil';
  else if (need === 0 && bags >= 8 && after !== seat) kind = 'bagGuard';
  else if (after === seat && card.suit === 'S' && led !== 'S') kind = 'trump';
  else if (after === seat) kind = 'win';
  else if (before === partner) kind = 'duck';
  else kind = 'follow';
  return { cardId: id, kind };
}

export function bidLabel(bid: Bid | null): string {
  if (!bid) return '';
  if (bid.value === 0) return bid.blind ? 'blind-nil' : 'nil';
  return String(bid.value);
}
