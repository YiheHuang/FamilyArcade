import type { AiLevel } from './ai/ai';
import type { GameState } from './game/hearts';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecordEntry {
  winnerSeat: number;
  scores: number[];
  mode: RecordMode;
  level?: AiLevel;
  moons: number;
  hands: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  wins: number[];
  moons: number;
  bestScore: number | null;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.hearts.save';
const RECORD_KEY = 'familyarcade.hearts.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  wins: [0, 0, 0, 0],
  moons: 0,
  bestScore: null,
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function seat(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
}

function scoreList(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 4) return [0, 0, 0, 0];
  return value.map((item) =>
    typeof item === 'number' && Number.isFinite(item) ? Math.max(0, Math.round(item)) : 0,
  );
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    (entry.mode === 'ai' || entry.mode === 'local' || entry.mode === 'lan') &&
    typeof entry.winnerSeat === 'number' &&
    entry.winnerSeat >= 0 &&
    entry.winnerSeat <= 3 &&
    Array.isArray(entry.scores) &&
    entry.scores.length === 4 &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const wins = Array.isArray(raw?.wins) && raw.wins.length === 4
    ? raw.wins.map(count)
    : [0, 0, 0, 0];
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT).map((entry) => ({
        ...entry,
        winnerSeat: seat(entry.winnerSeat),
        scores: scoreList(entry.scores),
        moons: count(entry.moons),
        hands: Math.max(1, count(entry.hands)),
      }))
    : [];
  return {
    games: count(raw?.games),
    wins,
    moons: count(raw?.moons),
    bestScore:
      typeof raw?.bestScore === 'number' && Number.isFinite(raw.bestScore) && raw.bestScore >= 0
        ? Math.floor(raw.bestScore)
        : null,
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
  if (state.phase !== 'game-over') return record;
  const winners = state.winners.length > 0 ? state.winners : [0];
  const lowest = state.scores[winners[0]] ?? 0;
  const wins = record.wins.map((value, index) =>
    winners.includes(index) ? value + 1 : value,
  );
  const entry: RecordEntry = {
    winnerSeat: winners[0],
    scores: state.scores.slice(),
    mode: meta.mode,
    moons: state.moonShooter === null ? 0 : 1,
    hands: state.handNumber,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    wins,
    moons: record.moons + (state.moonShooter === null ? 0 : 1),
    bestScore: record.bestScore === null ? lowest : Math.min(record.bestScore, lowest),
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    (state.phase === 'passing' ||
      state.phase === 'playing' ||
      state.phase === 'hand-over' ||
      state.phase === 'game-over') &&
    Array.isArray(state.hands) &&
    state.hands.length === 4 &&
    state.hands.every((hand) => Array.isArray(hand)) &&
    Array.isArray(state.scores) &&
    state.scores.length === 4 &&
    Array.isArray(state.handPoints) &&
    state.handPoints.length === 4 &&
    typeof state.handNumber === 'number'
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !validState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
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
  const record = addResult(loadRecord(), state, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
