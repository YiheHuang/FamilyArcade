import { replay, result } from './game/engine';
import type { GameConfig, GameState, Move, ScoredFeature } from './game/types';
import { systemLang, type Lang } from './i18n';

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
  config: GameConfig;
  moves: Move[];
  savedAt: number;
  state: GameState;
}

export interface PlayerLine {
  name: string;
  games: number;
  wins: number;
  bestScore: number;
  totalScore: number;
}

export interface HistoryEntry {
  id: string;
  endedAt: number;
  config: GameConfig;
  moves: Move[];
  scores: number[];
  winnerNames: string[];
  lastScored: ScoredFeature[];
}

export interface Stats {
  version: 1;
  games: number;
  players: Record<string, PlayerLine>;
  currentStreak: { name: string; count: number } | null;
  bestStreak: number;
  lastWinner: string | null;
  history: HistoryEntry[];
}

const SETTINGS_KEY = 'fieldandwall.settings.v1';
const SAVE_KEY = 'fieldandwall.save.v1';
const STATS_KEY = 'fieldandwall.stats.v1';
const TUTORIAL_KEY = 'fieldandwall.tutorial.v1';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lang: systemLang(),
  sound: 'on',
  speed: 'slow',
  reducedMotion: prefersReducedMotion(),
};

export const EMPTY_STATS: Stats = {
  version: 1,
  games: 0,
  players: {},
  currentStreak: null,
  bestStreak: 0,
  lastWinner: null,
  history: [],
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
    /* storage unavailable: the current session still works */
  }
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY);
  if (!saved) return { ...DEFAULT_SETTINGS };
  return {
    version: 1,
    lang: saved.lang === 'en' ? 'en' : saved.lang === 'zh' ? 'zh' : DEFAULT_SETTINGS.lang,
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
  if (!saved || saved.version !== 1 || !saved.config || !Array.isArray(saved.moves)) return null;
  try {
    const state = replay(saved.config, saved.moves);
    if (state.status !== 'playing') {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return {
      version: 1,
      config: saved.config,
      moves: saved.moves,
      savedAt: typeof saved.savedAt === 'number' ? saved.savedAt : Date.now(),
      state,
    };
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
  if (state.status !== 'playing') {
    clearSavedGame();
    return;
  }
  write(SAVE_KEY, {
    version: 1,
    config: state.config,
    moves: state.moves,
    savedAt: Date.now(),
  });
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
  if (!saved || saved.version !== 1) return { ...EMPTY_STATS, players: {}, history: [] };
  const players: Record<string, PlayerLine> = {};
  if (saved.players && typeof saved.players === 'object') {
    for (const [name, line] of Object.entries(saved.players)) {
      const row = line as Partial<PlayerLine>;
      players[name] = {
        name,
        games: Number(row.games) || 0,
        wins: Number(row.wins) || 0,
        bestScore: Number(row.bestScore) || 0,
        totalScore: Number(row.totalScore) || 0,
      };
    }
  }
  return {
    version: 1,
    games: Number(saved.games) || 0,
    players,
    currentStreak:
      saved.currentStreak && typeof saved.currentStreak.name === 'string'
        ? { name: saved.currentStreak.name, count: Number(saved.currentStreak.count) || 0 }
        : null,
    bestStreak: Number(saved.bestStreak) || 0,
    lastWinner: typeof saved.lastWinner === 'string' ? saved.lastWinner : null,
    history: Array.isArray(saved.history) ? saved.history.slice(0, 10) : [],
  };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function resetStats(): Stats {
  const empty: Stats = { ...EMPTY_STATS, players: {}, history: [] };
  saveStats(empty);
  return empty;
}

export function recordGame(stats: Stats, state: GameState): Stats {
  const res = result(state);
  if (!res) return stats;
  const winners = res.tiedWinners.map((seat) => state.config.seats[seat]?.name ?? `Seat ${seat + 1}`);
  const winnerNames = winners.length > 0 ? winners : [];
  const players: Record<string, PlayerLine> = { ...stats.players };
  state.config.seats.forEach((seat, i) => {
    const previous = players[seat.name];
    const score = state.scores[i] ?? 0;
    players[seat.name] = {
      name: seat.name,
      games: (previous?.games ?? 0) + 1,
      wins: (previous?.wins ?? 0) + (winnerNames.includes(seat.name) ? 1 : 0),
      bestScore: Math.max(previous?.bestScore ?? 0, score),
      totalScore: (previous?.totalScore ?? 0) + score,
    };
  });

  const soleWinner = winnerNames.length === 1 ? winnerNames[0] : null;
  const streak =
    soleWinner && stats.currentStreak?.name === soleWinner
      ? { name: soleWinner, count: stats.currentStreak.count + 1 }
      : soleWinner
        ? { name: soleWinner, count: 1 }
        : null;

  const entry: HistoryEntry = {
    id: `game-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`,
    endedAt: Date.now(),
    config: state.config,
    moves: state.moves,
    scores: [...state.scores],
    winnerNames,
    lastScored: state.lastScored,
  };
  return {
    version: 1,
    games: stats.games + 1,
    players,
    currentStreak: streak,
    bestStreak: Math.max(stats.bestStreak, streak?.count ?? 0),
    lastWinner: soleWinner,
    history: [entry, ...stats.history].slice(0, 10),
  };
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

export function exportJson(settings: Settings, stats: Stats): string {
  return JSON.stringify(
    {
      app: 'field-and-wall',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      stats,
    },
    null,
    2,
  );
}
