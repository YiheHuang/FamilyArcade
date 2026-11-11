import { DESSERT_IDS, type DessertId, type GameView, type HintReason, type AiLevel } from '../game/types';
import { scoreCards } from '../game/scoring';
import { CARD_DATA } from '../game/data';
import { chooseByRollout } from './rollout';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type Counts = Record<DessertId, number>;

function emptyCounts(): Counts {
  return { macaron: 0, tart: 0, eclair: 0, pudding: 0, candy: 0, cake: 0 };
}

// Card ids are stable; this table maps them to dessert types. The AI only sees
// public card data and the player view, never engine internals.
const CARD_DESSERT: DessertId[] = new Array(CARD_DATA.count);
for (const item of CARD_DATA.items) CARD_DESSERT[item.id] = item.type;

function countsOf(cards: readonly number[]): Counts {
  const counts = emptyCounts();
  for (const id of cards) {
    const dessert = CARD_DESSERT[id];
    if (dessert) counts[dessert] += 1;
  }
  return counts;
}

function potentialFor(count: number): number {
  if (count >= 4) return 0;
  if (count === 3) return 8;
  if (count === 2) return 4;
  if (count === 1) return 1.5;
  return 0;
}

function threatOf(count: number): number {
  if (count === 3) return 5;
  if (count === 2) return 2.5;
  if (count === 1) return 0.4;
  return 0;
}

export interface AiCandidate {
  cardId: number;
  score: number;
  avoidForCompanion: boolean;
  reason: HintReason;
}

interface Weights {
  own: number;
  combo: number;
  hand: number;
  denial: number;
  gift: number;
  crown: number;
  sampler: number;
  lookahead: number;
  noise: number;
}

const WEIGHTS: Record<AiLevel, Weights> = {
  companion: { own: 0.7, combo: 0.2, hand: 0.4, denial: 0, gift: 0, crown: 0.1, sampler: 0.6, lookahead: 0, noise: 4.0 },
  easy: { own: 1, combo: 0.7, hand: 0.4, denial: 0.2, gift: 0.2, crown: 0.2, sampler: 0.5, lookahead: 0, noise: 1.8 },
  normal: { own: 1, combo: 0.95, hand: 0.3, denial: 0.65, gift: 0.5, crown: 0.7, sampler: 0.8, lookahead: 0.1, noise: 0.55 },
  hard: { own: 1, combo: 0.95, hand: 0.3, denial: 0.65, gift: 0.5, crown: 0.7, sampler: 0.8, lookahead: 0, noise: 0.02 },
};

function nextSeat(view: GameView, seat: number): number {
  const step = view.passDirection === 'left' ? 1 : -1;
  return (seat + step + view.playerCount) % view.playerCount;
}

function evaluateCandidate(view: GameView, cardId: number, level: AiLevel, rng: () => number): AiCandidate {
  const w = WEIGHTS[level];
  const mySeat = view.mySeat ?? 0;
  const myRound = view.seats[mySeat].roundCollected;
  const myCards = [...myRound, cardId];
  const ownBase = scoreCards(myRound, mySeat).total;
  const ownNow = scoreCards(myCards, mySeat).total;
  const gainNow = ownNow - ownBase;
  const myCounts = countsOf(view.seats[mySeat].roundCollected);
  const handCounts = countsOf(view.myHand.filter((id) => id !== cardId));
  const dessert = CARD_DESSERT[cardId];
  const newCount = myCounts[dessert] + 1;

  const combo = potentialFor(newCount);
  let handPotential = Math.min(2, handCounts[dessert]) * 0.8;
  for (const type of DESSERT_IDS) {
    if (type === dessert) continue;
    const total = myCounts[type] + Math.min(handCounts[type], 4 - myCounts[type]);
    handPotential += potentialFor(total) * 0.32;
  }

  // Sampler potential: a third different dessert among the cards already taken.
  const typesNow = new Set(myCards.map((id) => CARD_DESSERT[id])).size;
  let sampler = 0;
  if (typesNow === 3) sampler = 1.4;
  else if (typesNow === 2) {
    const third = DESSERT_IDS.some(
      (type) => !myCards.some((id) => CARD_DESSERT[id] === type) && handCounts[type] > 0,
    );
    if (third) sampler = 1.1;
  }

  // The next player receives the rest of this hand. Value the best card they
  // could take, and the card we are removing from their reach.
  const recipient = nextSeat(view, mySeat);
  const recipientSeat = view.seats[recipient];
  const recipientBase = scoreCards(recipientSeat.roundCollected, recipient).total;
  const canTake = (id: number) => scoreCards([...recipientSeat.roundCollected, id], recipient).total - recipientBase;
  const denyNext = Math.max(0, canTake(cardId));
  let gift = 0;
  for (const id of view.myHand) {
    if (id === cardId) continue;
    gift = Math.max(gift, canTake(id));
  }

  // Other opponents are further away; use a light threat estimate.
  const lastCopyOfType = view.myHand.filter((id) => CARD_DESSERT[id] === dessert).length === 1;
  let denial = denyNext;
  for (const seat of view.seats) {
    if (seat.seat === mySeat || seat.seat === recipient) continue;
    const threat = threatOf(countsOf(seat.roundCollected)[dessert]);
    if (threat > 0) denial += threat * (lastCopyOfType ? 0.5 : 0.2);
  }

  // Crown race: nudge toward a type where this player is close to the table lead.
  const totalCounts = countsOf(view.seats[mySeat].collected);
  const others = view.seats
    .filter((seat) => seat.seat !== mySeat)
    .map((seat) => countsOf(seat.collected)[dessert]);
  const myTotal = totalCounts[dessert] + 1;
  const bestOther = Math.max(0, ...others);
  const crown = myTotal > bestOther ? 1.2 : myTotal === bestOther ? 0.6 : 0.15;

  // Hard's two-pick lookahead is only exact with two players: the hand we pass
  // comes straight back, so we know both players' options for the next pick.
  let lookahead = 0;
  if (w.lookahead > 0 && view.playerCount === 2) {
    const remaining = view.myHand.filter((id) => id !== cardId);
    let bestOpp = recipientBase;
    let bestOppCard: number | null = null;
    for (const id of remaining) {
      const total = scoreCards([...recipientSeat.roundCollected, id], recipient).total;
      if (total > bestOpp) {
        bestOpp = total;
        bestOppCard = id;
      }
    }
    if (bestOppCard !== null) {
      const afterOpp = remaining.filter((id) => id !== bestOppCard);
      let bestOwn = ownNow;
      for (const id of afterOpp) {
        const total = scoreCards([...myCards, id], mySeat).total;
        if (total > bestOwn) bestOwn = total;
      }
      lookahead = bestOwn - ownNow - (bestOpp - recipientBase);
    }
  }

  // Companion promise: if a human opponent is one card from a triple/quad and this
  // is the last copy of that dessert in our hand, flag it. The chooser will avoid
  // it whenever another candidate exists.
  let avoidForCompanion = false;
  if (level === 'companion' && lastCopyOfType) {
    for (const seat of view.seats) {
      if (seat.seat === mySeat || seat.kind !== 'human') continue;
      const count = countsOf(seat.roundCollected)[dessert];
      if (count === 2 || count === 3) {
        avoidForCompanion = true;
        break;
      }
    }
  }

  const noise = (rng() * 2 - 1) * w.noise;
  const score =
    gainNow * w.own +
    combo * w.combo +
    handPotential * w.hand +
    denial * w.denial +
    crown * w.crown +
    sampler * w.sampler +
    lookahead * w.lookahead -
    gift * w.gift +
    noise;

  return {
    cardId,
    score,
    avoidForCompanion,
    reason: explainCandidate(view, cardId, denial, sampler),
  };
}

