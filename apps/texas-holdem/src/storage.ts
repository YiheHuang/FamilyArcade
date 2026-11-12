import type { AiLevel } from './ai/ai';
import type { GameState } from './game/texas-holdem';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  seatCount: number;
  seed: number | null;
  recordedHandNumber: number;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecentHand {
  handNumber: number;
  pot: number;
  winners: number[];
  showdown: boolean;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  hands: number;
  showdowns: number;
  sessions: number;
  sessionWins: number;
  biggestPot: number;
  byMode: Record<RecordMode, number>;
  recent: RecentHand[];
}

export interface HandOutcome {
  handNumber: number;
  pot: number;
  winners: number[];
  showdown: boolean;
}

export interface SessionOutcome {
  champion: number | null;
  hands: number;
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.texas-holdem.save';
const RECORD_KEY = 'familyarcade.texas-holdem.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  hands: 0,
  showdowns: 0,
  sessions: 0,
  sessionWins: 0,
  biggestPot: 0,
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

function isRecent(value: unknown): value is RecentHand {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecentHand>;
  return (
    isMode(entry.mode) &&
    typeof entry.handNumber === 'number' &&
    Number.isFinite(entry.handNumber) &&
    typeof entry.pot === 'number' &&
    Number.isFinite(entry.pot) &&
    Array.isArray(entry.winners) &&
    entry.winners.every((seat) => typeof seat === 'number' && Number.isFinite(seat)) &&
    typeof entry.showdown === 'boolean' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  return {
    hands: count(raw?.hands),
    showdowns: count(raw?.showdowns),
    sessions: count(raw?.sessions),
    sessionWins: count(raw?.sessionWins),
    biggestPot: count(raw?.biggestPot),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    recent: Array.isArray(raw?.recent)
      ? raw.recent.filter(isRecent).slice(0, MAX_RECENT)
      : [],
  };
}

export function addHand(
  record: FamilyRecord,
  outcome: HandOutcome,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  const entry: RecentHand = {
    handNumber: Math.max(1, Math.floor(outcome.handNumber)),
    pot: Math.max(0, Math.floor(outcome.pot)),
    winners: outcome.winners.slice(),
    showdown: outcome.showdown,
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    ...record,
    hands: record.hands + 1,
    showdowns: record.showdowns + (outcome.showdown ? 1 : 0),
    biggestPot: Math.max(record.biggestPot, entry.pot),
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function addSession(
  record: FamilyRecord,
  outcome: SessionOutcome,
  at: number,
): FamilyRecord {
  void at;
  return {
    ...record,
    sessions: record.sessions + 1,
    sessionWins: record.sessionWins + (outcome.champion === 0 ? 1 : 0),
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !saved.state) return null;
  const state = saved.state;
  if (
    !Array.isArray(state.players) ||
    state.players.length < 2 ||
    state.players.length > 6 ||
    typeof state.phase !== 'string' ||
    typeof state.version !== 'number'
  ) {
    return null;
  }
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const value: SavedGame = { ...saved, version: 2, savedAt: Date.now() };
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

export function recordHand(
  outcome: HandOutcome,
  meta: ResultMeta,
  at = Date.now(),
): FamilyRecord {
  const record = addHand(loadRecord(), outcome, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function recordSession(
  outcome: SessionOutcome,
  at = Date.now(),
): FamilyRecord {
  const record = addSession(loadRecord(), outcome, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
