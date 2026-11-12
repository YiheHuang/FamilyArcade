import type { AiLevel } from './ai/ai';
import type { GameState } from './game/intl-draughts';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type ResultWinner = 'W' | 'B' | 'draw';

export interface RecordEntry {
  winner: ResultWinner;
  mode: RecordMode;
  level?: AiLevel;
  moves: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsWhite: number;
  winsBlack: number;
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

const SAVE_KEY = 'familyarcade.intl-draughts.save';
const RECORD_KEY = 'familyarcade.intl-draughts.record';
const MAX_RECENT = 8;
const LEVELS: readonly AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  winsWhite: 0,
  winsBlack: 0,
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

function isResultWinner(value: unknown): value is ResultWinner {
  return value === 'W' || value === 'B' || value === 'draw';
}

function isLevel(value: unknown): value is AiLevel {
  return typeof value === 'string' && LEVELS.includes(value as AiLevel);
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  const mode = entry.mode;
  return (
    isResultWinner(entry.winner) &&
    (mode === 'ai' || mode === 'local' || mode === 'lan') &&
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
  const lastWinner = isResultWinner(raw?.lastWinner) ? raw.lastWinner : null;
  return {
    games: count(raw?.games),
    winsWhite: count(raw?.winsWhite),
    winsBlack: count(raw?.winsBlack),
    draws: count(raw?.draws),
    streak: count(raw?.streak),
    bestStreak: count(raw?.bestStreak),
    lastWinner,
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
  const winner: ResultWinner =
    state.status === 'draw' ? 'draw' : state.winner === 'B' ? 'B' : 'W';
  const streak = record.lastWinner === winner ? record.streak + 1 : 1;
  const entry: RecordEntry = {
    winner,
    mode: meta.mode,
    moves: state.plies,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    winsWhite: record.winsWhite + (winner === 'W' ? 1 : 0),
    winsBlack: record.winsBlack + (winner === 'B' ? 1 : 0),
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

function isPlayableState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  const pieces = new Set(['w', 'b', 'W', 'B']);
  return (
    Array.isArray(state.board) &&
    state.board.length === 100 &&
    state.board.every((cell) => cell === null || pieces.has(String(cell))) &&
    (state.turn === 'W' || state.turn === 'B') &&
    (state.status === 'playing' || state.status === 'won' || state.status === 'draw') &&
    (state.winner === null || state.winner === 'W' || state.winner === 'B') &&
    typeof state.plies === 'number' &&
    typeof state.quietPlies === 'number'
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (
    !saved ||
    saved.version !== 1 ||
    !isPlayableState(saved.state) ||
    (saved.mode !== 'ai' && saved.mode !== 'local') ||
    !isLevel(saved.level)
  ) {
    return null;
  }
  return saved;
}

export function saveGame(
  saved: Omit<SavedGame, 'version' | 'savedAt'>,
): SavedGame {
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
