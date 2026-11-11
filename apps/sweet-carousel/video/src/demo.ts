import demoEn from './data/demo-en.json';
import demoZh from './data/demo-zh.json';
import type { Lang } from './copy';

export interface DemoPlayer {
  seat: number;
  name: string;
  total: number;
  rounds: number[];
  crowns: number;
  types: number;
  cards: number;
}

export interface DemoCrown {
  dessert: string;
  seat: number;
  count: number;
  points: number;
}

export interface Demo {
  seed: string;
  players: DemoPlayer[];
  ranking: number[];
  winner: number;
  crowns: DemoCrown[];
  rounds: {
    round: number;
    passDirection: 'left' | 'right';
    totals: number[];
    combos: {
      seat: number;
      pairs: number;
      triples: number;
      quads: number;
      sampler: boolean;
      leftovers: number;
      total: number;
    }[];
  }[];
  facts: Record<string, number>;
}

export const DEMO: Record<Lang, Demo> = {
  en: demoEn as Demo,
  zh: demoZh as Demo,
};
