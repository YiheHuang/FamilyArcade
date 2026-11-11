import type { AiLevel } from './ai/ai';
import type { GameState, Side } from './game/draughts';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  humanSide: Side;
  savedAt: number;
}

export interface RecordEntry {
  winner: Side | 'draw';
  at: number;
}

export interface FamilyRecord {
  games: number;
  redWins: number;
  whiteWins: number;
  draws: number;
  streak: number;
  lastWinner: Side | 'draw' | null;
  recent: RecordEntry[];
}

const SAVE_KEY = 'familyarcade.draughts.save';
const RECORD_KEY = 'familyarcade.draughts.record';
const SOUND_KEY = 'familyarcade.draughts.sound';

const EMPTY: FamilyRecord = {
  games: 0,
  redWins: 0,
  whiteWins: 0,
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
  if (
    !saved ||
    saved.version !== 2 ||
    !saved.state ||
    !Array.isArray(saved.state.board) ||
    saved.state.board.length !== 64
  ) {
    return null;
  }
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
  if (!stored) return { ...EMPTY, recent: [] };
  return {
    ...EMPTY,
    ...stored,
    recent: Array.isArray(stored.recent) ? stored.recent.slice(-12) : [],
  };
}

export function recordResult(state: GameState): FamilyRecord {
  const record = loadRecord();
  const result: Side | 'draw' =
    state.status === 'draw' ? 'draw' : (state.winner ?? 'draw');
  record.games += 1;
  if (result === 'red') record.redWins += 1;
  else if (result === 'white') record.whiteWins += 1;
  else record.draws += 1;
  if (result !== 'draw' && result === record.lastWinner) {
    record.streak += 1;
  } else {
    record.streak = result === 'draw' ? 0 : 1;
  }
  record.lastWinner = result;
  record.recent = [...record.recent, { winner: result, at: Date.now() }].slice(-12);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  const empty = { ...EMPTY, recent: [] };
  write(RECORD_KEY, empty);
  return empty;
}

export function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
