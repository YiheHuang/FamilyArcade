/**
 * Joker's Table · pure run engine.
 *
 * A run is six antes of three blinds. All randomness is derived from the seed:
 * no clock, DOM, network or Math.random. The complete draw pile is stored, so a
 * saved run resumes exactly where it stopped.
 */

import {
  DECKS,
  DECK_BY_ID,
  ENHANCEMENTS,
  HAND_SIZE,
  JOKERS,
  JOKER_BY_ID,
  JOKER_SLOTS,
  MAX_PLAY,
  VOUCHERS,
  VOUCHER_BY_ID,
  createBlindPlan,
  isEnhancementId,
  isJokerId,
  isVoucherId,
  type BlindKind,
  type BlindPlan,
  type BossId,
  type DeckId,
  type EnhancementId,
  type JokerId,
  type VoucherId,
} from './content';
import {
  deriveSeed,
  hashSeed,
  makeDeck,
  mulberry32,
  shuffledWithSeed,
  sortCards,
  type Card,
  type HandType,
} from './cards';
import { scorePlayedCards, type ScoreBreakdown } from './score';

export type RunPhase = 'blind' | 'cleared' | 'failed' | 'shop' | 'complete';

export type ShopOffer =
  | { kind: 'joker'; joker: JokerId; price: number }
  | { kind: 'enhancement'; enhancement: EnhancementId; price: number }
  | { kind: 'voucher'; voucher: VoucherId; price: number };

export interface RewardBreakdown {
  base: number;
  unusedHands: number;
  interest: number;
  treasurer: number;
  patron: number;
  total: number;
}

export interface RunState {
  seed: number;
  seedText: string;
  deckId: DeckId;
  plan: BlindPlan[];
  blindIndex: number;
  phase: RunPhase;
  deck: Card[];
  drawPile: Card[];
  discardPile: Card[];
  hand: Card[];
  jokers: JokerId[];
  vouchers: VoucherId[];
  money: number;
  blindScore: number;
  totalScore: number;
  bestHandScore: number;
  bestHandType: HandType | null;
  handsLeft: number;
  discardsLeft: number;
  handsPlayed: number;
  discardsUsed: number;
  discardedCards: number;
  boss: BossId | null;
  lastHand: ScoreBreakdown | null;
  lastReward: RewardBreakdown | null;
  offers: (ShopOffer | null)[];
  shopRoll: number;
}

export type RunError =
  | 'bad-phase'
  | 'bad-count'
  | 'not-in-hand'
  | 'duplicate-card'
  | 'no-discards'
  | 'not-enough-money'
  | 'slots-full'
  | 'already-owned'
  | 'no-offer'
  | 'need-target'
  | 'bad-target'
  | 'no-joker'
  | 'shop-closed';

export interface RunResult {
  ok: boolean;
  state: RunState;
  error?: RunError;
}

export interface CreateRunOptions {
  seed: number | string;
  deckId: DeckId;
  plan?: BlindPlan[];
  finales?: boolean;
}

export function createRun(options: CreateRunOptions): RunState {
  const seed = hashSeed(options.seed);
  const deckId = options.deckId;
  const plan = options.plan ?? createBlindPlan(seed, deckId, options.finales ?? false);
  const deckDef = DECK_BY_ID[deckId];
  let deck = makeDeck();

  if (deckDef.giltCards > 0) {
    const order = shuffledWithSeed(
      deck.map((_, index) => index),
      deriveSeed(seed, 0xb4a55, 17),
    );
    deck = deck.map((card, index) => {
      if (!order.slice(0, deckDef.giltCards).includes(index)) return card;
      return { ...card, enhance: 'gilt' as const };
    });
  }

  const base: RunState = {
    seed,
    seedText: String(options.seed),
    deckId,
    plan,
    blindIndex: 0,
    phase: 'blind',
    deck,
    drawPile: [],
    discardPile: [],
    hand: [],
    jokers: [],
    vouchers: [],
    money: deckDef.startMoney,
    blindScore: 0,
    totalScore: 0,
    bestHandScore: 0,
    bestHandType: null,
    handsLeft: 0,
    discardsLeft: 0,
    handsPlayed: 0,
    discardsUsed: 0,
    discardedCards: 0,
    boss: null,
    lastHand: null,
    lastReward: null,
    offers: [],
    shopRoll: 0,
  };
  return beginBlind(base, 0);
}

