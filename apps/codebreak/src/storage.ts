import type { AiLevel } from './ai/ai';
import type { GameState } from './game/codebreak';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type Outcome = 'breaker' | 'setter';

export interface FamilyRecord {
  games: number;
  cracked: number;
  held: number;
  bestGuesses: number | null;
  lastOutcome: Outcome | null;
  streak: number;
  recent: Outcome[];
}

const SAVE_KEY = 'familyarcade.codebreak.save';
const RECORD_KEY = 'familyarcade.codebreak.record';
const MAX_RECENT = 12;

const EMPTY: FamilyRecord = {
  games: 0,
  cracked: 0,
  held: 0,
  bestGuesses: null,
  lastOutcome: null,
  streak: 0,
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

function isState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    (state.setterSeat === 0 || state.setterSeat === 1) &&
    (state.breakerSeat === 0 || state.breakerSeat === 1) &&
    Array.isArray(state.guesses) &&
    Array.isArray(state.revealed) &&
    typeof state.maxGuesses === 'number' &&
    typeof state.hintsLeft === 'number' &&
    (state.status === 'setting' ||
      state.status === 'playing' ||
      state.status === 'won' ||
      state.status === 'lost') &&
    (state.secret === null || Array.isArray(state.secret))
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !isState(saved.state)) return null;
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
  const stored = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!stored) return { ...EMPTY, recent: [] };
  const recent = Array.isArray(stored.recent)
    ? stored.recent.filter((item): item is Outcome => item === 'breaker' || item === 'setter').slice(-MAX_RECENT)
    : [];
  return {
    games: Number.isFinite(stored.games) ? Number(stored.games) : 0,
    cracked: Number.isFinite(stored.cracked) ? Number(stored.cracked) : 0,
    held: Number.isFinite(stored.held) ? Number(stored.held) : 0,
    bestGuesses:
      typeof stored.bestGuesses === 'number' && stored.bestGuesses > 0 ? stored.bestGuesses : null,
    lastOutcome:
      stored.lastOutcome === 'breaker' || stored.lastOutcome === 'setter' ? stored.lastOutcome : null,
    streak: Number.isFinite(stored.streak) ? Number(stored.streak) : 0,
    recent,
  };
}

export function recordResult(state: GameState): FamilyRecord {
  const record = loadRecord();
  if (state.status !== 'won' && state.status !== 'lost') return record;
  const outcome: Outcome = state.status === 'won' ? 'breaker' : 'setter';
  record.games += 1;
  if (outcome === 'breaker') {
    record.cracked += 1;
    record.streak += 1;
    if (record.bestGuesses === null || state.guesses.length < record.bestGuesses) {
      record.bestGuesses = state.guesses.length;
    }
  } else {
    record.held += 1;
    record.streak = 0;
  }
  record.lastOutcome = outcome;
  record.recent = [...record.recent, outcome].slice(-MAX_RECENT);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, recent: [] };
}