function explainCandidate(view: GameView, cardId: number, denial: number, sampler: number): HintReason {
  const mySeat = view.mySeat ?? 0;
  const dessert = CARD_DESSERT[cardId];
  const count = countsOf(view.seats[mySeat].roundCollected)[dessert] + 1;
  if (count >= 4) return { key: 'hint.quad', params: { dessert } };
  if (count === 3) return { key: 'hint.triple', params: { dessert } };
  if (count === 2) return { key: 'hint.pair', params: { dessert } };
  if (sampler >= 1.1) return { key: 'hint.sampler', params: { dessert } };
  if (denial >= 4) return { key: 'hint.deny', params: { dessert } };
  return { key: 'hint.potential', params: { dessert } };
}

export function evaluatePick(view: GameView, cardId: number, level: AiLevel, rng: () => number): AiCandidate {
  return evaluateCandidate(view, cardId, level, rng);
}

export function choosePick(view: GameView, level: AiLevel, budgetMs: number, rng: () => number): number | null {
  if (view.phase !== 'choosing' || view.mySeat === null || view.myHand.length === 0) return null;
  if (view.myPending !== null) return null;

  const deadline = now() + Math.max(5, budgetMs);
  const candidates: AiCandidate[] = [];
  // Keep a stable order so equal scores resolve deterministically.
  const hand = [...view.myHand].sort((a, b) => a - b);
  for (const cardId of hand) {
    candidates.push(evaluateCandidate(view, cardId, level, rng));
    if (now() > deadline && candidates.length > 0) break;
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.cardId - b.cardId);

  if (level === 'companion') {
    const safe = candidates.filter((candidate) => !candidate.avoidForCompanion);
    const pool = safe.length > 0 ? safe : candidates;
    if (pool.length > 1 && rng() < 0.45) {
      const shuffled = pool.slice(0, Math.min(4, pool.length));
      return shuffled[Math.floor(rng() * shuffled.length)].cardId;
    }
    return pool[0].cardId;
  }

  if (level === 'easy') {
    const pool = candidates.slice(0, Math.min(4, candidates.length));
    if (pool.length > 1 && rng() < 0.28) {
      return pool[Math.floor(rng() * pool.length)].cardId;
    }
    return candidates[0].cardId;
  }

  if (level === 'normal') {
    if (now() < deadline) {
      const rolled = chooseByRollout(
        view,
        candidates.map((candidate) => candidate.cardId),
        rng,
        deadline,
        4,
      );
      if (rolled !== null) return rolled;
    }
    return candidates[0].cardId;
  }

  if (level === 'hard' && now() < deadline) {
    const rolled = chooseByRollout(
      view,
      candidates.map((candidate) => candidate.cardId),
      rng,
      deadline,
    );
    if (rolled !== null) return rolled;
  }

  return candidates[0].cardId;
}

export function explainPick(view: GameView, cardId: number): HintReason {
  const candidate = evaluateCandidate(view, cardId, 'normal', () => 0.5);
  return candidate.reason;
}

export function pickWeight(level: AiLevel): Weights {
  return { ...WEIGHTS[level] };
}
