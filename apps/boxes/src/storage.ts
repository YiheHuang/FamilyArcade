import type { AiLevel } from './ai/ai';
import { BOX_COUNT, EDGE_COUNT, type GameState } from './game/boxes';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordWinner = 'p1' | 'p2' | 'draw';

export interface RecordEntry {
  winner: RecordWinner;
  scores: [number, number];
  mode: 'ai' | 'local';
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsP1: number;
  winsP2: number;
  draws: number;
  boxesP1: number;
  boxesP2: number;
  lastWinner: RecordWinner | null;
  streak: number;
  recent: RecordEntry[];
}

const SAVE_KEY = 'familyarcade.boxes.save';
const RECORD_KEY = 'familyarcade.boxes.record';
const MAX_RECENT = 8;
const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

const EMPTY: FamilyRecord = {
  games: 0,
  winsP1: 0,
  winsP2: 0,
  draws: 0,
  boxesP1: 0,
  boxesP2: 0,
  lastWinner: null,
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

function validState(state: GameState | undefined): state is GameState {
  return Boolean(
    state &&
      Array.isArray(state.edges) &&
      state.edges.length === EDGE_COUNT &&
      Array.isArray(state.edgeOwners) &&
      state.edgeOwners.length === EDGE_COUNT &&
      Array.isArray(state.owners) &&
      state.owners.length === BOX_COUNT &&
      Array.isArray(state.moves) &&
      Array.isArray(state.scores) &&
      state.scores.length === 2 &&
      (state.turn === 0 || state.turn === 1) &&
      (state.status === 'playing' || state.status === 'done'),
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !validState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!LEVELS.includes(saved.level)) return null;
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

function sanitise(raw: Partial<FamilyRecord> | null): FamilyRecord {
  const recent = Array.isArray(raw?.recent)
    ? raw.recent
        .filter(
          (entry): entry is RecordEntry =>
            Boolean(entry) &&
            (entry.winner === 'p1' || entry.winner === 'p2' || entry.winner === 'draw') &&
            (entry.mode === 'ai' || entry.mode === 'local') &&
            Array.isArray(entry.scores) &&
            entry.scores.length === 2 &&
            entry.scores.every((score) => Number.isFinite(score)) &&
            Number.isFinite(entry.at),
        )
        .slice(0, MAX_RECENT)
    : [];
  const record: FamilyRecord = {
    ...EMPTY,
    ...(raw ?? {}),
    recent,
  };
  for (const key of ['games', 'winsP1', 'winsP2', 'draws', 'boxesP1', 'boxesP2', 'streak'] as const) {
    if (!Number.isFinite(record[key]) || record[key] < 0) record[key] = 0;
  }
  if (record.lastWinner !== 'p1' && record.lastWinner !== 'p2' && record.lastWinner !== 'draw') {
    record.lastWinner = null;
  }
  return record;
}

export function loadRecord(): FamilyRecord {
  return sanitise(read<Partial<FamilyRecord>>(RECORD_KEY));
}

function winnerOf(state: GameState): RecordWinner {
  if (state.winner === 0) return 'p1';
  if (state.winner === 1) return 'p2';
  return 'draw';
}

export function recordResult(state: GameState, mode: 'ai' | 'local'): FamilyRecord {
  const record = loadRecord();
  const winner = winnerOf(state);
  record.games += 1;
  if (winner === 'p1') record.winsP1 += 1;
  else if (winner === 'p2') record.winsP2 += 1;
  else record.draws += 1;
  record.boxesP1 += state.scores[0];
  record.boxesP2 += state.scores[1];

  if (winner === 'draw') {
    record.streak = 0;
  } else if (winner === record.lastWinner) {
    record.streak += 1;
  } else {
    record.streak = 1;
  }
  record.lastWinner = winner;
  record.recent = [
    { winner, scores: [state.scores[0], state.scores[1]] as [number, number], mode, at: Date.now() },
    ...record.recent,
  ].slice(0, MAX_RECENT);
  write(RECORD_KEY, record);
  return record;
}

/** Undo a result that was recorded for a game the family then undid. */
export function revokeLastResult(): FamilyRecord {
  const record = loadRecord();
  const last = record.recent[0];
  if (!last || record.games === 0) return record;

  record.games -= 1;
  if (last.winner === 'p1') record.winsP1 = Math.max(0, record.winsP1 - 1);
  else if (last.winner === 'p2') record.winsP2 = Math.max(0, record.winsP2 - 1);
  else record.draws = Math.max(0, record.draws - 1);
  record.boxesP1 = Math.max(0, record.boxesP1 - last.scores[0]);
  record.boxesP2 = Math.max(0, record.boxesP2 - last.scores[1]);
  record.recent = record.recent.slice(1);
  record.lastWinner = record.recent[0]?.winner ?? null;

  let streak = 0;
  const first = record.recent[0];
  if (first && first.winner !== 'draw') {
    for (const entry of record.recent) {
      if (entry.winner === first.winner) streak += 1;
      else break;
    }
  }
  record.streak = streak;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY, recent: [] };
}
