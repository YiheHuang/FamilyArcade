import type { AiLevel } from './ai/ai';
import type { GameState, Hand, Hands, Move, Side } from './game/shogi';

export interface SavedGame {
  version: 1;
  state: GameState;
  mode: 'ai' | 'local';
  level: AiLevel;
  savedAt: number;
}

export type RecordMode = 'ai' | 'local' | 'lan';
export type ResultWinner = 'b' | 'w' | 'draw';

export interface RecordEntry {
  winner: ResultWinner;
  mode: RecordMode;
  level?: AiLevel;
  moves: number;
  at: number;
}

export interface FamilyRecord {
  games: number;
  winsBlack: number;
  winsWhite: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastWinner: ResultWinner | null;
  byMode: Record<RecordMode, number>;
  recent: RecordEntry[];
}

export interface ResultMeta {
  mode: RecordMode;
  level?: AiLevel;
}

const SAVE_KEY = 'familyarcade.shogi.save';
const RECORD_KEY = 'familyarcade.shogi.record';
const MAX_RECENT = 8;

export const EMPTY_RECORD: FamilyRecord = {
  games: 0,
  winsBlack: 0,
  winsWhite: 0,
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

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isSide(value: unknown): value is Side {
  return value === 'b' || value === 'w';
}

function isHand(value: unknown): value is Hand {
  if (!value || typeof value !== 'object') return false;
  const hand = value as Partial<Hand>;
  return (
    typeof hand.R === 'number' &&
    typeof hand.B === 'number' &&
    typeof hand.G === 'number' &&
    typeof hand.S === 'number' &&
    typeof hand.N === 'number' &&
    typeof hand.L === 'number' &&
    typeof hand.P === 'number'
  );
}

function isMove(value: unknown): value is Move {
  if (!value || typeof value !== 'object') return false;
  const move = value as Partial<Move> & { kind?: string };
  if (move.kind === 'move') {
    return (
      typeof move.from === 'number' &&
      typeof move.to === 'number' &&
      typeof move.promote === 'boolean'
    );
  }
  if (move.kind === 'drop') {
    return typeof move.type === 'string' && typeof move.to === 'number';
  }
  return false;
}

function hydrateState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<GameState>;
  if (!Array.isArray(value.board) || value.board.length !== 81) return null;
  if (!isSide(value.turn)) return null;
  if (value.status !== 'playing' && value.status !== 'won' && value.status !== 'draw') return null;
  const hands = value.hands;
  if (!hands || !isHand(hands.b) || !isHand(hands.w)) return null;
  const normalizedHands: Hands = { b: { ...hands.b }, w: { ...hands.w } };
  const moves = Array.isArray(value.moves) ? value.moves.filter(isMove) : [];
  return {
    board: value.board.map((square) =>
      square && square.side && square.type ? { ...square } : null,
    ),
    hands: normalizedHands,
    turn: value.turn,
    status: value.status,
    winner: isSide(value.winner) ? value.winner : null,
    check: Boolean(value.check),
    moves,
    lastMove: isMove(value.lastMove) ? value.lastMove : null,
    positionCounts:
      value.positionCounts && typeof value.positionCounts === 'object'
        ? { ...value.positionCounts }
        : {},
    endReason:
      value.endReason === 'checkmate' ||
      value.endReason === 'no-moves' ||
      value.endReason === 'repetition'
        ? value.endReason
        : null,
  };
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 1 || (saved.mode !== 'ai' && saved.mode !== 'local')) {
    return null;
  }
  const state = hydrateState(saved.state);
  if (!state) return null;
  return {
    ...saved,
    state,
    level:
      saved.level === 'companion' ||
      saved.level === 'easy' ||
      saved.level === 'normal' ||
      saved.level === 'hard'
        ? saved.level
        : 'normal',
  };
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

function isWinner(value: unknown): value is ResultWinner {
  return value === 'b' || value === 'w' || value === 'draw';
}

function isEntry(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecordEntry>;
  return (
    isWinner(entry.winner) &&
    (entry.mode === 'ai' || entry.mode === 'local' || entry.mode === 'lan') &&
    typeof entry.moves === 'number' &&
    Number.isFinite(entry.moves) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

export function normalizeRecord(raw: Partial<FamilyRecord> | null | undefined): FamilyRecord {
  const byMode = raw?.byMode ?? EMPTY_RECORD.byMode;
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEntry).slice(0, MAX_RECENT)
    : [];
  return {
    games: count(raw?.games),
    winsBlack: count(raw?.winsBlack),
    winsWhite: count(raw?.winsWhite),
    draws: count(raw?.draws),
    streak: count(raw?.streak),
    bestStreak: count(raw?.bestStreak),
    lastWinner: isWinner(raw?.lastWinner) ? raw.lastWinner : null,
    byMode: {
      ai: count(byMode.ai),
      local: count(byMode.local),
      lan: count(byMode.lan),
    },
    recent,
  };
}

export function addResult(
  record: FamilyRecord,
  state: GameState,
  meta: ResultMeta,
  at: number,
): FamilyRecord {
  const winner: ResultWinner =
    state.status === 'draw' ? 'draw' : state.winner === 'w' ? 'w' : 'b';
  const streak = record.lastWinner === winner ? record.streak + 1 : 1;
  const entry: RecordEntry = {
    winner,
    mode: meta.mode,
    moves: state.moves.length,
    at,
    ...(meta.level ? { level: meta.level } : {}),
  };
  return {
    games: record.games + 1,
    winsBlack: record.winsBlack + (winner === 'b' ? 1 : 0),
    winsWhite: record.winsWhite + (winner === 'w' ? 1 : 0),
    draws: record.draws + (winner === 'draw' ? 1 : 0),
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
    lastWinner: winner,
    byMode: {
      ...record.byMode,
      [meta.mode]: record.byMode[meta.mode] + 1,
    },
    recent: [entry, ...record.recent].slice(0, MAX_RECENT),
  };
}

export function loadRecord(): FamilyRecord {
  return normalizeRecord(read<Partial<FamilyRecord>>(RECORD_KEY));
}

export function recordResult(state: GameState, meta: ResultMeta, at = Date.now()): FamilyRecord {
  const record = addResult(loadRecord(), state, meta, at);
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): FamilyRecord {
  write(RECORD_KEY, EMPTY_RECORD);
  return normalizeRecord(EMPTY_RECORD);
}
