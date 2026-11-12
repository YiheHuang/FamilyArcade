/**
 * Joker's Table · original content catalogue.
 *
 * All jokers, bosses, decks, enhancements and vouchers in this file are original
 * creations for Family Arcade. The engine keeps ids only; display names and copy
 * live in `src/i18n.ts` so the English and Chinese screens never mix.
 */

export type JokerId =
  | 'understudy'
  | 'velvet'
  | 'compass'
  | 'lantern'
  | 'ledger'
  | 'mirrors'
  | 'orator'
  | 'backstage'
  | 'finch'
  | 'ember'
  | 'collector'
  | 'bust'
  | 'thread'
  | 'inkwell'
  | 'sundial'
  | 'cellar'
  | 'doorman'
  | 'candlewick'
  | 'harmonica'
  | 'nightwatch'
  | 'alchemist'
  | 'heir'
  | 'treasurer'
  | 'patron';

export type BossId =
  | 'auditor'
  | 'fog'
  | 'paleWidow'
  | 'rulebook'
  | 'taxCollector'
  | 'mirrorwright'
  | 'shortBell'
  | 'sphinx';

export type EnhancementId = 'gilt' | 'cinder' | 'prism' | 'bramble' | 'tally' | 'keystone';

export type DeckId = 'ivory' | 'crimson' | 'sapphire' | 'brass';

export type VoucherId = 'extraHand' | 'extraDiscard' | 'coinPress' | 'patronsMark';

export type BlindKind = 'small' | 'big' | 'boss' | 'finale';

export interface JokerDef {
  id: JokerId;
  glyph: string;
  price: number;
}

export interface BossDef {
  id: BossId;
  glyph: string;
}

export interface DeckDef {
  id: DeckId;
  glyph: string;
  startMoney: number;
  targetScale: number;
  extraDiscards: number;
  giltCards: number;
}

export interface EnhancementDef {
  id: EnhancementId;
  glyph: string;
  price: number;
}

export interface VoucherDef {
  id: VoucherId;
  glyph: string;
  price: number;
}

export interface BlindPlan {
  index: number;
  ante: number;
  kind: BlindKind;
  boss: BossId | null;
  target: number;
  reward: number;
}

export const JOKERS: readonly JokerDef[] = [
  { id: 'understudy', glyph: '✦', price: 5 },
  { id: 'velvet', glyph: '❦', price: 5 },
  { id: 'compass', glyph: '✧', price: 5 },
  { id: 'lantern', glyph: '☾', price: 5 },
  { id: 'ledger', glyph: '▤', price: 6 },
  { id: 'mirrors', glyph: '◫', price: 6 },
  { id: 'orator', glyph: '♞', price: 7 },
  { id: 'backstage', glyph: '⚿', price: 6 },
  { id: 'finch', glyph: '⌛', price: 5 },
  { id: 'ember', glyph: '✹', price: 5 },
  { id: 'collector', glyph: '◈', price: 6 },
  { id: 'bust', glyph: '♜', price: 5 },
  { id: 'thread', glyph: '⌇', price: 6 },
  { id: 'inkwell', glyph: '✒', price: 6 },
  { id: 'sundial', glyph: '☀', price: 5 },
  { id: 'cellar', glyph: '⚱', price: 5 },
  { id: 'doorman', glyph: '⚑', price: 6 },
  { id: 'candlewick', glyph: '♨', price: 6 },
  { id: 'harmonica', glyph: '♫', price: 5 },
  { id: 'nightwatch', glyph: '☗', price: 6 },
  { id: 'alchemist', glyph: '⚗', price: 6 },
  { id: 'heir', glyph: '♛', price: 7 },
  { id: 'treasurer', glyph: '⛁', price: 6 },
  { id: 'patron', glyph: '✾', price: 6 },
];

export const BOSSES: readonly BossDef[] = [
  { id: 'auditor', glyph: '▣' },
  { id: 'fog', glyph: '☁' },
  { id: 'paleWidow', glyph: '♠' },
  { id: 'rulebook', glyph: '▤' },
  { id: 'taxCollector', glyph: '⚖' },
  { id: 'mirrorwright', glyph: '◫' },
  { id: 'shortBell', glyph: '⏳' },
  { id: 'sphinx', glyph: '☥' },
];

export const DECKS: readonly DeckDef[] = [
  { id: 'ivory', glyph: '◇', startMoney: 8, targetScale: 1, extraDiscards: 0, giltCards: 0 },
  { id: 'crimson', glyph: '◆', startMoney: 12, targetScale: 1.15, extraDiscards: 0, giltCards: 0 },
  { id: 'sapphire', glyph: '❖', startMoney: 6, targetScale: 1, extraDiscards: 1, giltCards: 0 },
  { id: 'brass', glyph: '⚙', startMoney: 7, targetScale: 1, extraDiscards: 0, giltCards: 2 },
];

