import { deserialize, serialize } from './game/replay';
import { BALLOONS } from './game/data';
import type { GameResult, GameState } from './game/types';
import type { Lang } from './i18n';
import { systemLang } from './i18n';

export type SoundLevel = 'on' | 'low' | 'off';
export type Speed = 'slow' | 'normal' | 'fast';

export interface Settings {
  version: 1;
  lang: Lang;
  sound: SoundLevel;
  speed: Speed;
  reducedMotion: boolean;
}

export interface SavedGame {
  version: 1;
  state: GameState;
  savedAt: number;
}

export interface Stats {
  version: 1;
  games: number;
  wins: Record<string, number>;
  highestScore: number;
  currentStreak: number;
  bestStreak: number;
  lastWinner: string | null;
  favorites: Record<string, number>;
  tailwindsUsed: number;
  correctSupports: number;
}

const SETTINGS_KEY = 'balloonrally.settings.v1';
const SAVE_KEY = 'balloonrally.save.v1';
const STATS_KEY = 'balloonrally.stats.v1';
const TUTORIAL_KEY = 'balloonrally.tutorial.v1';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lang: systemLang(),
  sound: 'on',
  speed: 'slow',
  reducedMotion: false,
};

export const EMPTY_STATS: Stats = {
  version: 1,
  games: 0,
  wins: {},
  highestScore: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastWinner: null,
  favorites: {},
  tailwindsUsed: 0,
  correctSupports: 0,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be unavailable; the session still plays. */
  }
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY);
  if (!saved) return { ...DEFAULT_SETTINGS };
  return {
    version: 1,
    lang: saved.lang === 'zh' ? 'zh' : saved.lang === 'en' ? 'en' : DEFAULT_SETTINGS.lang,
    sound: saved.sound === 'low' || saved.sound === 'off' || saved.sound === 'on' ? saved.sound : 'on',
    speed: saved.speed === 'normal' || saved.speed === 'fast' || saved.speed === 'slow' ? saved.speed : 'slow',
    reducedMotion: Boolean(saved.reducedMotion),
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadSavedGame(): SavedGame | null {
  const saved = read<Partial<SavedGame>>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !saved.state) return null;
  try {
    const state = deserialize(serialize(saved.state));
    if (state.phase === 'ended') {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return { version: 1, state, savedAt: saved.savedAt ?? Date.now() };
  } catch {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function saveCurrentGame(state: GameState): void {
  if (state.phase === 'ended') {
    clearSavedGame();
    return;
  }
  write(SAVE_KEY, { version: 1, state, savedAt: Date.now() } satisfies SavedGame);
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStats(): Stats {
  const saved = read<Partial<Stats>>(STATS_KEY);
  if (!saved) return { ...EMPTY_STATS, wins: {}, favorites: {} };
  return {
    version: 1,
    games: Number(saved.games) || 0,
    wins: typeof saved.wins === 'object' && saved.wins ? { ...saved.wins } : {},
    highestScore: Number(saved.highestScore) || 0,
    currentStreak: Number(saved.currentStreak) || 0,
    bestStreak: Number(saved.bestStreak) || 0,
    lastWinner: typeof saved.lastWinner === 'string' ? saved.lastWinner : null,
    favorites: typeof saved.favorites === 'object' && saved.favorites ? { ...saved.favorites } : {},
    tailwindsUsed: Number(saved.tailwindsUsed) || 0,
    correctSupports: Number(saved.correctSupports) || 0,
  };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function resetStats(): Stats {
  const empty = { ...EMPTY_STATS, wins: {}, favorites: {} };
  saveStats(empty);
  return empty;
}

export function recordGame(stats: Stats, state: GameState, result: GameResult): Stats {
  const wins = { ...stats.wins };
  const winners = result.winners.map((seat) => state.config.seats[seat].name);
  for (const name of winners) wins[name] = (wins[name] ?? 0) + 1;

  const favorites = { ...stats.favorites };
  let tailwindsUsed = stats.tailwindsUsed;
  let correctSupports = stats.correctSupports;
  for (const record of state.history) {
    record.supports.forEach((balloon, seat) => {
      const id = BALLOONS[balloon]?.id ?? String(balloon);
      favorites[id] = (favorites[id] ?? 0) + 1;
      if (record.leaders.includes(balloon)) correctSupports += 1;
      if (record.tailwinds[seat]) tailwindsUsed += 1;
    });
  }

  const soleWinner = winners.length === 1 ? winners[0] : null;
  const currentStreak = soleWinner && stats.lastWinner === soleWinner ? stats.currentStreak + 1 : 1;
  const highestScore = Math.max(stats.highestScore, ...result.ranking.map((r) => r.total));

  return {
    version: 1,
    games: stats.games + 1,
    wins,
    highestScore,
    currentStreak: soleWinner ? currentStreak : 0,
    bestStreak: Math.max(stats.bestStreak, soleWinner ? currentStreak : 0),
    lastWinner: soleWinner,
    favorites,
    tailwindsUsed,
    correctSupports,
  };
}

export function statsJson(stats: Stats): string {
  return JSON.stringify(
    {
      version: stats.version,
      exportedAt: new Date().toISOString(),
      games: stats.games,
      wins: stats.wins,
      highestScore: stats.highestScore,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      lastWinner: stats.lastWinner,
      favorites: stats.favorites,
      tailwindsUsed: stats.tailwindsUsed,
      correctSupports: stats.correctSupports,
    },
    null,
    2,
  );
}

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearTutorialSeen(): void {
  try {
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    /* ignore */
  }
}
