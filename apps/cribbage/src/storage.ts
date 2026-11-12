import type { AiLevel } from './ai/ai';
import { skunkFor, type GameState } from './game/cribbage';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecordEntry {
  winnerSeat: number;
  players: number;
  scores: number[];
  mode: RecordMode;
  level?: AiLevel;
  skunk: 'none' | 'skunk' | 'double';
  bestHand: number;
  handNo: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  wins: number[];
  skunks: number;
  doubleSkunks: number;
  bestHand: number;
  bestHandSeat: number | null;
  byMode: Record<RecordMode, number>;
  streak: number;
  bestStreak: number;
  lastWinner: number | null;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.cribbage.save';
const RECORD_KEY = 'familyarcade.cribbage.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  wins: [0, 0, 0, 0],
  skunks: 0,
  doubleSkunks: 0,
  bestHand: 0,
  bestHandSeat: null,
  byMode: { ai: 0, local: 0, lan: 0 },
  streak: 0,
  bestStreak: 0,
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

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

function isMode(value: unknown): value is RecordMode {
  return value === 'ai' || value === 'local' || value === 'lan';
}

function isSkunk(value: unknown): value is 'none' | 'skunk' | 'double' {
  return value === 'none' || value === 'skunk' || value === 'double';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    typeof entry.winnerSeat === 'number' &&
    Number.isInteger(entry.winnerSeat) &&
    entry.winnerSeat >= 0 &&
    typeof entry.players === 'number' &&
    Number.isInteger(entry.players) &&
    entry.players >= 2 &&
    entry.players <= 4 &&
    Array.isArray(entry.scores) &&
    entry.scores.every((score) => typeof score === 'number' && Number.isFinite(score)) &&
    isMode(entry.mode) &&
    (entry.level === undefined || isLevel(entry.level)) &&
    isSkunk(entry.skunk) &&
    typeof entry.bestHand === 'number' &&
    Number.isFinite(entry.bestHand) &&
    typeof entry.handNo === 'number' &&
    Number.isFinite(entry.handNo) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const wins = Array.isArray(raw?.wins)
    ? [0, 1, 2, 3].map((index) => count(raw?.wins?.[index]))
    : [0, 0, 0, 0];
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  const lastWinner =
    typeof raw?.lastWinner === 'number' && Number.isInteger(raw.lastWinner) && raw.lastWinner >= 0
      ? raw.lastWinner
      : null;
  return {
    games: count(raw?.games),
    wins,
    skunks: count(raw?.skunks),
    doubleSkunks: count(raw?.doubleSkunks),
    bestHand: count(raw?.bestHand),
    bestHandSeat:
      typeof raw?.bestHandSeat === 'number' && Number.isInteger(raw.bestHandSeat)
        ? raw.bestHandSeat
        : null,
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    streak: count(raw?.streak),
    bestStreak: count(raw?.bestStreak),
    lastWinner,
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  state: GameState,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  if (state.winner === null) return record;
  const skunk = skunkFor(state);
  const best = state.bestHand?.points ?? 0;
  const entry: RecordEntry = {
    winnerSeat: state.winner,
    players: state.players,
    scores: state.seats.map((seat) => seat.score),
    mode: meta.mode,
    ...(meta.level ? { level: meta.level } : {}),
    skunk,
    bestHand: best,
    handNo: state.handNo,
    at,
  };
  const streak = record.lastWinner === state.winner ? record.streak + 1 : 1;
  const wins = [0, 1, 2, 3].map((index) =>
    (record.wins[index] ?? 0) + (index === state.winner ? 1 : 0),
  );
  const bestHand =
    best > record.bestHand ? best : record.bestHand;
  const bestHandSeat =
    best > record.bestHand ? state.bestHand?.seat ?? null : record.bestHandSeat;

  return {
    games: record.games + 1,
    wins,
    skunks: record.skunks + (skunk !== 'none' ? 1 : 0),
    doubleSkunks: record.doubleSkunks + (skunk === 'double' ? 1 : 0),
    bestHand,
    bestHandSeat,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
    lastWinner: state.winner,
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

function looksLikeState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    typeof state.players === 'number' &&
    state.players >= 2 &&
    state.players <= 4 &&
    Array.isArray(state.seats) &&
    state.seats.length === state.players &&
    state.seats.every(
      (seat) =>
        seat &&
        Array.isArray(seat.hand) &&
        seat.hand.every((card) => typeof card === 'number') &&
        typeof seat.score === 'number',
    ) &&
    Array.isArray(state.stock) &&
    Array.isArray(state.crib) &&
    Array.isArray(state.showHands) &&
    (state.showHands.length === 0 || state.showHands.length === state.players) &&
    typeof state.dealer === 'number' &&
    typeof state.phase === 'string' &&
    typeof state.handNo === 'number' &&
    typeof state.seed === 'number'
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !looksLikeState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!isLevel(saved.level)) return null;
  if (saved.state.phase === 'game-over') return null;
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

export function recordResult(state: GameState, meta: ResultMeta, at = Date.now()): FamilyRecord {
  const record = addResult(loadRecord(), state, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
