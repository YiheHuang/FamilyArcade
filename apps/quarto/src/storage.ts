import type { AiLevel } from './ai/ai';
import type { GameState, Player } from './game/quarto';

export type RecordMode = 'ai' | 'local' | 'lan';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export interface RecordEntry {
  winner: Player | 'draw';
  mode: RecordMode;
  level?: AiLevel;
  placements: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsP1: number;
  winsP2: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastWinner: Player | 'draw' | null;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

const SAVE_KEY = 'familyarcade.quarto.save';
const RECORD_KEY = 'familyarcade.quarto.record';

const EMPTY: FamilyRecord = {
  games: 0,
  winsP1: 0,
  winsP2: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  lastWinner: null,
  byMode: { ai: 0, local: 0, lan: 0 },
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

function validState(state: GameState | undefined): state is GameState {
  return Boolean(
    state &&
      Array.isArray(state.board) &&
      state.board.length === 16 &&
      Array.isArray(state.pool) &&
      Array.isArray(state.actions) &&
      (state.phase === 'choose' || state.phase === 'place') &&
      (state.status === 'playing' || state.status === 'won' || state.status === 'draw'),
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (
    !saved ||
    saved.version !== 1 ||
    !validState(saved.state) ||
    (saved.mode !== 'ai' && saved.mode !== 'local')
  ) {
    return null;
  }
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const value: SavedGame = { ...saved, version: 1, savedAt: Date.now() };
  write(SAVE_KEY, value);
  return value;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

type StoredRecord = Partial<FamilyRecord> & {
  winsX?: number;
  winsO?: number;
};

export function loadRecord(): FamilyRecord {
  const raw = read<StoredRecord>(RECORD_KEY) ?? {};
  const winsP1 = raw.winsP1 ?? raw.winsX ?? 0;
  const winsP2 = raw.winsP2 ?? raw.winsO ?? 0;
  return {
    ...EMPTY,
    ...raw,
    winsP1,
    winsP2,
    byMode: { ...EMPTY.byMode, ...(raw.byMode ?? {}) },
    recent: Array.isArray(raw.recent) ? raw.recent : [],
  };
}

export function recordResult(
  state: GameState,
  options: { mode: RecordMode; level?: AiLevel },
): FamilyRecord {
  const record = loadRecord();
  record.games += 1;
  const winner: Player | 'draw' = state.status === 'draw' ? 'draw' : (state.winner ?? 'draw');

  if (winner === 0) record.winsP1 += 1;
  else if (winner === 1) record.winsP2 += 1;
  else record.draws += 1;

  if (winner === record.lastWinner) record.streak += 1;
  else record.streak = 1;
  if (record.streak > record.bestStreak) record.bestStreak = record.streak;
  record.lastWinner = winner;

  record.byMode[options.mode] += 1;
  record.recent = [
    {
      winner,
      mode: options.mode,
      level: options.level,
      placements: state.placements,
      at: Date.now(),
    },
    ...record.recent,
  ].slice(0, 8);

  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return {
    ...EMPTY,
    byMode: { ...EMPTY.byMode },
    recent: [],
  };
}
