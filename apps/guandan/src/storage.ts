import type { AiLevel } from './ai/ai';
import type { GameState, RoundResult, Team } from './game/guandan';

export type RecordMode = 'ai' | 'local' | 'lan';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  names: string[];
  savedAt: number;
}

export interface RoundEntry {
  winnerTeam: Team;
  gain: number;
  levels: [number, number];
  order: string[];
  mode: RecordMode;
  level?: AiLevel;
  matchOver: boolean;
  at: number;
}

export interface FamilyRecord {
  rounds: number;
  matches: number;
  roundWins: [number, number];
  titles: [number, number];
  best: [number, number];
  byMode: Record<RecordMode, number>;
  lastWinner: Team | null;
  recent: RoundEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.guandan.save';
const RECORD_KEY = 'familyarcade.guandan.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  rounds: 0,
  matches: 0,
  roundWins: [0, 0],
  titles: [0, 0],
  best: [2, 2],
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

function isTeam(value: unknown): value is Team {
  return value === 0 || value === 1;
}

function isEntry(value: unknown): value is RoundEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RoundEntry>;
  return (
    isTeam(entry.winnerTeam) &&
    typeof entry.gain === 'number' &&
    entry.gain >= 1 &&
    entry.gain <= 3 &&
    Array.isArray(entry.levels) &&
    entry.levels.length === 2 &&
    entry.levels.every((level) => typeof level === 'number' && level >= 2 && level <= 14) &&
    Array.isArray(entry.order) &&
    entry.order.length === 4 &&
    entry.order.every((name) => typeof name === 'string' && name.length > 0) &&
    isMode(entry.mode) &&
    (!entry.level || isLevel(entry.level)) &&
    typeof entry.matchOver === 'boolean' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  const roundWins = Array.isArray(raw?.roundWins) ? raw.roundWins : [0, 0];
  const titles = Array.isArray(raw?.titles) ? raw.titles : [0, 0];
  const best = Array.isArray(raw?.best) ? raw.best : [2, 2];
  return {
    rounds: count(raw?.rounds),
    matches: count(raw?.matches),
    roundWins: [count(roundWins[0]), count(roundWins[1])],
    titles: [count(titles[0]), count(titles[1])],
    best: [
      Math.max(2, Math.min(14, count(best[0]) || 2)),
      Math.max(2, Math.min(14, count(best[1]) || 2)),
    ],
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    lastWinner: isTeam(raw?.lastWinner) ? raw.lastWinner : null,
    recent,
  };
}

export function addRound(
  record: FamilyRecord,
  state: GameState,
  names: string[],
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  if (!state.result || (state.phase !== 'round-over' && state.phase !== 'match-over')) {
    return record;
  }
  const result: RoundResult = state.result;
  const named = result.order.map((seat) => names[seat] || `@seat${seat + 1}`);
  const entry: RoundEntry = {
    winnerTeam: result.winnerTeam,
    gain: result.gain,
    levels: [result.levelsAfter[0], result.levelsAfter[1]],
    order: named,
    mode: meta.mode,
    matchOver: result.matchWinner !== null,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  const roundWins: [number, number] = [record.roundWins[0], record.roundWins[1]];
  roundWins[result.winnerTeam] += 1;
  const titles: [number, number] = [record.titles[0], record.titles[1]];
  if (result.matchWinner !== null) titles[result.matchWinner] += 1;
  const best: [number, number] = [
    Math.max(record.best[0], result.levelsAfter[0]),
    Math.max(record.best[1], result.levelsAfter[1]),
  ];
  return {
    rounds: record.rounds + 1,
    matches: record.matches + (result.matchWinner !== null ? 1 : 0),
    roundWins,
    titles,
    best,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    lastWinner: result.winnerTeam,
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
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
    state.hands.some((hand) => !Array.isArray(hand)) ||
    !Array.isArray(state.passed) ||
    state.passed.length !== 4 ||
    (state.phase !== 'playing' && state.phase !== 'tribute')
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

export function recordRound(
  state: GameState,
  names: string[],
  meta: ResultMeta,
  at = Date.now(),
): FamilyRecord {
  const record = addRound(loadRecord(), state, names, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
