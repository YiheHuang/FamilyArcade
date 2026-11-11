import raw from '../../data/cards.json';
import { DESSERT_IDS, type DessertId } from './types';

export interface DessertMeta {
  id: DessertId;
  zh: string;
  en: string;
  color: string;
  deep: string;
  light: string;
  shape: string;
  copies: number;
}

interface CardItem {
  id: number;
  type: DessertId;
  copy: number;
  value: number;
}

interface CardData {
  version: number;
  source: string;
  count: number;
  types: DessertMeta[];
  items: CardItem[];
}

export const CARD_DATA = raw as CardData;
export const DESSERT_TYPES: readonly DessertMeta[] = CARD_DATA.types;
export const CARD_IDS: readonly number[] = CARD_DATA.items.map((item) => item.id);
export const CARD_COUNT = CARD_DATA.items.length;
export const COPIES_PER_TYPE = 12;
export const HAND_SIZE = 8;
export const ROUNDS = 3;

const TYPE_BY_ID: DessertId[] = new Array(CARD_COUNT);
for (const item of CARD_DATA.items) {
  if (item.id < 0 || item.id >= CARD_COUNT) {
    throw new Error(`card id out of range: ${item.id}`);
  }
  if (!DESSERT_IDS.includes(item.type)) {
    throw new Error(`unknown dessert type: ${String(item.type)}`);
  }
  TYPE_BY_ID[item.id] = item.type;
}

export function typeOf(cardId: number): DessertId {
  const type = TYPE_BY_ID[cardId];
  if (!type) throw new Error(`unknown card id: ${cardId}`);
  return type;
}

export function dessertMeta(dessert: DessertId): DessertMeta {
  const found = DESSERT_TYPES.find((item) => item.id === dessert);
  if (!found) throw new Error(`unknown dessert: ${dessert}`);
  return found;
}

export function cardsOfType(dessert: DessertId): number[] {
  return CARD_DATA.items.filter((item) => item.type === dessert).map((item) => item.id);
}
