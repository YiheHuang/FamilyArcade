import type { AiLevel } from './ai/ai';
import type { GameState } from './game/zheng-shangyou';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  names: string[];
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RoundEntry {
  order: string[];
  points: number[];
  playerCount: number;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  rounds: number;
  byMode: Record<RecordMode, number>;
  finishes: Record<string, number>;
  points: Record<string, number>;
  lastWinner: string | null;
  recent: RoundEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.zheng-shangyou.save';
const RECORD_KEY = 'familyarcade.zheng-shangyou.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  rounds: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  finishes: {},
  points: {},
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isMode(value: unknown): value is RecordMode {
  return value === 'ai' || value === 'local' || value === 'lan';
}

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
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

function sanitizePoints(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [name, amount] of Object.entries(value as Record<string, unknown>)) {
    if (!name || name.length > 40) continue;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      result[name] = Math.round(amount);
    }
  }
  return result;
}

function isEntry(value: unknown): value is RoundEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RoundEntry>;
  return (
    Array.isArray(entry.order) &&
    entry.order.length === entry.playerCount &&
    entry.order.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 40) &&
    Array.isArray(entry.points) &&
    entry.points.length === entry.playerCount &&
    entry.points.every((point) => typeof point === 'number' && Number.isFinite(point)) &&
    typeof entry.playerCount === 'number' &&
    entry.playerCount >= 3 &&
    entry.playerCount <= 6 &&
    isMode(entry.mode) &&
    (!entry.level || isLevel(entry.level)) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter(isEntry).slice(0, MAX_RECENT) : [];
  return {
    rounds: count(raw?.rounds),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    finishes: sanitizeTally(raw?.finishes),
    points: sanitizePoints(raw?.points),
    lastWinner:
      typeof raw?.lastWinner === 'string' && raw.lastWinner.length > 0 ? raw.lastWinner : null,
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
  if (state.phase !== 'round-over' || !state.order || state.order.length !== state.playerCount) {
    return record;
  }
  const named = state.order.map((seat) => names[seat] || `@seat${seat + 1}`);
  const points = state.order.map((seat) => state.roundPoints[seat] ?? 0);
  const entry: RoundEntry = {
    order: named,
    points,
    playerCount: state.playerCount,
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  const finishes = { ...record.finishes };
  const totals = { ...record.points };
  named.forEach((name, place) => {
    finishes[name] = (finishes[name] ?? 0) + 1;
    totals[name] = (totals[name] ?? 0) + points[place];
  });
  return {
    rounds: record.rounds + 1,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    finishes,
    points: totals,
    lastWinner: named[0],
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

function isCard(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const card = value as { id?: unknown; rank?: unknown; suit?: unknown };
  return (
    typeof card.id === 'string' &&
    typeof card.rank === 'number' &&
    (card.suit === 'clubs' || card.suit === 'diamonds' || card.suit === 'hearts' || card.suit === 'spades')
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1) return null;
  const state = saved.state;
  if (
    !state ||
    !Array.isArray(state.hands) ||
    state.hands.length !== state.playerCount ||
    state.hands.some((hand) => !Array.isArray(hand) || !hand.every(isCard)) ||
    state.playerCount < 3 ||
    state.playerCount > 6 ||
    (state.phase !== 'playing' && state.phase !== 'tribute') ||
    !Array.isArray(state.scores) ||
    state.scores.length !== state.playerCount ||
    !Array.isArray(state.roundPoints) ||
    state.roundPoints.length !== state.playerCount
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
