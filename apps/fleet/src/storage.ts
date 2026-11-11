import type { AiLevel } from './ai/ai';
import type { GameState } from './game/fleet';

export type LocalMode = 'ai' | 'local';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: LocalMode;
  level: AiLevel;
  savedAt: number;
}

export interface FamilyRecord {
  games: number;
  wins0: number;
  wins1: number;
  aiGames: number;
  aiWins: number;
  streak: number;
  lastWinner: 0 | 1 | null;
}

const SAVE_KEY = 'familyarcade.fleet.save';
const RECORD_KEY = 'familyarcade.fleet.record';

const EMPTY: FamilyRecord = {
  games: 0,
  wins0: 0,
  wins1: 0,
  aiGames: 0,
  aiWins: 0,
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

function looksLikeState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (!['placing', 'playing', 'finished'].includes(String(state.phase))) return false;
  if (state.turn !== 0 && state.turn !== 1) return false;
  if (state.first !== 0 && state.first !== 1) return false;
  if (state.winner !== null && state.winner !== 0 && state.winner !== 1) return false;
  if (!Array.isArray(state.ready) || state.ready.length !== 2) return false;
  if (!Array.isArray(state.moves)) return false;
  if (!Array.isArray(state.boards) || state.boards.length !== 2) return false;
  return state.boards.every(
    (board) =>
      board &&
      Array.isArray(board.ships) &&
      Array.isArray(board.shots) &&
      board.ships.every((ship) => ship && typeof ship.id === 'string' && Array.isArray(ship.cells)) &&
      board.shots.every((shot) => shot && Number.isInteger(shot.cell)),
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !looksLikeState(saved.state)) return null;
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

export function loadRecord(): FamilyRecord {
  return { ...EMPTY, ...(read<Partial<FamilyRecord>>(RECORD_KEY) ?? {}) };
}

export function recordResult(state: GameState, mode: LocalMode): FamilyRecord {
  const record = loadRecord();
  const winner = state.winner;
  record.games += 1;
  if (winner === 0) record.wins0 += 1;
  if (winner === 1) record.wins1 += 1;
  if (mode === 'ai') {
    record.aiGames += 1;
    if (winner === 0) record.aiWins += 1;
  }
  if (winner !== null && winner === record.lastWinner) record.streak += 1;
  else record.streak = winner === null ? 0 : 1;
  record.lastWinner = winner;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY };
}
