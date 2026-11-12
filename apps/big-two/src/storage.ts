import type { AiLevel } from './ai/ai';
import type { Card, GameState, RoundResult } from './game/big-two';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  names: string[];
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface GameEntry {
  winner: string;
  gain: number;
  counts: number[];
  penalties: number[];
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  games: number;
  wins: number;
  bestGain: number;
  byMode: Record<RecordMode, number>;
  winners: Record<string, number>;
  recent: GameEntry[];
  lastWinner: string | null;
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.big-two.save';
const RECORD_KEY = 'familyarcade.big-two.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  wins: 0,
  bestGain: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  winners: {},
  recent: [],
  lastWinner: null,
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

function isMode(value: unknown): value is RecordMode {
  return value === 'ai' || value === 'local' || value === 'lan';
}

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<Card>;
  return (
    typeof card.id === 'string' &&
    card.id.length > 0 &&
    typeof card.rank === 'number' &&
    card.rank >= 3 &&
    card.rank <= 15 &&
    (card.suit === 'D' || card.suit === 'C' || card.suit === 'H' || card.suit === 'S')
  );
}

function isResult(value: unknown): value is RoundResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<RoundResult>;
  return (
    typeof result.winner === 'number' &&
    result.winner >= 0 &&
    result.winner < 4 &&
    Array.isArray(result.counts) &&
    result.counts.length === 4 &&
    Array.isArray(result.penalties) &&
    result.penalties.length === 4 &&
    typeof result.gain === 'number'
  );
}

function sanitizeTally(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [name, amount] of Object.entries(value as Record<string, unknown>)) {
    if (!name || name.length > 40) continue;
    const n = count(amount);
    if (n > 0) result[name] = n;
  }
  return result;
}

function isEntry(value: unknown): value is GameEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<GameEntry>;
  return (
    typeof entry.winner === 'string' &&
    entry.winner.length > 0 &&
    typeof entry.gain === 'number' &&
    Number.isFinite(entry.gain) &&
    Array.isArray(entry.counts) &&
    entry.counts.length === 4 &&
    entry.counts.every((item) => typeof item === 'number' && item >= 0 && item <= 13) &&
    Array.isArray(entry.penalties) &&
    entry.penalties.length === 4 &&
    entry.penalties.every((item) => typeof item === 'number' && item >= 0) &&
    isMode(entry.mode) &&
    (!entry.level || isLevel(entry.level)) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    games: count(raw?.games),
    wins: count(raw?.wins),
    bestGain: count(raw?.bestGain),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    winners: sanitizeTally(raw?.winners),
    recent,
    lastWinner:
      typeof raw?.lastWinner === 'string' && raw.lastWinner.length > 0
        ? raw.lastWinner
        : null,
  };
}

export function addGame(
  record: FamilyRecord,
  state: GameState,
  names: string[],
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  if (state.phase !== 'round-over' || !state.result) return record;
  const result = state.result;
  const winner = names[result.winner] || `@seat${result.winner + 1}`;
  const entry: GameEntry = {
    winner,
    gain: result.gain,
    counts: result.counts.slice(),
    penalties: result.penalties.slice(),
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    wins: record.wins + (result.winner === 0 ? 1 : 0),
    bestGain: Math.max(record.bestGain, result.gain),
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    winners: {
      ...record.winners,
      [winner]: (record.winners[winner] ?? 0) + 1,
    },
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
    lastWinner: winner,
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1) return null;
  const state = saved.state;
  if (
    !state ||
    !Array.isArray(state.hands) ||
    state.hands.length !== 4 ||
    state.hands.some((hand) => !Array.isArray(hand) || !hand.every(isCard)) ||
    !Array.isArray(state.passed) ||
    state.passed.length !== 4 ||
    !Array.isArray(state.discard) ||
    !state.discard.every(isCard) ||
    (state.phase !== 'playing' && state.phase !== 'round-over') ||
    (state.trick !== null &&
      (typeof state.trick !== 'object' || !Array.isArray(state.trick.combo?.cards))) ||
    (state.result !== null && !isResult(state.result))
  ) {
    return null;
  }
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!isLevel(saved.level)) return null;
  if (!Array.isArray(saved.names)) saved.names = [];
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

export function recordGame(
  state: GameState,
  names: string[],
  meta: ResultMeta,
  at = Date.now(),
): FamilyRecord {
  const record = addGame(loadRecord(), state, names, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
