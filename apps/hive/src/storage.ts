import type { AiLevel } from './ai/ai';
import type { GameState } from './game/hive';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type RecordWinner = 'W' | 'B' | 'draw';

export interface RecordEntry {
  winner: RecordWinner;
  mode: RecordMode;
  level?: AiLevel;
  moves: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsW: number;
  winsB: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastWinner: RecordWinner | null;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.hive.save';
const RECORD_KEY = 'familyarcade.hive.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  winsW: 0,
  winsB: 0,
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function isWinner(value: unknown): value is RecordWinner {
  return value === 'W' || value === 'B' || value === 'draw';
}

function isMode(value: unknown): value is RecordMode {
  return value === 'ai' || value === 'local' || value === 'lan';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isWinner(entry.winner) &&
    isMode(entry.mode) &&
    typeof entry.moves === 'number' &&
    Number.isFinite(entry.moves) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(
  raw: Partial<FamilyRecord> | null | undefined,
): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    games: count(raw?.games),
    winsW: count(raw?.winsW),
    winsB: count(raw?.winsB),
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
  if (state.status === 'playing') return record;
  const winner: RecordWinner =
    state.status === 'draw' ? 'draw' : state.winner ?? 'draw';
  const streak = record.lastWinner === winner ? record.streak + 1 : 1;
  const entry: RecordEntry = {
    winner,
    mode: meta.mode,
    moves: state.moveCount,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    winsW: record.winsW + (winner === 'W' ? 1 : 0),
    winsB: record.winsB + (winner === 'B' ? 1 : 0),
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

function isSavedState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    Boolean(state.cells) &&
    typeof state.cells === 'object' &&
    (state.turn === 'W' || state.turn === 'B') &&
    (state.status === 'playing' || state.status === 'won' || state.status === 'draw') &&
    typeof state.moveCount === 'number'
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !isSavedState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
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

export function recordResult(
  state: GameState,
  meta: ResultMeta,
  at = Date.now(),
): FamilyRecord {
  const record = addResult(loadRecord(), state, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
