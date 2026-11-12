import type { AiLevel } from './ai/ai';
import type { GameState } from './game/doudizhu';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecordEntry {
  side: 'landlord' | 'farmers';
  winnerSeat: number;
  stake: number;
  bombs: number;
  spring: boolean;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  games: number;
  landlordWins: number;
  farmerWins: number;
  totalStake: number;
  bestStake: number;
  byMode: Record<RecordMode, number>;
  lastWinner: 'landlord' | 'farmers' | null;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.doudizhu.save';
const RECORD_KEY = 'familyarcade.doudizhu.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  landlordWins: 0,
  farmerWins: 0,
  totalStake: 0,
  bestStake: 0,
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
    /* quota or private mode */
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

function isSide(value: unknown): value is 'landlord' | 'farmers' {
  return value === 'landlord' || value === 'farmers';
}

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isSide(entry.side) &&
    isMode(entry.mode) &&
    typeof entry.winnerSeat === 'number' &&
    typeof entry.stake === 'number' &&
    Number.isFinite(entry.stake) &&
    typeof entry.bombs === 'number' &&
    Number.isFinite(entry.bombs) &&
    typeof entry.spring === 'boolean' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    (entry.level === undefined || isLevel(entry.level))
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  return {
    games: count(raw?.games),
    landlordWins: count(raw?.landlordWins),
    farmerWins: count(raw?.farmerWins),
    totalStake: count(raw?.totalStake),
    bestStake: count(raw?.bestStake),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    lastWinner: isSide(raw?.lastWinner) ? raw.lastWinner : null,
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  entry: Omit<RecordEntry, 'at'>,
  at: number,
): FamilyRecord {
  const next: RecordEntry = { ...entry, at };
  return {
    games: record.games + 1,
    landlordWins: record.landlordWins + (entry.side === 'landlord' ? 1 : 0),
    farmerWins: record.farmerWins + (entry.side === 'farmers' ? 1 : 0),
    totalStake: record.totalStake + Math.max(0, Math.floor(entry.stake)),
    bestStake: Math.max(record.bestStake, Math.max(0, Math.floor(entry.stake))),
    byMode: {
      ...record.byMode,
      [entry.mode]: record.byMode[entry.mode] + 1,
    },
    lastWinner: entry.side,
    recent: [next, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !saved.state) return null;
  const state = saved.state;
  if (
    !Array.isArray(state.hands) ||
    state.hands.length !== 3 ||
    !Array.isArray(state.bottom) ||
    state.bottom.length !== 3 ||
    !Array.isArray(state.bids) ||
    state.bids.length !== 3 ||
    (state.phase !== 'bidding' && state.phase !== 'playing' && state.phase !== 'over')
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
  if (!state.result) return loadRecord();
  const result = state.result;
  return recordEntry(
    {
      side: result.winnerSide,
      winnerSeat: result.winnerSeat,
      stake: result.stake,
      bombs: result.bombs,
      spring: result.spring,
      mode: meta.mode,
      ...(meta.level ? { level: meta.level } : {}),
    },
    at,
  );
}

export function recordEntry(entry: Omit<RecordEntry, 'at'>, at = Date.now()): FamilyRecord {
  const record = addResult(loadRecord(), entry, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
