import type { Action, GameConfig, PlayerScore } from './game/types';

export type GameMode = 'ai' | 'hotseat' | 'lan';

/** stored format version (absent = 1, the original shape) */
export const RECORD_VERSION = 1;

export interface GameRecord {
  /** storage format version */
  v?: number;
  id: string;
  at: number;
  mode: GameMode;
  config: GameConfig;
  seats: string[];
  localSeats: number[];
  scores: PlayerScore[];
  ranking: number[];
  history: Action[];
}

const RECORDS_KEY = 'blokus.records';
const STATS_KEY = 'blokus.stats';
const MAX_RECORDS = 10;

export interface PlayerStats {
  games: number;
  wins: number;
  best: number;
  streak: number;
}

export interface Stats {
  modes: Record<GameMode, number>;
  players: Record<string, PlayerStats>;
  /** wins per seat index — the "favourite colour" */
  seatWins: number[];
}

export function emptyStats(): Stats {
  return { modes: { ai: 0, hotseat: 0, lan: 0 }, players: {}, seatWins: [0, 0, 0, 0] };
}

export function loadRecords(): GameRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '[]') as GameRecord[];
    if (!Array.isArray(parsed)) return [];
    // unknown versions are ignored instead of crashing the stats screen
    return parsed.filter((r) => (r?.v ?? RECORD_VERSION) === RECORD_VERSION);
  } catch {
    return [];
  }
}

export function loadStats(): Stats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null') as Stats | null;
    const base = emptyStats();
    if (!raw) return base;
    return {
      modes: { ...base.modes, ...raw.modes },
      players: raw.players ?? {},
      seatWins: raw.seatWins ?? base.seatWins,
    };
  } catch {
    return emptyStats();
  }
}

export function saveRecords(list: GameRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
  } catch {
    /* quota / private mode */
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/** store a finished game and fold it into the aggregate stats */
export function saveGameRecord(rec: GameRecord): void {
  saveRecords([{ v: RECORD_VERSION, ...rec }, ...loadRecords()]);

  const st = loadStats();
  st.modes[rec.mode] = (st.modes[rec.mode] ?? 0) + 1;
  const winner = rec.ranking[0] ?? 0;
  const tied =
    rec.seats.length > 1 && rec.scores[rec.ranking[1] ?? 0]?.total === rec.scores[winner]?.total;
  rec.seats.forEach((name, i) => {
    const ps = st.players[name] ?? { games: 0, wins: 0, best: 0, streak: 0 };
    ps.games += 1;
    ps.best = Math.max(ps.best, rec.scores[i]?.total ?? 0);
    if (!tied && i === winner) {
      ps.wins += 1;
      ps.streak += 1;
    } else if (!tied) {
      ps.streak = 0;
    }
    st.players[name] = ps;
  });
  if (!tied) {
    st.seatWins[winner] = (st.seatWins[winner] ?? 0) + 1;
  }
  saveStats(st);
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch {
    /* ignore */
  }
}

export function totalGames(st: Stats): number {
  return st.modes.ai + st.modes.hotseat + st.modes.lan;
}

/** everything the app stores locally, as a JSON string (backup/export) */
export function exportAll(): string {
  return JSON.stringify(
    {
      v: RECORD_VERSION,
      exportedAt: new Date().toISOString(),
      records: loadRecords(),
      stats: loadStats(),
    },
    null,
    2,
  );
}

/** the seat index with the most wins, or null when nobody has won yet */
export function favoriteSeat(st: Stats): number | null {
  let best = 0;
  let seat: number | null = null;
  st.seatWins.forEach((wins, i) => {
    if (wins > best) {
      best = wins;
      seat = i;
    }
  });
  return seat;
}
