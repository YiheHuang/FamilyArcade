import type { AiLevel } from './ai/ai';
import type { GameState, Side } from './game/tables';

export type PlayMode = 'ai' | 'local';
export type RecordMode = PlayMode | 'lan';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: PlayMode;
  level: AiLevel;
  savedAt: number;
}

export interface RecentResult {
  winner: Side;
  mode: RecordMode;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsW: number;
  winsB: number;
  streak: number;
  lastWinner: Side | null;
  recent: RecentResult[];
}

const SAVE_KEY = 'familyarcade.tables.save';
const RECORD_KEY = 'familyarcade.tables.record';

const EMPTY: FamilyRecord = { games: 0, winsW: 0, winsB: 0, streak: 0, lastWinner: null, recent: [] };

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
      Array.isArray(state.points) &&
      state.points.length === 24 &&
      state.points.every((value) => Number.isFinite(value)) &&
      state.bar &&
      Number.isFinite(state.bar.W) &&
      Number.isFinite(state.bar.B) &&
      state.off &&
      Number.isFinite(state.off.W) &&
      Number.isFinite(state.off.B) &&
      (state.turn === 'W' || state.turn === 'B') &&
      ['awaiting-roll', 'moving', 'finished'].includes(state.status) &&
      Array.isArray(state.dice) &&
      Array.isArray(state.log),
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || !validState(saved.state)) return null;
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

export function loadRecord(): FamilyRecord {
  const raw = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!raw) return { ...EMPTY, recent: [] };
  return {
    games: Number(raw.games) || 0,
    winsW: Number(raw.winsW) || 0,
    winsB: Number(raw.winsB) || 0,
    streak: Number(raw.streak) || 0,
    lastWinner: raw.lastWinner === 'W' || raw.lastWinner === 'B' ? raw.lastWinner : null,
    recent: Array.isArray(raw.recent)
      ? raw.recent
          .filter(
            (item): item is RecentResult =>
              Boolean(item) &&
              (item.winner === 'W' || item.winner === 'B') &&
              (item.mode === 'ai' || item.mode === 'local' || item.mode === 'lan') &&
              Number.isFinite(item.at),
          )
          .slice(0, 8)
      : [],
  };
}

export function recordResult(state: GameState, mode: RecordMode): FamilyRecord {
  if (state.status !== 'finished' || !state.winner) return loadRecord();
  const record = loadRecord();
  record.games += 1;
  if (state.winner === 'W') record.winsW += 1;
  else record.winsB += 1;
  if (record.lastWinner === state.winner) record.streak += 1;
  else record.streak = 1;
  record.lastWinner = state.winner;
  record.recent = [{ winner: state.winner, mode, at: Date.now() }, ...record.recent].slice(0, 8);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, { ...EMPTY, recent: [] });
  return { ...EMPTY, recent: [] };
}

