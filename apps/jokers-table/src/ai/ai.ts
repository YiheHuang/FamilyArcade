/**
 * Four deterministic AI levels. Every decision is made from the public run
 * state; the RNG is injected and is used only to make weaker levels less exact.
 */

import {
  discardCards,
  nextBlind,
  playCards,
  previewScore,
  type RunState,
} from '../game/run';
import { cardPotential, type ScoreBreakdown } from '../game/score';
import { buyOffer, rerollShop, type ShopOffer } from '../game/run';
import { rankChip, type Card, type HandType } from '../game/cards';
import { MAX_PLAY, type EnhancementId } from '../game/content';

export type AiLevel = 'companion' | 'easy' | 'normal' | 'hard';

export const AI_LEVELS: readonly AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

export interface BestPlay {
  cards: Card[];
  score: ScoreBreakdown;
}

export interface AiAction {
  type: 'play' | 'discard';
  cards: string[];
  score: number;
}

export interface Hint {
  cards: string[];
  handType: HandType;
  total: number;
  chips: number;
  mult: number;
  clears: boolean;
  type: 'play';
}

export function bestPlayFor(run: RunState): BestPlay | null {
  if (run.phase !== 'blind' || run.hand.length === 0) return null;
  const hand = run.hand;
  let best: BestPlay | null = null;
  const totalMasks = 1 << hand.length;
  for (let mask = 1; mask < totalMasks; mask += 1) {
    let count = 0;
    for (let bit = 0; bit < hand.length; bit += 1) {
      if (mask & (1 << bit)) count += 1;
    }
    if (count > MAX_PLAY) continue;
    const cards = hand.filter((_, index) => mask & (1 << index));
    const ids = cards.map((card) => card.id);
    const score = previewScore(run, ids);
    if (!score) continue;
    if (!best || score.total > best.score.total) {
      best = { cards, score };
    }
  }
  return best;
}

function randomSubset(run: RunState, rng: () => number): string[] {
  const count = 1 + Math.floor(rng() * Math.min(MAX_PLAY, run.hand.length));
  const order = run.hand
    .map((card, index) => ({ card, sort: rng(), index }))
    .sort((a, b) => a.sort - b.sort || a.index - b.index)
    .slice(0, count)
    .map((item) => item.card.id);
  return order;
}

function discardChoice(run: RunState, protect: string[], count: number): string[] {
  const available = run.hand
    .filter((card) => !protect.includes(card.id))
    .slice()
    .sort((a, b) => cardPotential(a) - cardPotential(b));
  return available.slice(0, Math.min(count, available.length)).map((card) => card.id);
}

export function chooseAction(
  run: RunState,
  level: AiLevel,
  rng: () => number,
  risk = 0,
): AiAction | null {
  if (run.phase !== 'blind') return null;
  const best = bestPlayFor(run);
  if (!best) return null;
  const blind = run.plan[run.blindIndex];
  const ratio = blind ? best.score.total / blind.target : 0;
  const protect = best.cards.map((card) => card.id);
  const desperation = Math.max(0, Math.min(1, risk));

  if (level === 'companion') {
    if (rng() < 0.68) return { type: 'play', cards: protect, score: best.score.total };
    const fallback = randomSubset(run, rng);
    const score = previewScore(run, fallback)?.total ?? best.score.total;
    return { type: 'play', cards: fallback, score };
  }

  if (level === 'easy') {
    if (rng() < 0.44) return { type: 'play', cards: protect, score: best.score.total };
    const fallback = randomSubset(run, rng);
    const score = previewScore(run, fallback)?.total ?? 0;
    return { type: 'play', cards: fallback, score };
  }

  if (level === 'normal') {
    const threshold = 0.16 + desperation * 0.08;
    if (ratio < threshold && run.discardsLeft > 0 && run.handsLeft > 1 && run.boss !== 'rulebook') {
      const ids = discardChoice(run, protect, 3 + Math.round(desperation));
      if (ids.length > 0) return { type: 'discard', cards: ids, score: 0 };
    }
    return { type: 'play', cards: protect, score: best.score.total };
  }

  const threshold = 0.24 + desperation * 0.12;
  if (ratio < threshold && run.discardsLeft > 0 && run.handsLeft > 1 && run.boss !== 'rulebook') {
    const ids = discardChoice(run, protect, 4 + Math.round(desperation));
    if (ids.length > 0) return { type: 'discard', cards: ids, score: 0 };
  }
  return { type: 'play', cards: protect, score: best.score.total };
}

