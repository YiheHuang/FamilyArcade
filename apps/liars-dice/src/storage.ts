import type { AiLevel } from './ai/ai';
import type { GameState } from './game/liars-dice';

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
  standings: string[];
  playerCount: number;
  mode: RecordMode;
  level?: AiLevel;
  round: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  byMode: Record<RecordMode, number>;
  wins: Record<string, number>;
  lastWinner: string | null;
  recent: GameEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.liars-dice.save';
const RECORD_KEY = 'familyarcade.liars-dice.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  wins: {},
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
    /* ignore quota / private mode */
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

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

function isEntry(value: unknown): value is GameEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<GameEntry>;
  return (
    typeof entry.winner === 'string' &&
    entry.winner.length > 0 &&
    Array.isArray(entry.standings) &&
    entry.standings.length >= 2 &&
    entry.standings.every((name) => typeof name === 'string' && name.length > 0) &&
    typeof entry.playerCount === 'number' &&
    entry.playerCount >= 2 &&
    entry.playerCount <= 6 &&
    isMode(entry.mode) &&
    (!entry.level || isLevel(entry.level)) &&
    typeof entry.round === 'number' &&
    entry.round >= 1 &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
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

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    games: count(raw?.games),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    wins: sanitizeTally(raw?.wins),
    lastWinner:
      typeof raw?.lastWinner === 'string' && raw.lastWinner.length > 0
        ? raw.lastWinner
        : null,
    recent,
  };
}

export function addGame(
  record: FamilyRecord,
  state: GameState,
  names: string[],
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  if (state.phase !== 'game-over' || state.winner === null) return record;
  const nameFor = (seat: number) => names[seat] || `@seat${seat + 1}`;
  const winner = nameFor(state.winner);
  const order = [state.winner, ...state.outOrder.slice().reverse()].map(nameFor);
  const standings = order.filter((name, index) => order.indexOf(name) === index);
  const entry: GameEntry = {
    winner,
    standings,
    playerCount: state.playerCount,
    mode: meta.mode,
    round: state.round,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    wins: {
      ...record.wins,
      [winner]: (record.wins[winner] ?? 0) + 1,
    },
    lastWinner: winner,
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

function isSavedState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (
    typeof state.playerCount !== 'number' ||
    state.playerCount < 2 ||
    state.playerCount > 6 ||
    !Array.isArray(state.dice) ||
    state.dice.length !== state.playerCount ||
    state.dice.some((dice) => !Array.isArray(dice) || dice.length > 5) ||
    (state.phase !== 'bidding' && state.phase !== 'reveal') ||
    !Array.isArray(state.outOrder) ||
    !Array.isArray(state.tendencies) ||
    !Array.isArray(state.bids) ||
    typeof state.round !== 'number'
  ) {
    return false;
  }
  if (state.phase === 'bidding' && (typeof state.turn !== 'number' || state.turn < 0)) {
    return false;
  }
  return true;
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1) return null;
  if (!isSavedState(saved.state)) return null;
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
