import cardsJson from "./cards.json";
import gameJson from "./game.json";
import type { CardDef, CardsData, GameData, NobleDef } from "../types";

const data = cardsJson as unknown as CardsData;

const cardMap: Record<number, CardDef> = {};
for (const card of data.cards) cardMap[card.id] = card;

const nobleMap: Record<number, NobleDef> = {};
for (const noble of data.nobles) nobleMap[noble.id] = noble;

export const CARDS = cardMap;
export const NOBLES = nobleMap;

export const GAME = gameJson as unknown as GameData;

export const cardOf = (id: number): CardDef => {
  const card = CARDS[id];
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
};

export const nobleOf = (id: number): NobleDef => {
  const noble = NOBLES[id];
  if (!noble) throw new Error(`unknown noble ${id}`);
  return noble;
};
