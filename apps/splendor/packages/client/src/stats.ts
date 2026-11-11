import { cardById, type TokenColor } from '@splendor/engine';
import { buildFrames, type GameRecord, type RecordMode } from './records';

/**
 * 家庭战绩：从已有对局记录聚合（不新增存储）。
 * 深度字段（平均购卡 / 最爱颜色 / 贵族数）通过重演记录得到，按最近 N 局截断以控制耗时。
 */

export interface PlayerStats {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  /** 当前连胜（按结束时间从新到旧） */
  streak: number;
  bestStreak: number;
  avgPoints: number;
  avgCards: number;
  favoriteGem: TokenColor | null;
  nobles: number;
  totalMs: number;
  /** 最近 10 局结果（从新到旧；true=获胜） */
  recent: boolean[];
}

export interface FamilyStats {
  players: PlayerStats[];
  games: number;
  totalMs: number;
}

export interface StatsOptions {
  mode?: RecordMode | 'all';
  limit?: number;
  /** 深度分析的最大局数（需要重演），默认 30 */
  deepLimit?: number;
}

interface Accum {
  name: string;
  games: number;
  wins: number;
  points: number;
  cards: number;
  nobles: number;
  gems: Map<TokenColor, number>;
  results: Array<{ at: number; win: boolean }>;
  totalMs: number;
}

const emptyAccum = (name: string): Accum => ({
  name,
  games: 0,
  wins: 0,
  points: 0,
  cards: 0,
  nobles: 0,
  gems: new Map(),
  results: [],
  totalMs: 0,
});

export function computeStats(all: GameRecord[], opts: StatsOptions = {}): FamilyStats {
  const mode = opts.mode ?? 'all';
  const filtered = all
    .filter((r) => mode === 'all' || r.mode === mode)
    .sort((a, b) => b.finishedAt - a.finishedAt);
  const records = opts.limit ? filtered.slice(0, opts.limit) : filtered;
  const deepLimit = opts.deepLimit ?? 30;

  const acc = new Map<string, Accum>();
  const touch = (name: string): Accum => {
    let a = acc.get(name);
    if (!a) {
      a = emptyAccum(name);
      acc.set(name, a);
    }
    return a;
  };

  records.forEach((rec, idx) => {
    const deep = idx < deepLimit;
    const winners = new Set(rec.winners);
    // 深度字段：重演得到最终牌面（购卡颜色 / 贵族 / 卡数）
    let finalState = null as ReturnType<typeof buildFrames>[number]['state'] | null;
    if (deep) {
      try {
        const frames = buildFrames(rec);
        finalState = frames[frames.length - 1]?.state ?? null;
      } catch {
        finalState = null;
      }
    }
    rec.seats.forEach((seat, i) => {
      if (seat.kind !== 'human') return;
      const a = touch(seat.name);
      const win = winners.has(i);
      a.games += 1;
      if (win) a.wins += 1;
      a.points += rec.points[i] ?? 0;
      a.totalMs += Math.max(0, rec.finishedAt - rec.createdAt);
      a.results.push({ at: rec.finishedAt, win });
      const p = finalState?.players[i];
      if (p) {
        a.cards += p.purchased.length;
        a.nobles += p.nobles.length;
        for (const id of p.purchased) {
          const bonus = cardById(id).bonus;
          a.gems.set(bonus, (a.gems.get(bonus) ?? 0) + 1);
        }
      }
    });
  });

  const players: PlayerStats[] = [...acc.values()].map((a) => {
    const results = [...a.results].sort((x, y) => y.at - x.at);
    let streak = 0;
    for (const r of results) {
      if (r.win) streak += 1;
      else break;
    }
    let best = 0;
    let run = 0;
    for (const r of [...results].reverse()) {
      if (r.win) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    let favoriteGem: TokenColor | null = null;
    let bestCount = 0;
    for (const [gem, count] of a.gems) {
      if (count > bestCount) {
        bestCount = count;
        favoriteGem = gem;
      }
    }
    return {
      name: a.name,
      games: a.games,
      wins: a.wins,
      winRate: a.games > 0 ? a.wins / a.games : 0,
      streak,
      bestStreak: best,
      avgPoints: a.games > 0 ? a.points / a.games : 0,
      avgCards: a.games > 0 ? a.cards / a.games : 0,
      favoriteGem,
      nobles: a.nobles,
      totalMs: a.totalMs,
      recent: results.slice(0, 10).map((r) => r.win),
    };
  });

  players.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.avgPoints - a.avgPoints);
  return {
    players,
    games: records.length,
    totalMs: records.reduce((s, r) => s + Math.max(0, r.finishedAt - r.createdAt), 0),
  };
}
