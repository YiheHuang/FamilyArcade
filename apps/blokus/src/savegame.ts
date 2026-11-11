import type { Difficulty } from './ai/types';
import { Game } from './game/engine';
import type { Action, GameConfig } from './game/types';
import type { GameMode } from './records';

/** seat snapshot stored with a resumable game (connection flags are live data) */
export interface SavedSeat {
  name: string;
  kind: 'human' | 'ai' | 'remote';
}

export interface SavedGame {
  v: 1;
  savedAt: number;
  mode: GameMode;
  config: GameConfig;
  seats: SavedSeat[];
  localSeats: number[];
  difficulty?: Difficulty;
  history: Action[];
}

const KEY = 'blokus.current';

/** persist the running game (called after every applied action) */
export function saveInProgress(save: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Read the last running game. Returns null when there is none, when the
 * format version is unknown, or when the history does not replay cleanly
 * (a corrupt save must never break startup).
 */
export function loadInProgress(): SavedGame | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedGame | null;
    if (!raw || raw.v !== 1) return null;
    if (typeof raw.savedAt !== 'number' || !Array.isArray(raw.history)) return null;
    const config = raw.config as GameConfig | undefined;
    if (!config || !Array.isArray(raw.seats) || !Array.isArray(raw.localSeats)) return null;
    // replays the whole history — throws on any illegal action
    new Game(config, raw.history);
    return raw;
  } catch {
    return null;
  }
}

export function clearInProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** LAN games cannot continue without the room — they can only be reviewed */
export function canContinue(save: SavedGame): boolean {
  return save.mode !== 'lan';
}
