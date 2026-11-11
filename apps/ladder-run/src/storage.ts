import type { AiLevel, GameState } from './game/ladder-run';
import { isGameState } from './game/ladder-run';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface Record {
  games: number;
  wins: [number, number, number, number];
  streak: number;
  bestStreak: number;
  lastWinner: number | null;
  lastWinnerName: string | null;
}

const SAVE_KEY = 'familyarcade.ladder-run.save';
const RECORD_KEY = 'familyarcade.ladder-run.record';

export function emptyRecord(): Record {
  return {
    games: 0,
    wins: [0, 0, 0, 0],
    streak: 0,
    bestStreak: 0,
    lastWinner: null,
    lastWinnerName: null,
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

export function loadSave(): SavedGame | null {
  const saved = read<Partial<SavedGame>>(SAVE_KEY);
  if (!saved || saved.version !== 2) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!isGameState(saved.state)) return null;
  if (!saved.savedAt || typeof saved.savedAt !== 'number') return null;
  return saved as SavedGame;
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
  const saved = read<Partial<Record>>(RECORD_KEY);
  const empty = emptyRecord();
  if (!saved) return empty;
  const wins = Array.isArray(saved.wins) ? saved.wins : [];
  return {
    games: Number.isInteger(saved.games) && saved.games! >= 0 ? saved.games! : 0,
    wins: [0, 1, 2, 3].map((seat) => (Number.isInteger(wins[seat]) && wins[seat] >= 0 ? wins[seat] : 0)) as Record['wins'],
    streak: Number.isInteger(saved.streak) && saved.streak! >= 0 ? saved.streak! : 0,
    bestStreak: Number.isInteger(saved.bestStreak) && saved.bestStreak! >= 0 ? saved.bestStreak! : 0,
    lastWinner:
      typeof saved.lastWinner === 'number' && saved.lastWinner >= 0 && saved.lastWinner < 4
        ? saved.lastWinner
        : null,
    lastWinnerName: typeof saved.lastWinnerName === 'string' ? saved.lastWinnerName : null,
  };
}

export function recordResult(state: GameState): Record {
  const record = loadRecord();
  if (state.status !== 'won' || state.winner === null) return record;
  const winner = state.winner;
  record.games += 1;
  if (winner >= 0 && winner < 4) record.wins[winner] += 1;
  record.streak = record.lastWinner === winner ? record.streak + 1 : 1;
  record.bestStreak = Math.max(record.bestStreak, record.streak);
  record.lastWinner = winner;
  record.lastWinnerName = state.players[winner]?.name ?? null;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  const empty = emptyRecord();
  write(RECORD_KEY, empty);
  return empty;
}
