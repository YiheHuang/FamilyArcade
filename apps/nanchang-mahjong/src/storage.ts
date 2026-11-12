import type { AiLevel } from './ai/ai';
import type { GameState, WinPattern } from './game/nanchang-mahjong';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecordEntry {
  winner: number | null;
  pattern: WinPattern | null;
  deltas: number[];
  hand: number;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  hands: number;
  wins: number[];
  bestScore: number;
  byMode: Record<RecordMode, number>;
  lastWinner: number | null;
  recent: RecordEntry[];
}

export interface RecordOutcome {
  winner: number | null;
  pattern: WinPattern | null;
  deltas: number[];
  hand: number;
}

export interface RecordMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.nanchang-mahjong.save';
const RECORD_KEY = 'familyarcade.nanchang-mahjong.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  hands: 0,
  wins: [0, 0, 0, 0],
  bestScore: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  lastWinner: null,
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
    /* ignore quota or private mode */
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function isMode(value: unknown): value is RecordMode {
  return value === 'ai' || value === 'local' || value === 'lan';
}

function isWinner(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 4);
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isWinner(entry.winner) &&
    (entry.pattern === null || typeof entry.pattern === 'string') &&
    Array.isArray(entry.deltas) &&
    entry.deltas.length === 4 &&
    entry.deltas.every((delta) => typeof delta === 'number' && Number.isFinite(delta)) &&
    typeof entry.hand === 'number' &&
    Number.isFinite(entry.hand) &&
    isMode(entry.mode) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const wins = Array.isArray(raw?.wins) && raw.wins.length === 4
    ? raw.wins.map(count)
    : [0, 0, 0, 0];
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    hands: count(raw?.hands),
    wins,
    bestScore: typeof raw?.bestScore === 'number' && Number.isFinite(raw.bestScore)
      ? raw.bestScore
      : 0,
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    lastWinner: isWinner(raw?.lastWinner) ? raw.lastWinner : null,
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  outcome: RecordOutcome,
  meta: RecordMeta,
  at: number,
): FamilyRecord {
  const wins = record.wins.slice();
  if (outcome.winner !== null && outcome.winner >= 0 && outcome.winner < 4) {
    wins[outcome.winner] += 1;
  }
  const bestScore = Math.max(record.bestScore, ...outcome.deltas);
  const entry: RecordEntry = {
    winner: outcome.winner,
    pattern: outcome.pattern,
    deltas: outcome.deltas.slice(),
    hand: Math.max(1, Math.floor(outcome.hand)),
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    hands: record.hands + 1,
    wins,
    bestScore,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    lastWinner: outcome.winner,
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !saved.state) return null;
  const state = saved.state;
  if (
    !Array.isArray(state.hands) ||
    state.hands.length !== 4 ||
    !Array.isArray(state.melds) ||
    state.melds.length !== 4 ||
    !Array.isArray(state.discards) ||
    state.discards.length !== 4 ||
    typeof state.phase !== 'string' ||
    !state.spirit ||
    typeof state.spirit.trueTile !== 'string'
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

export function recordResult(
  outcome: RecordOutcome,
  meta: RecordMeta,
  at = Date.now(),
): FamilyRecord {
  const record = addResult(loadRecord(), outcome, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
