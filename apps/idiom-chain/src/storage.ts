import type { AiLevel } from './ai/ai';
import type { GameState } from './game/idiom-chain';

export interface SavedGame {
  version: 2;
  state: GameState;
  history: GameState[];
  mode: 'ai' | 'local';
  level: AiLevel;
  /** Player names and table choices so a resume keeps the same set-up. */
  names: string[];
  settings: {
    seconds: number;
    homophone: boolean;
    missLimit: number;
    cover: boolean;
  };
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';

export interface RecentMatch {
  winnerName: string | null;
  score: number;
  chain: number;
  players: number;
  mode: RecordMode;
  at: number;
}

export interface FamilyRecord {
  matches: number;
  wins: number;
  soloWins: number;
  localWins: number;
  lanWins: number;
  longestChain: number;
  bestScore: number;
  byMode: { ai: number; local: number; lan: number };
  recent: RecentMatch[];
  lastWinner: string | null;
}

const SAVE_KEY = 'familyarcade.idiom-chain.save';
const RECORD_KEY = 'familyarcade.idiom-chain.record';
const LEGACY_KEYS = ['familyarcade.idiom-chain.record.v1'];

const EMPTY_RECORD: FamilyRecord = {
  matches: 0,
  wins: 0,
  soloWins: 0,
  localWins: 0,
  lanWins: 0,
  longestChain: 0,
  bestScore: 0,
  byMode: { ai: 0, local: 0, lan: 0 },
  recent: [],
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

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as GameState;
  return (
    state.version === 1 &&
    Array.isArray(state.players) &&
    state.players.length >= 2 &&
    state.players.length <= 6 &&
    Array.isArray(state.chain) &&
    (state.status === 'playing' || state.status === 'finished')
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  if (!Array.isArray(saved.history)) return null;
  return saved;
}

export function saveGame(
  value: Omit<SavedGame, 'version' | 'savedAt'>,
): SavedGame {
  const saved: SavedGame = {
    ...value,
    history: value.history.slice(-40),
    version: 2,
    savedAt: Date.now(),
  };
  write(SAVE_KEY, saved);
  return saved;
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
  const record: FamilyRecord = { ...EMPTY_RECORD, ...(stored ?? {}) };
  record.byMode = { ...EMPTY_RECORD.byMode, ...(stored?.byMode ?? {}) };
  record.recent = Array.isArray(stored?.recent) ? stored.recent.slice(0, 8) : [];
  return record;
}

export function recordResult(
  state: GameState,
  mode: RecordMode,
  now = Date.now(),
): FamilyRecord {
  const record = loadRecord();
  const winnerSeats = state.winners.length
    ? state.winners
    : state.winner === null
      ? []
      : [state.winner];
  const winnerName =
    winnerSeats.length === 1 ? state.players[winnerSeats[0]]?.name ?? null : null;
  const topScore = Math.max(...state.players.map((player) => player.score));

  record.matches += 1;
  record.byMode[mode] += 1;
  if (winnerName) {
    record.wins += 1;
    if (mode === 'ai') record.soloWins += 1;
    if (mode === 'local') record.localWins += 1;
    if (mode === 'lan') record.lanWins += 1;
  }
  record.longestChain = Math.max(record.longestChain, state.chain.length);
  record.bestScore = Math.max(record.bestScore, topScore);
  record.lastWinner = winnerName;
  record.recent = [
    {
      winnerName,
      score: topScore,
      chain: state.chain.length,
      players: state.players.length,
      mode,
      at: now,
    },
    ...record.recent,
  ].slice(0, 8);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return { ...EMPTY_RECORD, byMode: { ...EMPTY_RECORD.byMode }, recent: [] };
}

export function readRecordMode(mode: 'ai' | 'local' | 'lan-host' | 'lan-guest'): RecordMode {
  if (mode === 'lan-host' || mode === 'lan-guest') return 'lan';
  return mode;
}