/** Play a complete blind. Used for AI rivals and screenshot fixtures. */
export function autoPlayBlind(
  run: RunState,
  level: AiLevel,
  rng: () => number,
  risk = 0,
): RunState {
  let state = run;
  let guard = 0;
  while (state.phase === 'blind' && guard < 40) {
    guard += 1;
    const action = chooseAction(state, level, rng, risk);
    if (!action) break;
    const result =
      action.type === 'play'
        ? playCards(state, action.cards)
        : discardCards(state, action.cards);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

function enhancementTarget(run: RunState): Card | undefined {
  return run.deck
    .filter((card) => !card.enhance)
    .slice()
    .sort((a, b) => rankChip(b.rank) - rankChip(a.rank) || a.id.localeCompare(b.id))[0];
}

function firstAffordable(
  run: RunState,
  kinds: ShopOffer['kind'][],
): { index: number; offer: ShopOffer } | null {
  for (let index = 0; index < run.offers.length; index += 1) {
    const offer = run.offers[index];
    if (!offer) continue;
    if (!kinds.includes(offer.kind)) continue;
    if (offer.price > run.money) continue;
    if (offer.kind === 'joker' && run.jokers.length >= 4) continue;
    if (offer.kind === 'joker' && run.jokers.includes(offer.joker)) continue;
    if (offer.kind === 'voucher' && run.vouchers.includes(offer.voucher)) continue;
    return { index, offer };
  }
  return null;
}

/**
 * Spend money with a little discipline. The returned run is still in the shop;
 * the caller decides when to call nextBlind().
 */
export function autoShop(
  run: RunState,
  level: AiLevel,
  rng: () => number,
  risk = 0,
): RunState {
  if (run.phase !== 'shop') return run;
  let state = run;
  let guard = 0;
  const desperate = Math.max(0, Math.min(1, risk));

  if (level === 'hard' && state.money >= (desperate > 0 ? 8 : 10)) {
    const hasJoker = state.offers.some((offer) => offer?.kind === 'joker');
    if (!hasJoker && rng() < 0.55 + desperate * 0.2) {
      const reroll = rerollShop(state);
      if (reroll.ok) state = reroll.state;
    }
  }

  while (guard < (desperate > 0 ? 12 : 8)) {
    guard += 1;
    const kinds: ShopOffer['kind'][] =
      level === 'companion'
        ? ['joker']
        : level === 'easy'
          ? ['joker', 'enhancement']
          : ['joker', 'voucher', 'enhancement'];
    const pick = firstAffordable(state, kinds);
    if (!pick) break;
    const target =
      pick.offer.kind === 'enhancement' ? enhancementTarget(state)?.id : undefined;
    if (pick.offer.kind === 'enhancement' && !target) break;
    if (level === 'companion' && state.money < pick.offer.price + 2) break;
    const bought = buyOffer(state, pick.index, target);
    if (!bought.ok) break;
    state = bought.state;
    if (level === 'companion' || level === 'easy') break;
  }
  return state;
}

export function hintFor(run: RunState): Hint | null {
  const best = bestPlayFor(run);
  if (!best) return null;
  const blind = run.plan[run.blindIndex];
  return {
    cards: best.cards.map((card) => card.id),
    handType: best.score.hand.type,
    total: best.score.total,
    chips: best.score.chips,
    mult: best.score.mult,
    clears: Boolean(blind && run.blindScore + best.score.total >= blind.target),
    type: 'play',
  };
}

/** Used by fixtures to advance a run without a human. */
export function advanceShopAndBlind(
  run: RunState,
  level: AiLevel,
  rng: () => number,
  risk = 0,
): RunState {
  const shopped = autoShop(run, level, rng, risk);
  const next = nextBlind(shopped);
  return next.ok ? next.state : shopped;
}

export function enhancedTargetIds(run: RunState): string[] {
  return run.deck.filter((card) => card.enhance).map((card) => card.id);
}

export type { EnhancementId };
