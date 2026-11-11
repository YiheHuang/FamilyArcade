import type { AiLevel } from './ai/ai';
import {
  isGameState,
  standings,
  totalsFor,
  winners,
  type GameState,
} from './game/five-dice';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface RecentGame {
  at: number;
  players: string[];
  scores: number[];
  winner: string | null;
  tied: boolean;
}

export interface Record {
  games: number;
  bestScore: number;
  bestBy: string;
  ties: number;
  lastWinner: string | null;
  streak: number;
  streakBy: string | null;
  history: RecentGame[];
}

const SAVE_KEY = 'familyarcade.five-dice.save';
const RECORD_KEY = 'familyarcade.five-dice.record';
const MAX_HISTORY = 10;

const EMPTY: Record = {
  games: 0,
  bestScore: 0,
  bestBy: '',
  ties: 0,
  lastWinner: null,
  streak: 0,
  streakBy: null,
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
  if (!saved || saved.version !== 1 || !isGameState(saved.state)) return null;
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
  const saved = read<Partial<Record>>(RECORD_KEY);
  if (!saved) return { ...EMPTY };
  const history = Array.isArray(saved.history)
    ? saved.history
        .filter(
          (game): game is RecentGame =>
            Boolean(game) &&
            Array.isArray(game.players) &&
            Array.isArray(game.scores) &&
            typeof game.at === 'number',
        )
        .slice(0, MAX_HISTORY)
    : [];
  return {
    ...EMPTY,
    ...saved,
    history,
  };
}

export function recordResult(state: GameState): Record {
  const record = loadRecord();
  record.games += 1;
  const totals = state.scores.map((line) => totalsFor(line).total);
  const championSeats = winners(state);
  const names = championSeats.map((seat) => state.players[seat]?.name ?? `Player ${seat + 1}`);
  const tied = names.length > 1;
  const winner = tied ? names.join(' & ') : names[0] ?? null;

  const top = Math.max(...totals);
  const topSeat = totals.indexOf(top);
  if (top > record.bestScore) {
    record.bestScore = top;
    record.bestBy = state.players[topSeat]?.name ?? '';
  }

  if (tied) {
    record.ties += 1;
    record.streak = 0;
    record.streakBy = null;
  } else if (winner) {
    if (record.streakBy === winner) record.streak += 1;
    else {
      record.streak = 1;
      record.streakBy = winner;
    }
  }
  record.lastWinner = winner;

  const result: RecentGame = {
    at: Date.now(),
    players: state.players.map((player) => player.name),
    scores: totals,
    winner,
    tied,
  };
  record.history = [result, ...record.history].slice(0, MAX_HISTORY);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, history: [] };
}

/** Used by the screenshot script to make the record screen look lived-in. */
export function seedRecord(record: Record): Record {
  write(RECORD_KEY, record);
  return record;
}

export function standingsSummary(state: GameState): Array<{ name: string; total: number; rank: number }> {
  return standings(state).map((row) => ({
    name: state.players[row.player]?.name ?? `Player ${row.player + 1}`,
    total: row.total,
    rank: row.rank,
  }));
}
