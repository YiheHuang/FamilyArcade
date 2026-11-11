import { COLORS } from './types.js';
import type { LogEntry, PlayerState } from './types.js';

/** 玩家总声望分：购卡分 + 贵族分（每张贵族 3 分） */
export function totalPoints(p: PlayerState): number {
  return p.cardPoints + p.nobles.length * 3;
}

export function totalBonuses(p: PlayerState): number {
  return COLORS.reduce((sum, c) => sum + p.bonuses[c], 0);
}

export interface ScoreRow {
  seat: number;
  name: string;
  points: number;
  cardPoints: number;
  noblePoints: number;
  nobles: number;
  cards: number;
  reserved: number;
  tokens: number;
}

export function scoreboard(players: readonly PlayerState[]): ScoreRow[] {
  return players.map((p) => ({
    seat: p.seat,
    name: p.name,
    points: totalPoints(p),
    cardPoints: p.cardPoints,
    noblePoints: p.nobles.length * 3,
    nobles: p.nobles.length,
    cards: p.purchased.length,
    reserved: p.reserved.length,
    tokens: COLORS.reduce((s, c) => s + p.tokens[c], 0) + p.tokens.gold,
  }));
}

/** 平局排序：分数 → 购卡数少 → 预定数少（返回并列的座位） */
export function determineWinners(players: readonly PlayerState[]): number[] {
  let candidates = players.filter((p) => totalPoints(p) === Math.max(...players.map(totalPoints)));
  if (candidates.length > 1) {
    const minCards = Math.min(...candidates.map((p) => p.purchased.length));
    candidates = candidates.filter((p) => p.purchased.length === minCards);
  }
  if (candidates.length > 1) {
    const minReserved = Math.min(...candidates.map((p) => p.reserved.length));
    candidates = candidates.filter((p) => p.reserved.length === minReserved);
  }
  return candidates.map((p) => p.seat);
}

export function makeLogEntry(turn: number, seat: number | null, key: string, params?: LogEntry['params']): LogEntry {
  return params ? { turn, seat, key, params } : { turn, seat, key };
}
