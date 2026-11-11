import type { AiLevel } from './ai/ai';
import type { GameState } from './game/flip';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordWinner = 'B' | 'W' | 'draw' | null;

export interface Record {
  games: number;
  winsBlack: number;
  winsWhite: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastWinner: RecordWinner;
}

const SAVE_KEY = 'familyarcade.flip.save';
const RECORD_KEY = 'familyarcade.flip.record';

const EMPTY: Record = {
  games: 0,
  winsBlack: 0,
  winsWhite: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  lastWinner: null,
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
    saved.state.board.length !== 64 ||
    saved.state.status !== 'playing'
  ) {
    return null;
  }
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): void {
  write(SAVE_KEY, { ...saved, version: 1, savedAt: Date.now() });
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecord(): Record {
  return { ...EMPTY, ...(read<Partial<Record>>(RECORD_KEY) ?? {}) };
}

export function recordResult(state: GameState): Record {
  const record = loadRecord();
  record.games += 1;

  const winner: RecordWinner = state.status === 'draw' ? 'draw' : state.winner;
  if (winner === 'B') record.winsBlack += 1;
  else if (winner === 'W') record.winsWhite += 1;
  else if (winner === 'draw') record.draws += 1;

  if (winner && winner === record.lastWinner) record.streak += 1;
  else record.streak = winner ? 1 : 0;
  record.bestStreak = Math.max(record.bestStreak, record.streak);
  record.lastWinner = winner;

  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY };
}
