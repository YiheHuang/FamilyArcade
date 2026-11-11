import type { AiLevel } from './ai/ai';
import { isDraw, standings, winners, type GameState } from './game/cards';

export type SaveMode = 'solo' | 'local';
export type ResultMode = SaveMode | 'lan-host';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: SaveMode;
  level: AiLevel;
  aiCount: number;
  remainingMs: number;
  seed: number;
  savedAt: number;
}

export interface PlayerRecord {
  wins: number;
  games: number;
  best: number;
}

export interface RecentGame {
  at: number;
  mode: ResultMode;
  draw: boolean;
  winner: string;
  scores: { name: string; score: number }[];
  sets: number;
}

export interface FamilyRecord {
  games: number;
  draws: number;
  bestScore: number;
  bestName: string;
  streak: number;
  lastWinner: string;
  players: Record<string, PlayerRecord>;
  recent: RecentGame[];
}

const SAVE_KEY = 'familyarcade.triple-find.save';
const RECORD_KEY = 'familyarcade.triple-find.record';

const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  draws: 0,
  bestScore: 0,
  bestName: '',
  streak: 0,
  lastWinner: '',
  players: {},
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
    /* quota or private mode */
  }
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2) return null;
  if (saved.mode !== 'solo' && saved.mode !== 'local') return null;
  if (!saved.state || saved.state.status !== 'playing') return null;
  if (!Array.isArray(saved.state.table) || !Array.isArray(saved.state.deck)) return null;
  if (!Array.isArray(saved.state.players)) return null;
  if (!Number.isFinite(saved.remainingMs) || saved.remainingMs <= 0) return null;
  if (!Number.isFinite(saved.seed)) return null;
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
  const saved = read<Partial<FamilyRecord>>(RECORD_KEY);
  if (!saved) return { ...EMPTY_RECORD, players: {}, recent: [] };
  return {
    ...EMPTY_RECORD,
    ...saved,
    players: saved.players && typeof saved.players === 'object' ? saved.players : {},
    recent: Array.isArray(saved.recent) ? saved.recent.slice(0, 8) : [],
  };
}

export function recordResult(state: GameState, mode: ResultMode): FamilyRecord {
  const record = loadRecord();
  const sorted = standings(state);
  const top = sorted[0]?.score ?? 0;
  const topPlayers = winners(state);
  const draw = isDraw(state);
  const winnerName = draw ? '' : topPlayers[0]?.name ?? '';
  const topName = sorted.find((player) => player.score === top)?.name ?? '';

  record.games += 1;
  if (draw) record.draws += 1;

  for (const player of state.players) {
    const existing = record.players[player.name] ?? { wins: 0, games: 0, best: 0 };
    record.players[player.name] = {
      wins: existing.wins + (!draw && player.score === top ? 1 : 0),
      games: existing.games + 1,
      best: Math.max(existing.best, player.score),
    };
  }

  if (top > record.bestScore || (top === record.bestScore && top > 0 && !record.bestName)) {
    record.bestScore = top;
    record.bestName = topName;
  }

  if (!draw && winnerName && record.lastWinner === winnerName) record.streak += 1;
  else if (!draw && winnerName) record.streak = 1;
  else record.streak = 0;
  record.lastWinner = draw ? 'draw' : winnerName;

  record.recent = [
    {
      at: Date.now(),
      mode,
      draw,
      winner: winnerName,
      scores: sorted.map((player) => ({ name: player.name, score: player.score })),
      sets: state.found.length,
    },
    ...record.recent,
  ].slice(0, 8);

  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return { ...EMPTY_RECORD, players: {}, recent: [] };
}
