import type { AiLevel } from './ai/ai';
import type { GameState } from './game/spades';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type WinnerTeam = 0 | 1;

export interface RecordEntry {
  winner: WinnerTeam;
  scores: [number, number];
  rounds: number;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  matches: number;
  winsA: number;
  winsB: number;
  rounds: number;
  byMode: Record<RecordMode, number>;
  lastWinner: WinnerTeam | null;
  recent: RecordEntry[];
}

export interface MatchOutcome {
  winner: WinnerTeam;
  scores: [number, number];
  rounds: number;
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.spades.save';
const RECORD_KEY = 'familyarcade.spades.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  matches: 0,
  winsA: 0,
  winsB: 0,
  rounds: 0,
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

function isTeam(value: unknown): value is WinnerTeam {
  return value === 0 || value === 1;
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isTeam(entry.winner) &&
    isMode(entry.mode) &&
    Array.isArray(entry.scores) &&
    entry.scores.length === 2 &&
    entry.scores.every((score) => typeof score === 'number' && Number.isFinite(score)) &&
    typeof entry.rounds === 'number' &&
    Number.isFinite(entry.rounds) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  const lastWinner = isTeam(raw?.lastWinner) ? raw.lastWinner : null;
  return {
    matches: count(raw?.matches),
    winsA: count(raw?.winsA),
    winsB: count(raw?.winsB),
    rounds: count(raw?.rounds),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    lastWinner,
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
    scores: [outcome.scores[0], outcome.scores[1]],
    rounds: Math.max(1, Math.floor(outcome.rounds)),
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    matches: record.matches + 1,
    winsA: record.winsA + (outcome.winner === 0 ? 1 : 0),
    winsB: record.winsB + (outcome.winner === 1 ? 1 : 0),
    rounds: record.rounds + entry.rounds,
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
    !Array.isArray(state.bids) ||
    state.bids.length !== 4 ||
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
