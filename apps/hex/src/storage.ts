import type { AiLevel } from './ai/ai';
import { CELL_COUNT, type GameState, type Player } from './game/hex';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  humanSide: Player;
  savedAt: number;
}

export interface ResultEntry {
  winner: Player;
  at: number;
}

export interface FamilyRecord {
  games: number;
  redWins: number;
  blueWins: number;
  streak: number;
  lastWinner: Player | null;
  history: ResultEntry[];
}

const SAVE_KEY = 'familyarcade.hex.save';
const RECORD_KEY = 'familyarcade.hex.record';

const EMPTY: FamilyRecord = {
  games: 0,
  redWins: 0,
  blueWins: 0,
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

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (
    !saved ||
    saved.version !== 1 ||
    !saved.state ||
    !Array.isArray(saved.state.board) ||
    saved.state.board.length !== CELL_COUNT ||
    (saved.state.status !== 'playing' && saved.state.status !== 'won')
  ) {
    return null;
  }
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
  const saved = read<Partial<FamilyRecord> & { winsX?: number; winsO?: number }>(RECORD_KEY);
  if (!saved) return { ...EMPTY, history: [] };
  return {
    ...EMPTY,
    ...saved,
    redWins: saved.redWins ?? saved.winsX ?? 0,
    blueWins: saved.blueWins ?? saved.winsO ?? 0,
    history: Array.isArray(saved.history) ? saved.history.slice(-12) : [],
  };
}

export function recordResult(state: GameState): FamilyRecord {
  const record = loadRecord();
  if (state.status !== 'won' || !state.winner) return record;
  const winner = state.winner;
  record.games += 1;
  if (winner === 'R') record.redWins += 1;
  else record.blueWins += 1;
  if (record.lastWinner === winner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = winner;
  record.history = [...record.history, { winner, at: Date.now() }].slice(-12);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, history: [] };
}
