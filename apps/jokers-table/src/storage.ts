import type { AiLevel } from './ai/ai';
import type { CompareOutcome } from './game/competition';
import { isRunState, type RunState } from './game/run';
import type { LocalMode, SavedGame, SeatState } from './session';

export type RecordMode = LocalMode | 'lan';
export type RecordResult = 'win' | 'loss' | 'draw';

export interface RecordEntry {
  mode: RecordMode;
  result: RecordResult;
  score: number;
  ante: number;
  name?: string;
  at: number;
}

export interface FamilyRecord {
  runs: number;
  wins: number;
  losses: number;
  bestScore: number;
  bestAnte: number;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

const SAVE_KEY = 'familyarcade.jokers-table.save';
const RECORD_KEY = 'familyarcade.jokers-table.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  runs: 0,
  wins: 0,
  losses: 0,
  bestScore: 0,
  bestAnte: 0,
  byMode: { solo: 0, rivals: 0, hotseat: 0, lan: 0 },
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

function isMode(value: unknown): value is RecordMode {
  return value === 'solo' || value === 'rivals' || value === 'hotseat' || value === 'lan';
}

function isResult(value: unknown): value is RecordResult {
  return value === 'win' || value === 'loss' || value === 'draw';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isMode(entry.mode) &&
    isResult(entry.result) &&
    typeof entry.score === 'number' &&
    Number.isFinite(entry.score) &&
    typeof entry.ante === 'number' &&
    Number.isFinite(entry.ante) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  return {
    runs: count(raw?.runs),
    wins: count(raw?.wins),
    losses: count(raw?.losses),
    bestScore: count(raw?.bestScore),
    bestAnte: count(raw?.bestAnte),
    byMode: {
      solo: count(byMode.solo),
      rivals: count(byMode.rivals),
      hotseat: count(byMode.hotseat),
      lan: count(byMode.lan),
    },
    recent: Array.isArray(raw?.recent)
      ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
      : [],
  };
}

export function addResult(
  record: FamilyRecord,
  entry: Omit<RecordEntry, 'at'>,
  at = Date.now(),
): FamilyRecord {
  const item: RecordEntry = { ...entry, at };
  return {
    runs: record.runs + 1,
    wins: record.wins + (entry.result === 'win' ? 1 : 0),
    losses: record.losses + (entry.result === 'loss' ? 1 : 0),
    bestScore: Math.max(record.bestScore, Math.floor(entry.score)),
    bestAnte: Math.max(record.bestAnte, Math.floor(entry.ante)),
    byMode: {
      ...record.byMode,
      [entry.mode]: record.byMode[entry.mode] + 1,
    },
    recent: [item, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function loadRecord(): FamilyRecord {
  return normalizeRecord(read<Partial<FamilyRecord>>(RECORD_KEY));
}

export function recordResult(
  entry: Omit<RecordEntry, 'at'>,
  at = Date.now(),
): FamilyRecord {
  const record = addResult(loadRecord(), entry, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}

function isSeat(value: unknown): value is SeatState {
  if (!value || typeof value !== 'object') return false;
  const seat = value as Partial<SeatState>;
  return (
    typeof seat.name === 'string' &&
    (seat.nameKey === null || typeof seat.nameKey === 'string') &&
    typeof seat.ai === 'boolean' &&
    (seat.level === null || typeof seat.level === 'string') &&
    isRunState(seat.run) &&
    typeof seat.hearts === 'number' &&
    typeof seat.eliminated === 'boolean' &&
    Array.isArray(seat.blindScores) &&
    typeof seat.totalScore === 'number'
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1) return null;
  if (saved.mode !== 'solo' && saved.mode !== 'rivals' && saved.mode !== 'hotseat') return null;
  if (!['game', 'shop', 'compare', 'handoff'].includes(saved.screen)) return null;
  if (saved.mode === 'solo' && !isRunState(saved.soloRun)) return null;
  if (saved.mode !== 'solo') {
    if (!Array.isArray(saved.seats) || saved.seats.length < 2 || !saved.seats.every(isSeat)) {
      return null;
    }
  }
  return saved;
}

export function saveGame(game: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame | null {
  if (game.screen === 'game' && game.soloRun?.phase === 'complete') return null;
  const value: SavedGame = { ...game, version: 1, savedAt: Date.now() };
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

export function isAiLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

export type { RunState, CompareOutcome };
