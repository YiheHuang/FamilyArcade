import type { AiLevel } from './ai/ai';
import type { GameState } from './game/chess';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface Record {
  games: number;
  winsW: number;
  winsB: number;
  draws: number;
  streak: number;
  lastWinner: 'w' | 'b' | 'draw' | null;
}

const SAVE_KEY = 'familyarcade.mini-chess.save';
const RECORD_KEY = 'familyarcade.mini-chess.record';

const EMPTY: Record = {
  games: 0,
  winsW: 0,
  winsB: 0,
  draws: 0,
  streak: 0,
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
  if (!saved || saved.version !== 1 || !saved.state) return null;
  const state = saved.state;
  if (!Array.isArray(state.board) || state.board.length !== 30) return null;
  if (state.turn !== 'w' && state.turn !== 'b') return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
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
  const winner = state.status === 'checkmate' ? state.winner : 'draw';
  if (winner === 'w') record.winsW += 1;
  else if (winner === 'b') record.winsB += 1;
  else if (winner === 'draw') record.draws += 1;
  if (winner && winner === record.lastWinner) record.streak += 1;
  else record.streak = winner ? 1 : 0;
  record.lastWinner = winner ?? null;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY };
}
