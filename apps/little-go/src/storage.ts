import type { AiLevel } from './ai/ai';
import type { GameState, Color } from './game/little-go';

export interface SavedGame {
  version: 2;
  state: GameState;
  history: GameState[];
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface RecordEntry {
  winner: Color;
  mode: 'ai' | 'local';
  margin: number;
  at: number;
}

export interface Record {
  version: 2;
  games: number;
  blackWins: number;
  whiteWins: number;
  streak: number;
  lastWinner: Color | null;
  history: RecordEntry[];
}

const SAVE_KEY = 'familyarcade.little-go.save';
const RECORD_KEY = 'familyarcade.little-go.record';
const MAX_HISTORY = 12;

const EMPTY: Record = {
  version: 2,
  games: 0,
  blackWins: 0,
  whiteWins: 0,
  streak: 0,
  lastWinner: null,
  history: [],
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

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    Array.isArray(state.board) &&
    state.board.length === 81 &&
    (state.turn === 'B' || state.turn === 'W') &&
    (state.status === 'playing' || state.status === 'finished') &&
    Array.isArray(state.moves)
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.state.status !== 'playing') return null;
  const history = Array.isArray(saved.history) ? saved.history.filter(validState) : [];
  return { ...saved, history };
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): void {
  write(SAVE_KEY, {
    ...saved,
    history: saved.history.slice(-120),
    version: 2,
    savedAt: Date.now(),
  });
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecord(): Record {
  const raw = read<Partial<Record>>(RECORD_KEY);
  if (!raw || raw.version !== 2) return { ...EMPTY, history: [] };
  return {
    ...EMPTY,
    ...raw,
    history: Array.isArray(raw.history) ? raw.history.slice(0, MAX_HISTORY) : [],
  };
}

export function recordResult(state: GameState, mode: 'ai' | 'local'): Record {
  const record = loadRecord();
  const winner: Color = state.score?.winner ?? 'B';
  const margin = state.score?.margin ?? 0;
  record.games += 1;
  if (winner === 'B') record.blackWins += 1;
  else record.whiteWins += 1;
  if (record.lastWinner === winner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = winner;
  record.history = [
    { winner, mode, margin, at: Date.now() },
    ...record.history,
  ].slice(0, MAX_HISTORY);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, history: [] };
}

/** Remove the most recent result, used when a finished game is undone. */
export function undoResult(): Record {
  const record = loadRecord();
  const [removed, ...rest] = record.history;
  if (!removed) return record;
  record.games = Math.max(0, record.games - 1);
  if (removed.winner === 'B') record.blackWins = Math.max(0, record.blackWins - 1);
  else record.whiteWins = Math.max(0, record.whiteWins - 1);
  record.history = rest;
  if (rest.length === 0) {
    record.lastWinner = null;
    record.streak = 0;
  } else {
    record.lastWinner = rest[0].winner;
    let streak = 1;
    for (let i = 1; i < rest.length && rest[i].winner === rest[0].winner; i++) streak += 1;
    record.streak = streak;
  }
  write(RECORD_KEY, record);
  return record;
}
