import type { AiLevel } from './ai/ai';
import { CELLS, type GameState } from './game/gomoku';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type ResultWinner = 'B' | 'W' | 'draw';

export interface RecordEntry {
  winner: ResultWinner;
  mode: RecordMode;
  level?: AiLevel;
  moves: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsBlack: number;
  winsWhite: number;
  draws: number;
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

const SAVE_KEY = 'familyarcade.gomoku.save';
const RECORD_KEY = 'familyarcade.gomoku.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  winsBlack: 0,
  winsWhite: 0,
  draws: 0,
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

function isWinner(value: unknown): value is ResultWinner {
  return value === 'B' || value === 'W' || value === 'draw';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isWinner(entry.winner) &&
    (entry.mode === 'ai' || entry.mode === 'local' || entry.mode === 'lan') &&
    typeof entry.moves === 'number' &&
    Number.isFinite(entry.moves) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  return {
    games: count(raw?.games),
    winsBlack: count(raw?.winsBlack),
    winsWhite: count(raw?.winsWhite),
    draws: count(raw?.draws),
    streak: count(raw?.streak),
    bestStreak: count(raw?.bestStreak),
    lastWinner: isWinner(raw?.lastWinner) ? raw.lastWinner : null,
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
  const winner: ResultWinner = state.status === 'draw' ? 'draw' : state.winner === 'W' ? 'W' : 'B';
  const streak = record.lastWinner === winner ? record.streak + 1 : 1;
  const entry: RecordEntry = {
    winner,
    mode: meta.mode,
    moves: state.moves.length,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    winsBlack: record.winsBlack + (winner === 'B' ? 1 : 0),
    winsWhite: record.winsWhite + (winner === 'W' ? 1 : 0),
    draws: record.draws + (winner === 'draw' ? 1 : 0),
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

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (
    !saved ||
    saved.version !== 1 ||
    !saved.state ||
    !Array.isArray(saved.state.board) ||
    saved.state.board.length !== CELLS
  ) {
    return null;
  }
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const value: SavedGame = { ...saved, version: 1, savedAt: Date.now() };
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

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
