/** 权威卡牌/贵族数据装载（来源与核对过程见 data/card-data-report.md） */
import type { CardDef, Color, Cost, NobleDef } from '../types.js';
import { COLORS } from '../types.js';
import { CARDS_DATA } from './cards.js';
import { NOBLES_DATA } from './nobles.js';

export const CARDS: CardDef[] = CARDS_DATA;
export const NOBLES: NobleDef[] = NOBLES_DATA;

export const CARD_BY_ID: ReadonlyMap<number, CardDef> = new Map(CARDS.map((c) => [c.id, c]));
export const NOBLE_BY_ID: ReadonlyMap<number, NobleDef> = new Map(NOBLES.map((n) => [n.id, n]));

export function cardById(id: number): CardDef {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`unknown card id: ${id}`);
  return card;
}

export function nobleById(id: number): NobleDef {
  const noble = NOBLE_BY_ID.get(id);
  if (!noble) throw new Error(`unknown noble id: ${id}`);
  return noble;
}

export function cardsOfTier(tier: 1 | 2 | 3): CardDef[] {
  return CARDS.filter((c) => c.tier === tier);
}

export function zeroCost(): Cost {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}

/** 某种成本里包含哪些颜色（按官方顺序） */
export function costColors(cost: Cost): Color[] {
  return COLORS.filter((c) => cost[c] > 0);
}

export function costTotal(cost: Cost): number {
  return COLORS.reduce((sum, c) => sum + cost[c], 0);
}