export const ENHANCEMENTS: readonly EnhancementDef[] = [
  { id: 'gilt', glyph: '✦', price: 4 },
  { id: 'cinder', glyph: '✹', price: 4 },
  { id: 'prism', glyph: '◈', price: 4 },
  { id: 'bramble', glyph: '❧', price: 4 },
  { id: 'tally', glyph: 'Ⅱ', price: 4 },
  { id: 'keystone', glyph: '♛', price: 4 },
];

export const VOUCHERS: readonly VoucherDef[] = [
  { id: 'extraHand', glyph: '☰', price: 8 },
  { id: 'extraDiscard', glyph: '✚', price: 8 },
  { id: 'coinPress', glyph: '◉', price: 8 },
  { id: 'patronsMark', glyph: '✒', price: 8 },
];

export const JOKER_SLOTS = 4;
export const HAND_SIZE = 8;
export const BASE_HANDS = 4;
export const BASE_DISCARDS = 3;
export const MAX_PLAY = 5;
export const CORE_BLINDS = 18;
export const FINALE_BLINDS = 6;

export const JOKER_BY_ID: Record<JokerId, JokerDef> = Object.fromEntries(
  JOKERS.map((joker) => [joker.id, joker]),
) as Record<JokerId, JokerDef>;

export const BOSS_BY_ID: Record<BossId, BossDef> = Object.fromEntries(
  BOSSES.map((boss) => [boss.id, boss]),
) as Record<BossId, BossDef>;

export const DECK_BY_ID: Record<DeckId, DeckDef> = Object.fromEntries(
  DECKS.map((deck) => [deck.id, deck]),
) as Record<DeckId, DeckDef>;

export const ENHANCEMENT_BY_ID: Record<EnhancementId, EnhancementDef> = Object.fromEntries(
  ENHANCEMENTS.map((item) => [item.id, item]),
) as Record<EnhancementId, EnhancementDef>;

export const VOUCHER_BY_ID: Record<VoucherId, VoucherDef> = Object.fromEntries(
  VOUCHERS.map((item) => [item.id, item]),
) as Record<VoucherId, VoucherDef>;

/** Base targets for antes 1–6 before deck scaling. */
export const ANTE_BASE = [0, 140, 320, 700, 1400, 2800, 5200] as const;

export const BLIND_REWARDS: Record<BlindKind, number> = {
  small: 4,
  big: 5,
  boss: 6,
  finale: 6,
};

export function isDeckId(value: unknown): value is DeckId {
  return DECKS.some((deck) => deck.id === value);
}

export function isJokerId(value: unknown): value is JokerId {
  return JOKERS.some((joker) => joker.id === value);
}

export function isBossId(value: unknown): value is BossId {
  return BOSSES.some((boss) => boss.id === value);
}

export function isEnhancementId(value: unknown): value is EnhancementId {
  return ENHANCEMENTS.some((item) => item.id === value);
}

export function isVoucherId(value: unknown): value is VoucherId {
  return VOUCHERS.some((item) => item.id === value);
}

function roundTen(value: number): number {
  return Math.max(10, Math.round(value / 10) * 10);
}

/**
 * Build the 18-blind core sequence plus optional sudden-death finales.
 * The same seed and deck always produce the same sequence, so LAN clients can
 * derive it from the host's shared seed without receiving any hidden state.
 */
export function createBlindPlan(
  seed: number,
  deckId: DeckId,
  finales = false,
): BlindPlan[] {
  const deck = DECK_BY_ID[deckId];
  const order = shuffledBosses(seed);
  const plan: BlindPlan[] = [];
  for (let index = 0; index < CORE_BLINDS; index += 1) {
    const ante = Math.floor(index / 3) + 1;
    const slot = index % 3;
    const kind: BlindKind = slot === 0 ? 'small' : slot === 1 ? 'big' : 'boss';
    const base = ANTE_BASE[ante] ?? 7000;
    const target =
      kind === 'small' ? base : kind === 'big' ? roundTen(base * 1.5) : roundTen(base * 2);
    plan.push({
      index,
      ante,
      kind,
      boss: kind === 'boss' ? order[ante - 1] ?? order[0] : null,
      target: roundTen(target * deck.targetScale),
      reward: BLIND_REWARDS[kind],
    });
  }

  if (finales) {
    let target = roundTen((ANTE_BASE[6] ?? 5200) * 2 * deck.targetScale);
    for (let step = 0; step < FINALE_BLINDS; step += 1) {
      target = roundTen(target * 1.3);
      const index = plan.length;
      plan.push({
        index,
        ante: 6,
        kind: 'finale',
        boss: order[(CORE_BLINDS + step) % order.length],
        target,
        reward: BLIND_REWARDS.finale,
      });
    }
  }

  return plan;
}

function shuffledBosses(seed: number): BossId[] {
  const order = BOSSES.map((boss) => boss.id);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const pick = state % (index + 1);
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  return order;
}