export function currentBlind(run: RunState): BlindPlan {
  return run.plan[run.blindIndex] ?? run.plan[run.plan.length - 1];
}

export function currentAnte(run: RunState): number {
  return currentBlind(run).ante;
}

export function currentKind(run: RunState): BlindKind {
  return currentBlind(run).kind;
}

export function handLimit(run: RunState): number {
  const bonus = run.vouchers.includes('extraHand') ? 1 : 0;
  return (run.boss === 'shortBell' ? 3 : 4) + bonus;
}

export function discardLimit(run: RunState): number {
  const deck = DECK_BY_ID[run.deckId];
  const bonus = run.vouchers.includes('extraDiscard') ? 1 : 0;
  return 3 + deck.extraDiscards + bonus;
}

export function enhancedCount(run: RunState): number {
  return run.deck.filter((card) => card.enhance).length;
}

export function jokerActive(run: RunState, index: number): boolean {
  return !(run.boss === 'mirrorwright' && index === 0);
}

function beginBlind(run: RunState, index: number): RunState {
  if (index >= run.plan.length) {
    return { ...run, phase: 'complete', blindIndex: run.blindIndex };
  }
  const blind = run.plan[index];
  const deck = run.deck.map((card) => ({ ...card }));
  const shuffled = shuffledWithSeed(deck, deriveSeed(run.seed, index, 0x51f7));
  const hand = shuffled.slice(0, HAND_SIZE).map((card) => ({ ...card }));
  const drawPile = shuffled.slice(HAND_SIZE).map((card) => ({ ...card }));
  const next: RunState = {
    ...run,
    blindIndex: index,
    phase: 'blind',
    deck,
    hand,
    drawPile,
    discardPile: [],
    blindScore: 0,
    handsLeft: 0,
    discardsLeft: 0,
    handsPlayed: 0,
    discardsUsed: 0,
    discardedCards: 0,
    boss: blind.boss,
    lastHand: null,
    lastReward: null,
    offers: [],
    shopRoll: 0,
  };
  return {
    ...next,
    handsLeft: handLimit(next),
    discardsLeft: discardLimit(next),
  };
}

function recycleDiscard(run: RunState): { drawPile: Card[]; discardPile: Card[] } {
  if (run.drawPile.length > 0 || run.discardPile.length === 0) {
    return { drawPile: run.drawPile, discardPile: run.discardPile };
  }
  const shuffled = shuffledWithSeed(
    run.discardPile,
    deriveSeed(run.seed, run.blindIndex, 0xd00d, run.handsPlayed, run.discardsUsed),
  );
  return { drawPile: shuffled, discardPile: [] };
}

function drawToSize(run: RunState, size = HAND_SIZE): RunState {
  const hand = run.hand.slice();
  let drawPile = run.drawPile.slice();
  let discardPile = run.discardPile.slice();
  while (hand.length < size && (drawPile.length > 0 || discardPile.length > 0)) {
    if (drawPile.length === 0) {
      const recycled = recycleDiscard({ ...run, hand, drawPile, discardPile });
      drawPile = recycled.drawPile.slice();
      discardPile = recycled.discardPile.slice();
      if (drawPile.length === 0) break;
    }
    const card = drawPile.pop();
    if (card) hand.push(card);
  }
  return { ...run, hand: sortCards(hand), drawPile, discardPile };
}

