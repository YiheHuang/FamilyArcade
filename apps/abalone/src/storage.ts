import type { AiLevel } from './ai/ai';
import type { GameState, Player } from './game/abalone';

export type RecordMode = 'ai' | 'local' | 'lan';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface RecentGame {
  at: number;
  winner: Player | 'draw';
  mode: RecordMode;
  level?: AiLevel;
  moves: number;
}

export interface FamilyRecord {
  games: number;
  winsB: number;
  winsW: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastWinner: Player | 'draw' | null;
  byMode: Record<RecordMode, number>;
  recent: RecentGame[];
}

const SAVE_KEY = 'familyarcade.abalone.save';
const RECORD_KEY = 'familyarcade.abalone.record';

const EMPTY: FamilyRecord = {
  games: 0,
  winsB: 0,
  winsW: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  lastWinner: null,
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

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !saved.state || !Array.isArray(saved.state.board)) {
    return null;
  }
  const state = saved.state;
  if (state.board.length !== 61) return null;
  if (!state.board.every((cell) => cell === null || cell === 'B' || cell === 'W')) return null;
  if (state.turn !== 'B' && state.turn !== 'W') return null;
  if (state.status !== 'playing' && state.status !== 'won') return null;
  if (!state.captured || typeof state.captured.B !== 'number' || typeof state.captured.W !== 'number') {
    return null;
  }
  if (!Array.isArray(state.moves)) return null;
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
  const raw = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!raw) return { ...EMPTY, byMode: { ...EMPTY.byMode }, recent: [] };
  return {
    ...EMPTY,
    ...raw,
    byMode: { ...EMPTY.byMode, ...(raw.byMode ?? {}) },
    recent: Array.isArray(raw.recent) ? raw.recent.slice(0, 8) : [],
  };
}

export function recordResult(
  state: GameState,
  options: { mode: RecordMode; level?: AiLevel },
): FamilyRecord {
  const record = loadRecord();
  const winner: Player | 'draw' = state.winner ?? 'draw';
  record.games += 1;
  if (winner === 'B') record.winsB += 1;
  else if (winner === 'W') record.winsW += 1;
  else record.draws += 1;

  if (winner === record.lastWinner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = winner;
  if (record.streak > record.bestStreak) record.bestStreak = record.streak;

  record.byMode[options.mode] += 1;
  record.recent = [
    {
      at: Date.now(),
      winner,
      mode: options.mode,
      level: options.level,
      moves: state.moves.length,
    },
    ...record.recent,
  ].slice(0, 8);

  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  const empty: FamilyRecord = { ...EMPTY, byMode: { ...EMPTY.byMode }, recent: [] };
  write(RECORD_KEY, empty);
  return empty;
}
