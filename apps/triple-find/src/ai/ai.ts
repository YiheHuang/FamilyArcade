import { findSets, type Card } from '../game/cards';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type Rng = () => number;

/** Small, fast seeded RNG so an AI game can be replayed from its seed. */
export function mulberry32(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every level enumerates the whole table. The level changes how quickly the
 * player reacts, not whether it can see a set.
 *
 * Hard takes the first set it finds. The other levels choose one of the
 * available sets with the injected RNG, which makes them feel less machine-like
 * without ever making them unable to play.
 */
export function chooseSet(table: readonly Card[], level: AiLevel, rng: Rng): [number, number, number] | null {
  const sets = findSets(table);
  if (sets.length === 0) return null;
  if (level === 'hard') return [...sets[0]] as [number, number, number];
  const index = Math.min(sets.length - 1, Math.floor(rng() * sets.length));
  return [...sets[index]] as [number, number, number];
}

/**
 * Reaction delays in milliseconds.
 * Companion is deliberately slow and gentle; Hard is effectively instant.
 * The caller adds the UI fade; the delay itself is deterministic per RNG draw.
 */
export function aiDelay(level: AiLevel, rng: Rng): number {
  const roll = rng();
  switch (level) {
    case 'hard':
      return 700 + Math.floor(roll * 600);
    case 'normal':
      return 2800 + Math.floor(roll * 3000);
    case 'easy':
      return 6200 + Math.floor(roll * 4400);
    case 'companion':
      return 10000 + Math.floor(roll * 6000);
    default:
      return 6000;
  }
}

/** How long a called human gets to pick three cards. */
export const CALL_WINDOW_MS = 12_000;
/** A wrong or timed-out call rests for this long; it is not a score penalty. */
export const CALL_LOCKOUT_MS = 2600;
/** The family table plays for five minutes. */
export const GAME_LENGTH_MS = 5 * 60 * 1000;

export const AI_NAMES: Record<AiLevel, { en: string[]; zh: string[] }> = {
  companion: { en: ['Moss', 'Clover', 'Breeze'], zh: ['小苔', '三叶', '微风'] },
  easy: { en: ['Pip', 'Sprout', 'Dot'], zh: ['小豆', '芽芽', '点点'] },
  normal: { en: ['June', 'Rowan', 'Sage'], zh: ['小夏', '小洛', '小贤'] },
  hard: { en: ['Rook', 'Flint', 'Vex'], zh: ['小岩', '燧石', '小棘'] },
};

export function aiNames(level: AiLevel, count: number, lang: 'en' | 'zh'): string[] {
  const pool = AI_NAMES[level][lang];
  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}
