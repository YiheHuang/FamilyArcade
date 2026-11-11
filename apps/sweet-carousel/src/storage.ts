import { deserialize, result, score, serialize } from './game/engine';
import type { DessertId, GameState } from './game/types';
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

export interface RecentGame {
  date: string;
  players: number;
  winner: string | null;
  winnerScore: number;
  seed: string;
}

export interface Stats {
  version: 1;
  games: number;
  wins: Record<string, number>;
  highScore: number;
  currentStreak: number;
  bestStreak: number;
  lastWinner: string | null;
  crowns: number;
  favoriteDessert: Partial<Record<DessertId, number>>;
  recent: RecentGame[];
}

const SETTINGS_KEY = 'sweetcarousel.settings.v1';
const SAVE_KEY = 'sweetcarousel.save.v1';
const STATS_KEY = 'sweetcarousel.stats.v1';
const TUTORIAL_KEY = 'sweetcarousel.tutorial.v1';

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lang: systemLang(),
  sound: 'off',
  speed: 'slow',
  reducedMotion: prefersReducedMotion(),
};

export const EMPTY_STATS: Stats = {
  version: 1,
  games: 0,
  wins: {},
  highScore: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastWinner: null,
  crowns: 0,
  favoriteDessert: {},
  recent: [],
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
    /* storage unavailable — the game still works for this session */
  }
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY);
  if (!saved) return { ...DEFAULT_SETTINGS };
  return {
    version: 1,
    lang: saved.lang === 'en' ? 'en' : saved.lang === 'zh' ? 'zh' : DEFAULT_SETTINGS.lang,
    sound: saved.sound === 'low' || saved.sound === 'off' || saved.sound === 'on' ? saved.sound : DEFAULT_SETTINGS.sound,
    speed: saved.speed === 'normal' || saved.speed === 'fast' || saved.speed === 'slow' ? saved.speed : 'slow',
    reducedMotion: Boolean(saved.reducedMotion),
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadSavedGame(): SavedGame | null {
  const saved = read<Partial<SavedGame>>(SAVE_KEY);
  if (!saved || saved.version !== 1 || typeof saved.state !== 'object' || saved.state === null) {
    return null;
  }
  try {
    const state = deserialize(serialize(saved.state as GameState));
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
  if (!saved) return { ...EMPTY_STATS, wins: {}, favoriteDessert: {}, recent: [] };
  return {
    version: 1,
    games: Number(saved.games) || 0,
    wins: typeof saved.wins === 'object' && saved.wins ? { ...saved.wins } : {},
    highScore: Number(saved.highScore) || 0,
    currentStreak: Number(saved.currentStreak) || 0,
    bestStreak: Number(saved.bestStreak) || 0,
    lastWinner: typeof saved.lastWinner === 'string' ? saved.lastWinner : null,
    crowns: Number(saved.crowns) || 0,
    favoriteDessert:
      typeof saved.favoriteDessert === 'object' && saved.favoriteDessert ? { ...saved.favoriteDessert } : {},
    recent: Array.isArray(saved.recent) ? saved.recent.slice(0, 10) : [],
  };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function resetStats(): Stats {
  const empty = { ...EMPTY_STATS, wins: {}, favoriteDessert: {}, recent: [] };
  saveStats(empty);
  return empty;
}

export function recordFinishedGame(stats: Stats, state: GameState): Stats {
  const final = result(state);
  if (!final) return stats;
  const rows = score(state);
  const winner = final.winner !== null ? rows.find((row) => row.seat === final.winner) ?? null : null;
  const wins = { ...stats.wins };
  if (winner) wins[winner.name] = (wins[winner.name] ?? 0) + 1;
  const currentStreak = winner && stats.lastWinner === winner.name ? stats.currentStreak + 1 : winner ? 1 : 0;
  const favoriteDessert = { ...stats.favoriteDessert };
  for (const cards of state.collected) {
    for (const id of cards) {
      const type = dessertOfCard(id);
      favoriteDessert[type] = (favoriteDessert[type] ?? 0) + 1;
    }
  }
  const recent: RecentGame[] = [
    {
      date: new Date().toISOString(),
      players: state.config.playerCount,
      winner: winner?.name ?? null,
      winnerScore: winner?.total ?? 0,
      seed: state.config.seed,
    },
    ...stats.recent,
  ].slice(0, 10);
  return {
    version: 1,
    games: stats.games + 1,
    wins,
    highScore: Math.max(stats.highScore, ...rows.map((row) => row.total)),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastWinner: winner?.name ?? null,
    crowns: stats.crowns + final.crowns.length,
    favoriteDessert,
    recent,
  };
}

// Local import indirection keeps storage free of engine internals while still
// mapping a card id to its dessert for the favourite-dessert stat.
import { typeOf } from './game/data';
function dessertOfCard(id: number): DessertId {
  return typeOf(id);
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

export function exportPayload(stats: Stats, settings: Settings): string {
  return JSON.stringify(
    {
      version: 1,
      app: 'sweet-carousel',
      exportedAt: new Date().toISOString(),
      settings: { ...settings },
      stats: { ...stats },
    },
    null,
    2,
  );
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
