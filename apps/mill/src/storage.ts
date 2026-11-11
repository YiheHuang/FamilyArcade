import type { AiLevel } from './ai/ai';
import type { GameState, Player } from './game/mill';

export type SavedMode = 'ai' | 'local';
export type RecordMode = 'solo' | 'hotseat' | 'lan';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: SavedMode;
  level: AiLevel;
  human: Player;
  savedAt: number;
}

export interface RecentResult {
  winner: Player | null;
  draw: boolean;
  mode: RecordMode;
  moves: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsW: number;
  winsB: number;
  draws: number;
  streak: number;
  streakSide: Player | null;
  lastWinner: Player | 'draw' | null;
  byMode: Record<RecordMode, number>;
  recent: RecentResult[];
}

const SAVE_KEY = 'familyarcade.mill.save';
const RECORD_KEY = 'familyarcade.mill.record';

const EMPTY: FamilyRecord = {
  games: 0,
  winsW: 0,
  winsB: 0,
  draws: 0,
  streak: 0,
  streakSide: null,
  lastWinner: null,
  byMode: { solo: 0, hotseat: 0, lan: 0 },
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

function validState(state: unknown): state is GameState {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as Partial<GameState>;
  return (
    Array.isArray(candidate.board) &&
    candidate.board.length === 24 &&
    (candidate.turn === 'W' || candidate.turn === 'B') &&
    (candidate.phase === 'placing' || candidate.phase === 'moving' || candidate.phase === 'ended') &&
    (candidate.status === 'playing' || candidate.status === 'won' || candidate.status === 'draw') &&
    Boolean(candidate.hand) &&
    Boolean(candidate.onBoard)
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.state.status !== 'playing') return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (saved.human !== 'W' && saved.human !== 'B') return null;
  return saved;
}

export function saveGame(saved: Omit<SavedGame, 'version' | 'savedAt'>): SavedGame {
  const full: SavedGame = { ...saved, version: 2, savedAt: Date.now() };
  write(SAVE_KEY, full);
  return full;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecord(): FamilyRecord {
  const raw = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!raw) return { ...EMPTY, byMode: { ...EMPTY.byMode }, recent: [] };
  return {
    ...EMPTY,
    ...raw,
    byMode: { ...EMPTY.byMode, ...(raw.byMode ?? {}) },
    recent: Array.isArray(raw.recent) ? raw.recent.slice(0, 8) : [],
  };
}

export function recordResult(state: GameState, mode: RecordMode): FamilyRecord {
  const record = loadRecord();
  record.games += 1;
  record.byMode[mode] = (record.byMode[mode] ?? 0) + 1;
  const winner: Player | 'draw' = state.status === 'draw' ? 'draw' : (state.winner ?? 'draw');
  if (winner === 'W') record.winsW += 1;
  else if (winner === 'B') record.winsB += 1;
  else record.draws += 1;

  if (winner === 'draw') {
    record.streak = 0;
    record.streakSide = null;
    record.lastWinner = 'draw';
  } else {
    if (record.streakSide === winner) record.streak += 1;
    else {
      record.streak = 1;
      record.streakSide = winner;
    }
    record.lastWinner = winner;
  }

  record.recent = [
    {
      winner: winner === 'draw' ? null : winner,
      draw: winner === 'draw',
      mode,
      moves: state.moveCount,
      at: Date.now(),
    },
    ...record.recent,
  ].slice(0, 8);

  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, byMode: { ...EMPTY.byMode }, recent: [] };
}
