import type { AiLevel } from './ai/ai';
import { COLORS, HOME, type Color, type GameState } from './game/race-home';

export type SaveMode = 'ai' | 'local';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: SaveMode;
  level: AiLevel;
  savedAt: number;
}

export interface FamilyRecord {
  games: number;
  wins: Record<Color, number>;
  soloGames: number;
  familyWins: number;
  aiWins: number;
  bestRolls: number | null;
  lastWinner: Color | null;
}

const SAVE_KEY = 'familyarcade.race-home.save';
const RECORD_KEY = 'familyarcade.race-home.record';

function emptyRecord(): FamilyRecord {
  return {
    games: 0,
    wins: { red: 0, green: 0, yellow: 0, blue: 0 },
    soloGames: 0,
    familyWins: 0,
    aiWins: 0,
    bestRolls: null,
    lastWinner: null,
  };
}

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

function plausibleState(state: GameState | undefined): state is GameState {
  if (!state) return false;
  if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) return false;
  if (!state.players.every((color) => COLORS.includes(color))) return false;
  if (!state.pawns || !COLORS.every((color) => Array.isArray(state.pawns[color]))) return false;
  for (const color of COLORS) {
    const pawns = state.pawns[color];
    if (pawns.length !== 4) return false;
    if (!pawns.every((pos) => Number.isInteger(pos) && pos >= -1 && pos <= HOME)) return false;
  }
  if (state.turn < 0 || state.turn >= state.players.length) return false;
  if (state.phase !== 'roll' && state.phase !== 'move' && state.phase !== 'over') return false;
  return true;
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2) return null;
  if (!plausibleState(saved.state)) return null;
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
  const saved = read<Partial<FamilyRecord>>(RECORD_KEY);
  const empty = emptyRecord();
  if (!saved) return empty;
  return {
    ...empty,
    ...saved,
    wins: { ...empty.wins, ...(saved.wins ?? {}) },
  };
}

export function recordResult(state: GameState, mode: SaveMode): FamilyRecord {
  const record = loadRecord();
  if (!state.winner) return record;
  const winner = state.winner;
  record.games += 1;
  record.wins[winner] += 1;
  if (mode === 'ai') {
    record.soloGames += 1;
    if (winner === 'red') record.familyWins += 1;
    else record.aiWins += 1;
  }
  if (state.rolls > 0) {
    record.bestRolls = record.bestRolls === null ? state.rolls : Math.min(record.bestRolls, state.rolls);
  }
  record.lastWinner = winner;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  const empty = emptyRecord();
  write(RECORD_KEY, empty);
  return empty;
}
