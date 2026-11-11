import type { AiLevel } from './ai/ai';
import type { GameState } from './game/four';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface RecentResult {
  winner: 'R' | 'Y' | 'draw';
  mode: 'ai' | 'local';
  at: number;
}

export interface Record {
  version: 2;
  games: number;
  redWins: number;
  yellowWins: number;
  draws: number;
  streak: number;
  lastWinner: 'R' | 'Y' | 'draw' | null;
  recent: RecentResult[];
}

const SAVE_KEY = 'familyarcade.four.save';
const RECORD_KEY = 'familyarcade.four.record';

const EMPTY: Record = {
  version: 2,
  games: 0,
  redWins: 0,
  yellowWins: 0,
  draws: 0,
  streak: 0,
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

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !saved.state) return null;
  if (!Array.isArray(saved.state.board) || saved.state.board.length !== 42) return null;
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
  const stored = read<Partial<Record>>(RECORD_KEY);
  if (!stored || stored.version !== 2) return { ...EMPTY, recent: [] };
  return {
    ...EMPTY,
    ...stored,
    recent: Array.isArray(stored.recent) ? stored.recent.slice(0, 8) : [],
  };
}

export function recordResult(state: GameState, mode: 'ai' | 'local'): Record {
  const record = loadRecord();
  record.games += 1;
  const winner: RecentResult['winner'] =
    state.status === 'draw' ? 'draw' : state.winner === 'R' ? 'R' : 'Y';
  if (winner === 'R') record.redWins += 1;
  else if (winner === 'Y') record.yellowWins += 1;
  else record.draws += 1;
  if (winner !== 'draw' && winner === record.lastWinner) record.streak += 1;
  else record.streak = winner === 'draw' ? 0 : 1;
  record.lastWinner = winner;
  record.recent = [{ winner, mode, at: Date.now() }, ...record.recent].slice(0, 8);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, recent: [] };
}