function selectedCards(run: RunState, ids: readonly string[]): Card[] | null {
  if (ids.length === 0 || ids.length > MAX_PLAY) return null;
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const id of ids) {
    if (seen.has(id)) return null;
    seen.add(id);
    const card = run.hand.find((item) => item.id === id);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

export function previewScore(run: RunState, ids: readonly string[]): ScoreBreakdown | null {
  const played = selectedCards(run, ids);
  if (!played) return null;
  const remaining = run.hand.filter((card) => !ids.includes(card.id));
  return scorePlayedCards({
    played,
    handRemaining: remaining,
    jokers: run.jokers,
    boss: run.boss,
    discardsLeft: run.discardsLeft,
    discardsUsed: run.discardsUsed,
  });
}

export function playCards(run: RunState, ids: readonly string[]): RunResult {
  if (run.phase !== 'blind') return { ok: false, state: run, error: 'bad-phase' };
  if (run.handsLeft <= 0) return { ok: false, state: run, error: 'bad-phase' };
  const played = selectedCards(run, ids);
  if (!played) return { ok: false, state: run, error: 'not-in-hand' };
  if (new Set(ids).size !== ids.length) return { ok: false, state: run, error: 'duplicate-card' };

  const moneyAfterTax = run.boss === 'taxCollector' ? Math.max(0, run.money - 2) : run.money;
  const remaining = run.hand.filter((card) => !ids.includes(card.id));
  const breakdown = scorePlayedCards({
    played,
    handRemaining: remaining,
    jokers: run.jokers,
    boss: run.boss,
    discardsLeft: run.discardsLeft,
    discardsUsed: run.discardsUsed,
  });

  const next: RunState = {
    ...run,
    money: moneyAfterTax,
    hand: remaining,
    discardPile: [...run.discardPile, ...played],
    blindScore: run.blindScore + breakdown.total,
    totalScore: run.totalScore + breakdown.total,
    bestHandScore: Math.max(run.bestHandScore, breakdown.total),
    bestHandType:
      breakdown.total > run.bestHandScore ? breakdown.hand.type : run.bestHandType,
    handsPlayed: run.handsPlayed + 1,
    handsLeft: run.handsLeft - 1,
    lastHand: breakdown,
  };

  const filled = drawToSize(next);
  const blind = currentBlind(filled);
  if (filled.blindScore >= blind.target) {
    const reward = blindReward(filled, true);
    return {
      ok: true,
      state: {
        ...filled,
        phase: 'cleared',
        money: filled.money + reward.total,
        lastReward: reward,
      },
    };
  }
  if (filled.handsLeft <= 0) {
    const reward = blindReward(filled, false);
    return {
      ok: true,
      state: {
        ...filled,
        phase: 'failed',
        money: filled.money + reward.total,
        lastReward: reward,
      },
    };
  }
  return { ok: true, state: filled };
}

export function discardCards(run: RunState, ids: readonly string[]): RunResult {
  if (run.phase !== 'blind') return { ok: false, state: run, error: 'bad-phase' };
  if (run.discardsLeft <= 0) return { ok: false, state: run, error: 'no-discards' };
  if (run.boss === 'rulebook') return { ok: false, state: run, error: 'no-discards' };
  const cards = selectedCards(run, ids);
  if (!cards) return { ok: false, state: run, error: 'not-in-hand' };
  const remaining = run.hand.filter((card) => !ids.includes(card.id));
  const next: RunState = {
    ...run,
    hand: remaining,
    discardPile: [...run.discardPile, ...cards],
    discardsLeft: run.discardsLeft - 1,
    discardsUsed: run.discardsUsed + 1,
    discardedCards: run.discardedCards + cards.length,
    lastHand: null,
  };
  return { ok: true, state: drawToSize(next) };
}

export function blindReward(run: RunState, cleared: boolean): RewardBreakdown {
  const blind = currentBlind(run);
  const base = cleared ? blind.reward : 0;
  const unusedHands = cleared ? run.handsLeft : 0;
  const coinPress = run.vouchers.includes('coinPress');
  const step = coinPress ? 4 : 5;
  const cap = coinPress ? 7 : 5;
  const interest = Math.min(cap, Math.floor(Math.max(0, run.money) / step));
  const treasurer = cleared && run.jokers.includes('treasurer') ? 2 : 0;
  const patron = cleared && run.jokers.includes('patron') ? run.handsLeft : 0;
  const total = base + unusedHands + interest + treasurer + patron;
  return { base, unusedHands, interest, treasurer, patron, total };
}

function discounted(price: number, vouchers: readonly VoucherId[]): number {
  return Math.max(1, price - (vouchers.includes('patronsMark') ? 1 : 0));
}

export function generateOffers(run: RunState): (ShopOffer | null)[] {
  const rng = mulberry32(deriveSeed(run.seed, run.blindIndex, 0x5a17, run.shopRoll));
  const usedJokers = new Set<JokerId>();
  const usedEnhancements = new Set<EnhancementId>();
  const usedVouchers = new Set<VoucherId>();
  const offers: (ShopOffer | null)[] = [];

  for (let slot = 0; slot < 3; slot += 1) {
    const jokers = JOKERS.filter(
      (joker) => !run.jokers.includes(joker.id) && !usedJokers.has(joker.id),
    );
    const enhancements = ENHANCEMENTS.filter((item) => !usedEnhancements.has(item.id));
    const vouchers = VOUCHERS.filter(
      (item) => !run.vouchers.includes(item.id) && !usedVouchers.has(item.id),
    );
    const roll = rng();
    let kind: ShopOffer['kind'];
    if (jokers.length > 0 && roll < 0.58) kind = 'joker';
    else if (vouchers.length > 0 && roll < 0.78) kind = 'voucher';
    else if (enhancements.length > 0) kind = 'enhancement';
    else if (jokers.length > 0) kind = 'joker';
    else if (vouchers.length > 0) kind = 'voucher';
    else break;

    if (kind === 'joker') {
      const pick = jokers[Math.min(jokers.length - 1, Math.floor(rng() * jokers.length))];
      usedJokers.add(pick.id);
      offers.push({
        kind: 'joker',
        joker: pick.id,
        price: discounted(JOKER_BY_ID[pick.id].price, run.vouchers),
      });
    } else if (kind === 'voucher') {
      const pick = vouchers[Math.min(vouchers.length - 1, Math.floor(rng() * vouchers.length))];
      usedVouchers.add(pick.id);
      offers.push({
        kind: 'voucher',
        voucher: pick.id,
        price: discounted(VOUCHER_BY_ID[pick.id].price, run.vouchers),
      });
    } else {
      const pick =
        enhancements[Math.min(enhancements.length - 1, Math.floor(rng() * enhancements.length))];
      usedEnhancements.add(pick.id);
      offers.push({
        kind: 'enhancement',
        enhancement: pick.id,
        price: discounted(pick.price, run.vouchers),
      });
    }
  }
  return offers;
}

export function enterShop(run: RunState): RunResult {
  if (run.phase !== 'cleared' && run.phase !== 'failed') {
    return { ok: false, state: run, error: 'bad-phase' };
  }
  const shop: RunState = { ...run, phase: 'shop', shopRoll: 0 };
  return { ok: true, state: { ...shop, offers: generateOffers(shop) } };
}

export function nextBlind(run: RunState): RunResult {
  if (run.phase !== 'shop') return { ok: false, state: run, error: 'shop-closed' };
  if (run.blindIndex + 1 >= run.plan.length) {
    return { ok: true, state: { ...run, phase: 'complete', offers: [] } };
  }
  return { ok: true, state: beginBlind(run, run.blindIndex + 1) };
}

export function buyOffer(
  run: RunState,
  index: number,
  targetCardId?: string,
): RunResult {
  if (run.phase !== 'shop') return { ok: false, state: run, error: 'shop-closed' };
  const offer = run.offers[index];
  if (!offer) return { ok: false, state: run, error: 'no-offer' };
  if (run.money < offer.price) return { ok: false, state: run, error: 'not-enough-money' };

  if (offer.kind === 'joker') {
    if (run.jokers.length >= JOKER_SLOTS) return { ok: false, state: run, error: 'slots-full' };
    if (run.jokers.includes(offer.joker)) return { ok: false, state: run, error: 'already-owned' };
    const offers = run.offers.slice();
    offers[index] = null;
    return {
      ok: true,
      state: {
        ...run,
        money: run.money - offer.price,
        jokers: [...run.jokers, offer.joker],
        offers,
      },
    };
  }

  if (offer.kind === 'voucher') {
    if (run.vouchers.includes(offer.voucher)) {
      return { ok: false, state: run, error: 'already-owned' };
    }
    const offers = run.offers.slice();
    offers[index] = null;
    if (offer.voucher === 'patronsMark') {
      for (let slot = 0; slot < offers.length; slot += 1) {
        const item = offers[slot];
        if (item) offers[slot] = { ...item, price: Math.max(1, item.price - 1) };
      }
    }
    return {
      ok: true,
      state: {
        ...run,
        money: run.money - offer.price,
        vouchers: [...run.vouchers, offer.voucher],
        offers,
      },
    };
  }

  if (!targetCardId) return { ok: false, state: run, error: 'need-target' };
  const target = run.deck.find((card) => card.id === targetCardId);
  if (!target) return { ok: false, state: run, error: 'bad-target' };
  if (target.enhance) return { ok: false, state: run, error: 'bad-target' };
  const offers = run.offers.slice();
  offers[index] = null;
  return {
    ok: true,
    state: {
      ...run,
      money: run.money - offer.price,
      offers,
      deck: run.deck.map((card) =>
        card.id === targetCardId ? { ...card, enhance: offer.enhancement } : card,
      ),
    },
  };
}

export function rerollShop(run: RunState): RunResult {
  if (run.phase !== 'shop') return { ok: false, state: run, error: 'shop-closed' };
  if (run.money < 2) return { ok: false, state: run, error: 'not-enough-money' };
  const next: RunState = { ...run, money: run.money - 2, shopRoll: run.shopRoll + 1 };
  return { ok: true, state: { ...next, offers: generateOffers(next) } };
}

export function sellJoker(run: RunState, index: number): RunResult {
  if (run.phase !== 'shop') return { ok: false, state: run, error: 'shop-closed' };
  if (index < 0 || index >= run.jokers.length) return { ok: false, state: run, error: 'no-joker' };
  const jokers = run.jokers.slice();
  jokers.splice(index, 1);
  return { ok: true, state: { ...run, jokers, money: run.money + 3 } };
}

export function offerLabel(offer: ShopOffer): { kind: ShopOffer['kind']; id: string } {
  if (offer.kind === 'joker') return { kind: 'joker', id: offer.joker };
  if (offer.kind === 'voucher') return { kind: 'voucher', id: offer.voucher };
  return { kind: 'enhancement', id: offer.enhancement };
}

export function validateDeckId(value: unknown): DeckId {
  return DECKS.some((deck) => deck.id === value) ? (value as DeckId) : 'ivory';
}

export function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<RunState>;
  return (
    typeof run.seed === 'number' &&
    typeof run.seedText === 'string' &&
    validateDeckId(run.deckId) === run.deckId &&
    Array.isArray(run.plan) &&
    run.plan.length > 0 &&
    typeof run.blindIndex === 'number' &&
    typeof run.phase === 'string' &&
    Array.isArray(run.deck) &&
    run.deck.length === 52 &&
    Array.isArray(run.hand) &&
    Array.isArray(run.jokers) &&
    run.jokers.every(isJokerId) &&
    Array.isArray(run.vouchers) &&
    run.vouchers.every(isVoucherId) &&
    Array.isArray(run.offers) &&
    run.offers.every(
      (offer) =>
        offer === null ||
        (offer.kind === 'joker' && isJokerId(offer.joker)) ||
        (offer.kind === 'enhancement' && isEnhancementId(offer.enhancement)) ||
        (offer.kind === 'voucher' && isVoucherId(offer.voucher)),
    )
  );
}
