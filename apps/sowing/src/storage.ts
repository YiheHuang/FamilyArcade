import type { AiLevel } from './ai/ai';
import type { GameState, Player } from './game/sowing';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface Record {
  games: number;
  wins0: number;
  wins1: number;
  draws: number;
  streak: number;
  lastWinner: Player | 'draw' | null;
}

const SAVE_KEY = 'familyarcade.sowing.save';
const RECORD_KEY = 'familyarcade.sowing.record';

const EMPTY: Record = {
  games: 0,
  wins0: 0,
  wins1: 0,
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

function validState(state: GameState | undefined): state is GameState {
  if (!state) return false;
  if (!Array.isArray(state.pits) || state.pits.length !== 14) return false;
  if (!state.pits.every((value) => Number.isFinite(value) && value >= 0)) return false;
  if (!Array.isArray(state.stores) || state.stores.length !== 2) return false;
  if (!state.stores.every((value) => Number.isFinite(value) && value >= 0)) return false;
  if (state.turn !== 0 && state.turn !== 1) return false;
  if (state.status !== 'playing' && state.status !== 'ended') return false;
  if (!Array.isArray(state.moves)) return false;
  return true;
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  return saved;
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

export function loadRecord(): Record {
  const stored = read<Partial<Record>>(RECORD_KEY) ?? {};
  return {
    ...EMPTY,
    ...stored,
    games: Math.max(0, Math.trunc(stored.games ?? 0)),
    wins0: Math.max(0, Math.trunc(stored.wins0 ?? 0)),
    wins1: Math.max(0, Math.trunc(stored.wins1 ?? 0)),
    draws: Math.max(0, Math.trunc(stored.draws ?? 0)),
  };
}

export function recordResult(state: GameState): Record {
  const record = loadRecord();
  record.games += 1;
  const winner: Player | 'draw' = state.winner === null ? 'draw' : state.winner;
  if (winner === 0) record.wins0 += 1;
  else if (winner === 1) record.wins1 += 1;
  else record.draws += 1;
  if (record.lastWinner === winner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = winner;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY };
}
