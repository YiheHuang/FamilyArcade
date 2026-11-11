import { deserialize, result, serialize } from './game/engine';
import type { GameConfig, GameState, Move } from './game/types';
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
  /** wins by player name */
  wins: Record<string, number>;
  currentStreak: number;
  bestStreak: number;
  lastWinner: string | null;
  /** wins per seat, used for the colour label */
  seatWins: number[];
  /** seat index of the most frequent winner; used for the colour label */
  favoriteSeat: number | null;
}

export interface HistoryRow {
  name: string;
  home: number;
  distance: number;
}

export interface HistoryEntry {
  version: 1;
  id: string;
  finishedAt: number;
  config: GameConfig;
  moves: Move[];
  winner: number | null;
  ranking: HistoryRow[];
}

const SETTINGS_KEY = 'starleap.settings.v1';
const SAVE_KEY = 'starleap.save.v1';
const STATS_KEY = 'starleap.stats.v1';
const HISTORY_KEY = 'starleap.history.v1';
const TUTORIAL_KEY = 'starleap.tutorial.v1';

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
  currentStreak: 0,
  bestStreak: 0,
  lastWinner: null,
  seatWins: [0, 0, 0, 0],
  favoriteSeat: null,
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
  if (!saved) return DEFAULT_SETTINGS;
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
  if (!saved || saved.version !== 1 || typeof saved.state !== 'object' || saved.state === null) {
    return null;
  }
  try {
    const state = deserialize(serialize(saved.state as GameState));
    if (state.status !== 'playing') {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return { version: 1, state, savedAt: saved.savedAt ?? Date.now() };
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

export function saveCurrentGame(state: GameState): void {
  if (state.status !== 'playing') {
    localStorage.removeItem(SAVE_KEY);
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
  if (!saved) return { ...EMPTY_STATS, wins: {} };
  return {
    version: 1,
    games: Number(saved.games) || 0,
    wins: typeof saved.wins === 'object' && saved.wins ? { ...saved.wins } : {},
    currentStreak: Number(saved.currentStreak) || 0,
    bestStreak: Number(saved.bestStreak) || 0,
    lastWinner: typeof saved.lastWinner === 'string' ? saved.lastWinner : null,
    seatWins: Array.isArray(saved.seatWins) ? [0, 1, 2, 3].map((i) => Number(saved.seatWins?.[i]) || 0) : [0, 0, 0, 0],
    favoriteSeat: typeof saved.favoriteSeat === 'number' ? saved.favoriteSeat : null,
  };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function loadHistory(): HistoryEntry[] {
  const saved = read<HistoryEntry[]>(HISTORY_KEY);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (entry) =>
        entry &&
        entry.version === 1 &&
        typeof entry.id === 'string' &&
        typeof entry.finishedAt === 'number' &&
        entry.config &&
        Array.isArray(entry.config.seats) &&
        Array.isArray(entry.moves),
    )
    .slice(-10);
}

export function addHistoryEntry(state: GameState): HistoryEntry[] {
  const res = result(state);
  if (!res) return loadHistory();
  const entry: HistoryEntry = {
    version: 1,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    finishedAt: Date.now(),
    config: { ...state.config, seats: state.config.seats.map((s) => ({ ...s })) },
    moves: state.moves.map((m) => ({ ...m, path: [...m.path] })),
    winner: state.winner,
    ranking: res.ranking.map((r) => ({ name: r.name, home: r.home, distance: r.distance })),
  };
  const next = [...loadHistory(), entry].slice(-10);
  write(HISTORY_KEY, next);
  return next;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

export function resetStats(): Stats {
  const empty = { ...EMPTY_STATS, wins: {} };
  saveStats(empty);
  return empty;
}

export function recordWin(stats: Stats, winnerName: string, winnerSeat: number): Stats {
  const wins = { ...stats.wins, [winnerName]: (stats.wins[winnerName] ?? 0) + 1 };
  const currentStreak = stats.lastWinner === winnerName ? stats.currentStreak + 1 : 1;
  const seatWins = [...stats.seatWins];
  seatWins[winnerSeat] = (seatWins[winnerSeat] ?? 0) + 1;
  let favoriteSeat = 0;
  for (let i = 1; i < seatWins.length; i++) if (seatWins[i] > seatWins[favoriteSeat]) favoriteSeat = i;
  return {
    version: 1,
    games: stats.games + 1,
    wins,
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastWinner: winnerName,
    seatWins,
    favoriteSeat,
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
