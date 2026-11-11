import { CARD_IDS } from '../game/data';
import { scoreCards } from '../game/scoring';
import type { GameView } from '../game/types';

const PICKS = 8;

function passHands(hands: number[][], direction: 'left' | 'right'): number[][] {
  const count = hands.length;
  const step = direction === 'left' ? 1 : -1;
  const next: number[][] = Array.from({ length: count }, () => []);
  for (let seat = 0; seat < count; seat++) {
    next[(seat + step + count) % count] = hands[seat];
  }
  return next;
}

function greedyCard(hand: readonly number[], collected: readonly number[]): number {
  const base = scoreCards(collected).total;
  let best = hand[0];
  let bestGain = -Infinity;
  for (const id of hand) {
    const gain = scoreCards([...collected, id]).total - base;
    if (gain > bestGain || (gain === bestGain && id < best)) {
      bestGain = gain;
      best = id;
    }
  }
  return best;
}

function remove(hand: number[], cardId: number): void {
  const index = hand.indexOf(cardId);
  if (index >= 0) hand.splice(index, 1);
}

/**
 * One simulated world: sample the opponents' current hands from the cards we
 * cannot see, then finish the round with a simple greedy policy for everyone.
 * Returns our final round score minus the best opponent's.
 */
function simulate(view: GameView, candidate: number, world: number[][], mySeat: number): number {
  const hands = world.map((hand) => [...hand]);
  hands[mySeat] = view.myHand.filter((id) => id !== candidate);
  const collected = view.seats.map((seat) => [...seat.roundCollected]);
  collected[mySeat].push(candidate);

  // This pick: opponents still choose one card each.
  for (let seat = 0; seat < view.playerCount; seat++) {
    if (seat === mySeat) continue;
    const card = greedyCard(hands[seat], collected[seat]);
    remove(hands[seat], card);
    collected[seat].push(card);
  }
  let next = passHands(hands, view.passDirection);

  for (let pick = view.pickIndex + 1; pick < PICKS; pick++) {
    for (let seat = 0; seat < view.playerCount; seat++) {
      const card = greedyCard(next[seat], collected[seat]);
      remove(next[seat], card);
      collected[seat].push(card);
    }
    next = passHands(next, view.passDirection);
  }

  const totals = collected.map((cards) => scoreCards(cards).total);
  const opponents = totals.filter((_, seat) => seat !== mySeat);
  return totals[mySeat] - Math.max(...opponents);
}

function sampleWorlds(view: GameView, count: number, rng: () => number): number[][][] {
  const mySeat = view.mySeat ?? 0;
  const known = new Set<number>([...view.myHand, ...view.seats.flatMap((seat) => seat.roundCollected)]);
  const pool = CARD_IDS.filter((id) => !known.has(id));
  const handSize = view.myHand.length;
  const opponents = view.playerCount - 1;
  const needed = opponents * handSize;
  if (pool.length < needed) {
    // This should be impossible for a legal view; fail safe to an empty sample.
    return [];
  }
  const worlds: number[][][] = [];
  for (let sample = 0; sample < count; sample++) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const hands: number[][] = Array.from({ length: view.playerCount }, () => []);
    let cursor = 0;
    for (let seat = 0; seat < view.playerCount; seat++) {
      if (seat === mySeat) continue;
      hands[seat] = shuffled.slice(cursor, cursor + handSize);
      cursor += handSize;
    }
    worlds.push(hands);
  }
  return worlds;
}

/**
 * Hard uses sampled hidden-hand rollouts. It never reads another hand; it only
 * samples cards from the set that is public knowledge to be outside this view.
 * If the budget runs out, returns the best candidate found so far.
 */
export function chooseByRollout(
  view: GameView,
  cardIds: readonly number[],
  rng: () => number,
  deadline: number,
  maxSamples?: number,
): number | null {
  if (view.mySeat === null || cardIds.length === 0) return null;
  const preferred = view.playerCount <= 2 ? 32 : view.playerCount === 3 ? 24 : 16;
  const sampleCount = Math.max(1, Math.min(maxSamples ?? preferred, preferred));
  const worlds = sampleWorlds(view, sampleCount, rng);
  if (worlds.length === 0) return null;

  let best = cardIds[0];
  let bestValue = -Infinity;
  for (const cardId of cardIds) {
    let value = 0;
    for (const world of worlds) {
      value += simulate(view, cardId, world, view.mySeat);
      if (performance.now() > deadline) break;
    }
    value /= worlds.length;
    if (value > bestValue || (value === bestValue && cardId < best)) {
      bestValue = value;
      best = cardId;
    }
    if (performance.now() > deadline) break;
  }
  return best;
}
