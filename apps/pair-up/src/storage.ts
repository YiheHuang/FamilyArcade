import type { AiLevel } from './ai/ai';
import { deserialize, type GameState } from './game/pair-up';

export interface SavedGame {
  version: 2;
  mode: 'ai' | 'local';
  state: GameState;
  names: string[];
  levels: AiLevel[];
  savedAt: number;
}

export interface FamilyRecord {
  version: 1;
  games: number;
  soloHumanWins: number;
  aiWins: number;
  localWins: number;
  ties: number;
  streak: number;
  bestStreak: number;
  lastWinner: string | null;
  winsByName: Record<string, number>;
}

const SAVE_KEY = 'familyarcade.pair-up.save';
const RECORD_KEY = 'familyarcade.pair-up.record';

const EMPTY: FamilyRecord = {
  version: 1,
  games: 0,
  soloHumanWins: 0,
  aiWins: 0,
  localWins: 0,
  ties: 0,
  streak: 0,
  bestStreak: 0,
  lastWinner: null,
  winsByName: {},
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
    /* quota / private mode */
  }
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!Array.isArray(saved.names) || !Array.isArray(saved.levels)) return null;
  const state = deserialize(JSON.stringify(saved.state));
  if (!state) return null;
  if (saved.names.length !== state.playerCount) return null;
  if (saved.mode === 'ai' && saved.levels.length !== state.playerCount) return null;
  return { ...saved, state };
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): void {
  write(SAVE_KEY, { ...saved, version: 2, savedAt: Date.now() });
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecord(): FamilyRecord {
  const parsed = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!parsed) return { ...EMPTY, winsByName: {} };
  return {
    ...EMPTY,
    ...parsed,
    version: 1,
    winsByName: { ...(parsed.winsByName ?? {}) },
  };
}

export function recordResult(
  state: GameState,
  names: readonly string[],
  mode: 'ai' | 'local' | 'lan-host',
): FamilyRecord {
  const record = loadRecord();
  record.games += 1;
  if (state.winner === null) {
    record.ties += 1;
    record.streak = 0;
    record.lastWinner = null;
  } else {
    const name = names[state.winner]?.trim() || `P${state.winner + 1}`;
    record.winsByName[name] = (record.winsByName[name] ?? 0) + 1;
    if (mode === 'ai') {
      if (state.winner === 0) record.soloHumanWins += 1;
      else record.aiWins += 1;
    } else {
      record.localWins += 1;
    }
    record.streak = name === record.lastWinner ? record.streak + 1 : 1;
    record.bestStreak = Math.max(record.bestStreak, record.streak);
    record.lastWinner = name;
  }
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  const empty = { ...EMPTY, winsByName: {} };
  write(RECORD_KEY, empty);
  return empty;
}

export function topWinners(record: FamilyRecord, limit = 4): [string, number][] {
  return Object.entries(record.winsByName)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

