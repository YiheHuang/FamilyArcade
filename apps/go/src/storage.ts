import type { AiLevel } from './ai/ai';
import {
  isBoardSize,
  isKomi,
  type BoardSize,
  type Color,
  type GameState,
  type Komi,
} from './game/go';

export interface SavedGame {
  version: 2;
  state: GameState;
  history: GameState[];
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type ResultWinner = Color;

export interface RecordEntry {
  winner: ResultWinner;
  mode: RecordMode;
  margin: number;
  moves: number;
  size: BoardSize;
  komi: Komi;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  version: 2;
  games: number;
  blackWins: number;
  whiteWins: number;
  streak: number;
  bestStreak: number;
  lastWinner: ResultWinner | null;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.go.save';
const RECORD_KEY = 'familyarcade.go.record';
const MAX_RECENT = 10;
const MAX_HISTORY = 120;

export const EMPTY_RECORD: FamilyRecord = {
  version: 2,
  games: 0,
  blackWins: 0,
  whiteWins: 0,
  streak: 0,
  bestStreak: 0,
  lastWinner: null,
  byMode: { ai: 0, local: 0, lan: 0 },
  recent: [],
};

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

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (!isBoardSize(state.size) || !isKomi(state.komi)) return false;
  if (!Array.isArray(state.board) || state.board.length !== state.size * state.size) return false;
  if (state.board.some((cell) => cell !== null && cell !== 'B' && cell !== 'W')) return false;
  if (state.turn !== 'B' && state.turn !== 'W') return false;
  if (state.status !== 'playing' && state.status !== 'finished') return false;
  if (!Array.isArray(state.moves)) return false;
  if (!state.captures || typeof state.captures !== 'object') return false;
  return true;
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    (entry.winner === 'B' || entry.winner === 'W') &&
    (entry.mode === 'ai' || entry.mode === 'local' || entry.mode === 'lan') &&
    typeof entry.margin === 'number' &&
    Number.isFinite(entry.margin) &&
    typeof entry.moves === 'number' &&
    Number.isFinite(entry.moves) &&
    isBoardSize(entry.size) &&
    isKomi(entry.komi) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    (entry.level === undefined ||
      entry.level === 'companion' ||
      entry.level === 'easy' ||
      entry.level === 'normal' ||
      entry.level === 'hard')
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  return {
    version: 2,
    games: count(raw?.games),
    blackWins: count(raw?.blackWins),
    whiteWins: count(raw?.whiteWins),
    streak: count(raw?.streak),
    bestStreak: count(raw?.bestStreak),
    lastWinner: raw?.lastWinner === 'B' || raw?.lastWinner === 'W' ? raw.lastWinner : null,
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  state: GameState,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  const winner: ResultWinner = state.score?.winner ?? 'B';
  const margin = state.score?.margin ?? 0;
  const streak = record.lastWinner === winner ? record.streak + 1 : 1;
  const entry: RecordEntry = {
    winner,
    mode: meta.mode,
    margin,
    moves: state.moves.length,
    size: state.size,
    komi: state.komi,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    version: 2,
    games: record.games + 1,
    blackWins: record.blackWins + (winner === 'B' ? 1 : 0),
    whiteWins: record.whiteWins + (winner === 'W' ? 1 : 0),
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
    lastWinner: winner,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function undoLastResult(record: FamilyRecord): FamilyRecord {
  const [removed, ...rest] = record.recent;
  if (!removed) return record;
  const streak = rest.length > 0
    ? (() => {
        let run = 1;
        for (let i = 1; i < rest.length && rest[i].winner === rest[0].winner; i++) run += 1;
        return run;
      })()
    : 0;
  return {
    ...record,
    games: Math.max(0, record.games - 1),
    blackWins: Math.max(0, record.blackWins - (removed.winner === 'B' ? 1 : 0)),
    whiteWins: Math.max(0, record.whiteWins - (removed.winner === 'W' ? 1 : 0)),
    streak,
    lastWinner: rest[0]?.winner ?? null,
    byMode: {
      ...record.byMode,
      [removed.mode]: Math.max(0, record.byMode[removed.mode] - 1),
    },
    recent: rest,
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.state.status !== 'playing') return null;
  const history = Array.isArray(saved.history) ? saved.history.filter(validState).slice(-MAX_HISTORY) : [];
  return { ...saved, history };
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const value: SavedGame = {
    ...saved,
    history: saved.history.slice(-MAX_HISTORY),
    version: 2,
    savedAt: Date.now(),
  };
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

export function loadRecord(): FamilyRecord {
  return normalizeRecord(read<Partial<FamilyRecord>>(RECORD_KEY));
}

export function recordResult(state: GameState, meta: ResultMeta, at = Date.now()): FamilyRecord {
  const record = addResult(loadRecord(), state, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function undoResult(): FamilyRecord {
  const record = undoLastResult(loadRecord());
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
