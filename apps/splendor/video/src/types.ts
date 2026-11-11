export const COLORS = ["white", "blue", "green", "red", "black"] as const;
export type Color = (typeof COLORS)[number];
export type TokenColor = Color | "gold";

export type Tokens = Record<TokenColor, number>;
export type Cost = Record<Color, number>;

export interface CardDef {
  id: number;
  tier: 1 | 2 | 3;
  bonus: Color;
  points: number;
  cost: Cost;
}

export interface NobleDef {
  id: number;
  name: string;
  points: number;
  requirement: Cost;
}

export interface PlayerSnap {
  seat: number;
  kind: "human" | "ai";
  aiLevel: "friendly" | "easy" | "normal" | "hard";
  tokens: Tokens;
  bonuses: Cost;
  cardPoints: number;
  purchased: number[];
  reserved: Array<{ cardId: number; fromDeck: boolean }>;
  nobles: number[];
  points: number;
}

export interface StateSnap {
  turn: number;
  current: number;
  phase: string;
  finalRound: boolean;
  winners: number[] | null;
  bank: Tokens;
  board: (number | null)[][];
  deckCounts: number[];
  nobles: number[];
  players: PlayerSnap[];
}

export interface Demo {
  turn: number;
  seat: number;
  before: StateSnap;
  after: StateSnap;
  taken: Tokens | null;
  paid: Tokens | null;
  card: {
    id: number;
    tier: 1 | 2 | 3;
    bonus: Color;
    points: number;
    cost: Cost;
    discount: number;
  } | null;
  nobleId: number | null;
  scoreBefore: number;
  scoreAfter: number;
}

export interface GameData {
  take: Demo;
  buy: Demo;
  noble: Demo;
  wide: StateSnap;
  sources: { fourPlayer: string; twoPlayerNoble: string };
}

export interface CardsData {
  version: number;
  cards: CardDef[];
  nobles: NobleDef[];
}
