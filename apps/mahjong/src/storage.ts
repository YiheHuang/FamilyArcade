import type { AiLevel } from './ai/ai';
import type { GameState } from './game/mahjong';

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
  fan: number;
  result: 'win' | 'draw';
  mode: RecordMode;
  at: number;
}

export interface FamilyRecord {
  games: number;
  draws: number;
  wins: [number, number, number, number];
  byMode: Record<RecordMode, number>;
  highestFan: number;
  lastWinner: number | null;
  recent: RecordEntry[];
}

export interface MatchOutcome {
  winner: number | null;
  fan: number;
  result: 'win' | 'draw';
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.mahjong.save';
const RECORD_KEY = 'familyarcade.mahjong.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  draws: 0,
  wins: [0, 0, 0, 0],
  byMode: { ai: 0, local: 0, lan: 0 },
  highestFan: 0,
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
  return value === null || (typeof value === 'number' && value >= 0 && value < 4);
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isWinner(entry.winner) &&
    isMode(entry.mode) &&
    (entry.result === 'win' || entry.result === 'draw') &&
    typeof entry.fan === 'number' &&
    Number.isFinite(entry.fan) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const wins = Array.isArray(raw?.wins) ? raw.wins.map(count).slice(0, 4) : [];
  while (wins.length < 4) wins.push(0);
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    games: count(raw?.games),
    draws: count(raw?.draws),
    wins: [wins[0], wins[1], wins[2], wins[3]],
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    highestFan: count(raw?.highestFan),
    lastWinner: isWinner(raw?.lastWinner) ? raw.lastWinner : null,
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  outcome: MatchOutcome,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  const entry: RecordEntry = {
    winner: outcome.winner,
    fan: Math.max(0, Math.floor(outcome.fan)),
    result: outcome.result,
    mode: meta.mode,
    at,
  };
  const wins: [number, number, number, number] = [...record.wins];
  if (outcome.result === 'win' && outcome.winner !== null) {
    wins[outcome.winner] = (wins[outcome.winner] ?? 0) + 1;
  }
  return {
    games: record.games + 1,
    draws: record.draws + (outcome.result === 'draw' ? 1 : 0),
    wins,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    highestFan: Math.max(record.highestFan, entry.fan),
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
    !Array.isArray(state.wall) ||
    typeof state.phase !== 'string'
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
  outcome: MatchOutcome,
  meta: ResultMeta,
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
