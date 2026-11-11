import type { AiLevel, GameState } from './game/color-chain';

export interface SavedGame {
  version: 2;
  state: GameState;
  mode: 'ai' | 'local';
  savedAt: number;
}

export interface Record {
  matches: number;
  humanWins: number;
  aiWins: number;
  bestScore: number | null;
  lastWinner: string | null;
  streak: number;
}

const SAVE_KEY = 'familyarcade.color-chain.save';
const RECORD_KEY = 'familyarcade.color-chain.record';

const EMPTY: Record = {
  matches: 0,
  humanWins: 0,
  aiWins: 0,
  bestScore: null,
  lastWinner: null,
  streak: 0,
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
    /* quota / private mode */
  }
}

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 6) {
    return false;
  }
  if (!Array.isArray(state.drawPile) || !Array.isArray(state.discard) || state.discard.length < 1) {
    return false;
  }
  if (!['playing', 'round-over', 'match-over'].includes(String(state.status))) return false;
  if (!['red', 'yellow', 'green', 'blue'].includes(String(state.current))) return false;
  return state.players.every(
    (player) =>
      player &&
      typeof player.name === 'string' &&
      Array.isArray(player.hand) &&
      typeof player.score === 'number',
  );
}

export function loadSave(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  if (!saved || saved.version !== 2 || !validState(saved.state)) return null;
  if (saved.mode !== 'ai' && saved.mode !== 'local') return null;
  return saved;
}

export function saveGame(state: GameState, mode: 'ai' | 'local'): void {
  write(SAVE_KEY, { version: 2, state, mode, savedAt: Date.now() } satisfies SavedGame);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecord(): Record {
  const stored = read<Partial<Record>>(RECORD_KEY);
  return { ...EMPTY, ...(stored ?? {}) };
}

export function recordMatch(state: GameState): Record {
  const record = loadRecord();
  const winners =
    state.matchWinners.length > 0
      ? state.matchWinners
      : state.roundWinner !== null
        ? [state.roundWinner]
        : [];
  const names = winners.map((seat) => state.players[seat]?.name ?? '').filter(Boolean).join(' & ');
  const scores = winners
    .map((seat) => state.players[seat]?.score)
    .filter((score): score is number => typeof score === 'number');
  const best = scores.length > 0 ? Math.min(...scores) : null;
  record.matches += 1;
  if (winners.some((seat) => state.players[seat]?.ai === null)) record.humanWins += 1;
  else record.aiWins += 1;
  if (best !== null && (record.bestScore === null || best < record.bestScore)) {
    record.bestScore = best;
  }
  if (names && record.lastWinner === names) record.streak += 1;
  else record.streak = names ? 1 : 0;
  record.lastWinner = names || null;
  write(RECORD_KEY, record);
  return record;
}

export function clearRecord(): Record {
  write(RECORD_KEY, EMPTY);
  return { ...EMPTY };
}

export function aiLevelOf(state: GameState): AiLevel {
  return state.players.find((player) => player.ai !== null)?.ai ?? 'normal';
}
