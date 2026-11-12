import type { AiLevel } from './ai/ai';
import type { DealResult, GameState, NormalRank, Team, TrumpSuit } from './game/sheng-ji';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  names: string[];
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface DealRecord {
  deal: number;
  winnerTeam: Team;
  declarerTeam: Team;
  success: boolean;
  jump: number;
  declarerPoints: number;
  defenderPoints: number;
  levels: [number, number];
  trump: TrumpSuit;
  levelRank: NormalRank;
  mode: RecordMode;
  level?: AiLevel;
  at: number;
}

export interface FamilyRecord {
  deals: number;
  byMode: Record<RecordMode, number>;
  declarerUpgrades: number;
  defenderHolds: number;
  biggestJump: number;
  lastDeal: DealRecord | null;
  recent: DealRecord[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.sheng-ji.save';
const RECORD_KEY = 'familyarcade.sheng-ji.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  deals: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  declarerUpgrades: 0,
  defenderHolds: 0,
  biggestJump: 0,
  lastDeal: null,
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

function isTeam(value: unknown): value is Team {
  return value === 0 || value === 1;
}

function isLevel(value: unknown): value is AiLevel {
  return value === 'companion' || value === 'easy' || value === 'normal' || value === 'hard';
}

function isTrump(value: unknown): value is TrumpSuit {
  return value === 'S' || value === 'H' || value === 'D' || value === 'C' || value === 'NT';
}

function isEntry(value: unknown): value is DealRecord {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DealRecord>;
  return (
    typeof entry.deal === 'number' &&
    Number.isFinite(entry.deal) &&
    isTeam(entry.winnerTeam) &&
    isTeam(entry.declarerTeam) &&
    typeof entry.success === 'boolean' &&
    typeof entry.jump === 'number' &&
    Number.isFinite(entry.jump) &&
    typeof entry.declarerPoints === 'number' &&
    Number.isFinite(entry.declarerPoints) &&
    typeof entry.defenderPoints === 'number' &&
    Number.isFinite(entry.defenderPoints) &&
    Array.isArray(entry.levels) &&
    entry.levels.length === 2 &&
    entry.levels.every((level) => typeof level === 'number' && Number.isFinite(level)) &&
    isTrump(entry.trump) &&
    typeof entry.levelRank === 'string' &&
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
    deals: count(raw?.deals),
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    declarerUpgrades: count(raw?.declarerUpgrades),
    defenderHolds: count(raw?.defenderHolds),
    biggestJump: count(raw?.biggestJump),
    lastDeal: isEntry(raw?.lastDeal) ? raw.lastDeal : null,
    recent,
  };
}

export function addDeal(
  record: FamilyRecord,
  result: DealResult,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  const entry: DealRecord = {
    deal: result.deal,
    winnerTeam: result.upgradeTeam,
    declarerTeam: result.declarerTeam,
    success: result.success,
    jump: result.jump,
    declarerPoints: result.declarerPoints,
    defenderPoints: result.defenderPoints,
    levels: [result.levelsAfter[0], result.levelsAfter[1]],
    trump: result.trump,
    levelRank: result.levelRank,
    mode: meta.mode,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    deals: record.deals + 1,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    declarerUpgrades: record.declarerUpgrades + (result.success ? 1 : 0),
    defenderHolds: record.defenderHolds + (result.success ? 0 : 1),
    biggestJump: Math.max(record.biggestJump, result.jump),
    lastDeal: entry,
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
    (state.phase !== 'declare' &&
      state.phase !== 'bury' &&
      state.phase !== 'play' &&
      state.phase !== 'deal-over') ||
    !Array.isArray(state.buried) ||
    !Array.isArray(state.results)
  ) {
    return null;
  }
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!isLevel(saved.level)) return null;
  if (!Array.isArray(saved.names) || saved.names.length !== 4) saved.names = [];
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

export function recordDeal(
  state: GameState,
  meta: ResultMeta,
  at = Date.now(),
): FamilyRecord {
  const result = state.results[state.results.length - 1];
  if (!result) return loadRecord();
  const record = addDeal(loadRecord(), result, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
