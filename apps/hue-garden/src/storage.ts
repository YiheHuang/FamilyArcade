import { deserialize, serialize } from './game/engine';
import { tileColor } from './game/tiles';
import type { GameConfig, GameResult, GameState, Move } from './game/types';
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
  state: GameState;
  savedAt: number;
}

export interface RecentGame {
  version: 1;
  id: string;
  finishedAt: number;
  config: GameConfig;
  moves: Move[];
  scores: number[];
  blooms: number[];
  winners: number[];
  reason: NonNullable<GameState['endReason']>;
  turns: number;
}

export interface Stats {
  version: 1;
  games: number;
  wins: Record<string, number>;
  highestScore: number;
  currentStreak: number;
  bestStreak: number;
  lastWinner: string | null;
  totalBlooms: number;
  colorCounts: Record<string, number>;
}

const SETTINGS_KEY = 'huegarden.settings.v1';
const SAVE_KEY = 'huegarden.save.v1';
const STATS_KEY = 'huegarden.stats.v1';
const RECENT_KEY = 'huegarden.recent.v1';
const TUTORIAL_KEY = 'huegarden.tutorial.v1';

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
  totalBlooms: 0,
  colorCounts: {},
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
  if (!saved) return { ...EMPTY_STATS, wins: {}, colorCounts: {} };
  return {
    version: 1,
    games: Number(saved.games) || 0,
    wins: typeof saved.wins === 'object' && saved.wins ? { ...saved.wins } : {},
    highestScore: Number(saved.highestScore) || 0,
    currentStreak: Number(saved.currentStreak) || 0,
    bestStreak: Number(saved.bestStreak) || 0,
    lastWinner: typeof saved.lastWinner === 'string' ? saved.lastWinner : null,
    totalBlooms: Number(saved.totalBlooms) || 0,
    colorCounts:
      typeof saved.colorCounts === 'object' && saved.colorCounts ? { ...saved.colorCounts } : {},
  };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function resetStats(): Stats {
  const empty = { ...EMPTY_STATS, wins: {}, colorCounts: {} };
  saveStats(empty);
  saveRecent([]);
  return empty;
}

export function recordGame(state: GameState, result: GameResult): Stats {
  const stats = loadStats();
  const winners = result.winners;
  const winnerNames = winners.map((seat) => state.config.seats[seat]?.name ?? `P${seat + 1}`);
  const wins = { ...stats.wins };
  for (const name of winnerNames) wins[name] = (wins[name] ?? 0) + 1;

  const colors = { ...stats.colorCounts };
  for (const move of state.moves) {
    if (move.kind !== 'play') continue;
    if (state.config.seats[move.seat]?.kind !== 'human') continue;
    for (const placed of move.placements) {
      const color = tileColor(placed.tile);
      const key = String(color);
      colors[key] = (colors[key] ?? 0) + 1;
    }
  }

  const topScore = Math.max(...state.scores);
  const winnerName = winnerNames.length === 1 ? winnerNames[0] : null;
  const currentStreak =
    winnerName !== null && stats.lastWinner === winnerName ? stats.currentStreak + 1 : winnerName ? 1 : 0;

  const next: Stats = {
    version: 1,
    games: stats.games + 1,
    wins,
    highestScore: Math.max(stats.highestScore, topScore),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastWinner: winnerName,
    totalBlooms: stats.totalBlooms + state.blooms.reduce((sum, n) => sum + n, 0),
    colorCounts: colors,
  };
  saveStats(next);
  const entry: RecentGame = {
    version: 1,
    id: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    finishedAt: Date.now(),
    config: state.config,
    moves: state.moves,
    scores: state.scores,
    blooms: state.blooms,
    winners,
    reason: result.reason,
    turns: state.turn,
  };
  saveRecent([entry, ...loadRecent()].slice(0, 10));
  return next;
}

export function loadRecent(): RecentGame[] {
  const saved = read<RecentGame[]>(RECENT_KEY);
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (game) =>
      game &&
      game.version === 1 &&
      game.config &&
      Array.isArray(game.moves) &&
      Array.isArray(game.scores),
  );
}

export function saveRecent(games: RecentGame[]): void {
  write(RECENT_KEY, games.slice(0, 10));
}

export function exportStats(stats: Stats): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      games: stats.games,
      wins: stats.wins,
      highestScore: stats.highestScore,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      totalBlooms: stats.totalBlooms,
      colorCounts: stats.colorCounts,
      recent: loadRecent().map((game) => ({
        finishedAt: game.finishedAt,
        players: game.config.seats.map((s) => s.name),
        scores: game.scores,
        blooms: game.blooms,
        reason: game.reason,
        turns: game.turns,
      })),
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
