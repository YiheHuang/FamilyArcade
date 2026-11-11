import { AI_LEVELS, type AiLevel } from './ai/ai';
import type { GameState, PlacedTile, Tile } from './game/domino';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  players: 2 | 3 | 4;
  savedAt: number;
}

export interface FamilyRecord {
  matches: number;
  rounds: number;
  wins: number[];
  bestScore: number;
  streak: number;
  lastWinner: number | null;
}

const SAVE_KEY = 'familyarcade.domino-line.save';
const RECORD_KEY = 'familyarcade.domino-line.record';

const EMPTY: FamilyRecord = {
  matches: 0,
  rounds: 0,
  wins: [0, 0, 0, 0],
  bestScore: 0,
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

function isPip(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6;
}

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== 'object') return false;
  const tile = value as Record<string, unknown>;
  return isPip(tile.a) && isPip(tile.b);
}

function isPlaced(value: unknown): value is PlacedTile {
  if (!value || typeof value !== 'object') return false;
  const placed = value as Record<string, unknown>;
  return isTile(placed.tile) && isPip(placed.left) && isPip(placed.right);
}

export function isValidState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const players = state.players;
  if (players !== 2 && players !== 3 && players !== 4) return false;
  if (!Array.isArray(state.hands) || state.hands.length !== players) return false;
  if (!state.hands.every((hand) => Array.isArray(hand) && hand.every(isTile))) return false;
  if (!Array.isArray(state.boneyard) || !state.boneyard.every(isTile)) return false;
  if (!Array.isArray(state.board) || !state.board.every(isPlaced)) return false;
  if (!Array.isArray(state.scores) || state.scores.length !== players) return false;
  if (!state.scores.every((score) => typeof score === 'number' && Number.isFinite(score))) return false;
  if (state.phase !== 'playing' && state.phase !== 'round-over' && state.phase !== 'match-over') {
    return false;
  }
  if (!Number.isInteger(state.turn) || Number(state.turn) < 0 || Number(state.turn) >= players) return false;
  if (!Number.isInteger(state.round) || Number(state.round) < 1) return false;
  if (!Number.isInteger(state.target) || Number(state.target) <= 0) return false;
  if (state.left !== null && !isPip(state.left)) return false;
  if (state.right !== null && !isPip(state.right)) return false;
  if (state.roundWinner !== null && !Number.isInteger(state.roundWinner)) return false;
  if (state.matchWinner !== null && !Number.isInteger(state.matchWinner)) return false;
  if (!Number.isInteger(state.starter) || Number(state.starter) < 0 || Number(state.starter) >= players) {
    return false;
  }
  return true;
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!AI_LEVELS.includes(saved.level)) return null;
  if (!isValidState(saved.state)) return null;
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
  const stored = read<Partial<FamilyRecord>>(RECORD_KEY);
  const wins = Array.isArray(stored?.wins) ? stored.wins.slice(0, 4).map(Number) : [];
  return {
    ...EMPTY,
    ...(stored ?? {}),
    wins: [0, 1, 2, 3].map((index) => (Number.isFinite(wins[index]) ? wins[index] : 0)),
  };
}

export function recordMatch(state: GameState): FamilyRecord {
  const record = loadRecord();
  if (state.matchWinner === null) return record;
  record.matches += 1;
  record.rounds += state.round;
  record.wins[state.matchWinner] = (record.wins[state.matchWinner] ?? 0) + 1;
  record.bestScore = Math.max(record.bestScore, ...state.scores);
  if (record.lastWinner === state.matchWinner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = state.matchWinner;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, wins: [0, 0, 0, 0] };
}

export function recordKey(): string {
  return RECORD_KEY;
}
