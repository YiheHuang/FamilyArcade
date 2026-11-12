import type { AiLevel } from './ai/ai';
import type { GameState } from './game/rummy-500';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecentGame {
  at: number;
  mode: RecordMode;
  level?: AiLevel;
  players: number;
  winner: number;
  winnerName: string;
  score: number;
  rounds: number;
}

export interface FamilyRecord {
  games: number;
  bestScore: number;
  byMode: Record<RecordMode, number>;
  recent: RecentGame[];
}

export interface GameSummary {
  winner: number;
  winnerName: string;
  score: number;
  bestScore: number;
  players: number;
  rounds: number;
}

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  bestScore: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  recent: [],
};

const SAVE_KEY = 'familyarcade.rummy-500.save';
const RECORD_KEY = 'familyarcade.rummy-500.record';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function gameSummary(state: GameState): GameSummary | null {
  if (state.phase !== 'game-over' || state.winner === null) return null;
  const winner = state.winner;
  const scores = state.players.map((player) => player.score);
  return {
    winner,
    winnerName: state.players[winner]?.name ?? '',
    score: scores[winner] ?? 0,
    bestScore: Math.max(...scores),
    players: state.players.length,
    rounds: state.round,
  };
}

export function normalizeRecord(value: unknown): FamilyRecord {
  const source = value && typeof value === 'object' ? (value as Partial<FamilyRecord>) : {};
  const byMode = (source.byMode && typeof source.byMode === 'object' ? source.byMode : {}) as Partial<
    Record<RecordMode, number>
  >;
  const recent = Array.isArray(source.recent) ? source.recent : [];
  return {
    games: Number(source.games) || 0,
    bestScore: Number(source.bestScore) || 0,
    byMode: {
      ai: Number(byMode.ai) || 0,
      local: Number(byMode.local) || 0,
      lan: Number(byMode.lan) || 0,
    },
    recent: recent
      .filter((entry) => entry && typeof entry === 'object')
      .slice(0, 8)
      .map((entry) => ({
        at: Number(entry.at) || 0,
        mode: entry.mode === 'ai' || entry.mode === 'lan' || entry.mode === 'local' ? entry.mode : 'local',
        level:
          entry.level === 'companion' ||
          entry.level === 'easy' ||
          entry.level === 'normal' ||
          entry.level === 'hard'
            ? entry.level
            : undefined,
        players: Number(entry.players) || 2,
        winner: Number(entry.winner) || 0,
        winnerName: typeof entry.winnerName === 'string' ? entry.winnerName : '',
        score: Number(entry.score) || 0,
        rounds: Number(entry.rounds) || 1,
      })),
  };
}

export function addResult(
  record: FamilyRecord,
  summary: GameSummary,
  options: { mode: RecordMode; level?: AiLevel },
  at: number,
): FamilyRecord {
  const entry: RecentGame = {
    at,
    mode: options.mode,
    level: options.level,
    players: summary.players,
    winner: summary.winner,
    winnerName: summary.winnerName,
    score: summary.score,
    rounds: summary.rounds,
  };
  return {
    games: record.games + 1,
    bestScore: Math.max(record.bestScore, summary.bestScore),
    byMode: { ...record.byMode, [options.mode]: record.byMode[options.mode] + 1 },
    recent: [entry, ...record.recent].slice(0, 8),
  };
}

export function loadRecord(): FamilyRecord {
  return normalizeRecord(read<unknown>(RECORD_KEY));
}

export function recordResult(
  state: GameState,
  options: { mode: RecordMode; level?: AiLevel },
): FamilyRecord {
  const summary = gameSummary(state);
  if (!summary) return loadRecord();
  const record = addResult(loadRecord(), summary, options, Date.now());
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return { ...EMPTY_RECORD, byMode: { ...EMPTY_RECORD.byMode }, recent: [] };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !saved.state) return null;
  const state = saved.state;
  if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) {
    return null;
  }
  if (!Array.isArray(state.stock) || !Array.isArray(state.discard) || !Array.isArray(state.melds)) {
    return null;
  }
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const value: SavedGame = { ...saved, version: 2, savedAt: Date.now() };
  write(SAVE_KEY, value);
  return value;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
