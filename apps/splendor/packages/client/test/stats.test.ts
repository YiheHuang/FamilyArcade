import { applyMove, chooseMove, setupGame, type Move } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '../src/records';
import { computeStats } from '../src/stats';

function rec(partial: Partial<GameRecord> & { id: string; finishedAt: number }): GameRecord {
  return {
    mode: 'ai',
    createdAt: partial.finishedAt - 600_000,
    seats: [
      { name: '爸爸', kind: 'human' },
      { name: '妈妈', kind: 'human' },
      { name: '电脑1', kind: 'ai' },
    ],
    seed: 'x',
    moves: [],
    winners: [0],
    points: [15, 9, 7],
    turns: 40,
    ...partial,
  };
}

describe('家庭战绩统计', () => {
  it('聚合胜率 / 连胜 / 最近结果，且不统计 AI 座位', () => {
    const records = [
      rec({ id: 'a', finishedAt: 1000, winners: [0], points: [15, 9, 0] }),
      rec({ id: 'b', finishedAt: 2000, winners: [0], points: [16, 10, 0] }),
      rec({ id: 'c', finishedAt: 3000, winners: [1], points: [8, 15, 0] }),
      rec({ id: 'd', finishedAt: 4000, winners: [1], points: [7, 15, 0] }),
      rec({ id: 'e', finishedAt: 5000, winners: [1], points: [5, 15, 0] }),
    ];
    const stats = computeStats(records, { deepLimit: 0 });
    expect(stats.games).toBe(5);
    expect(stats.players.map((p) => p.name)).toEqual(['妈妈', '爸爸']); // 妈妈 3 连胜排第一
    const mom = stats.players[0]!;
    expect(mom.games).toBe(5);
    expect(mom.wins).toBe(3);
    expect(mom.winRate).toBeCloseTo(0.6);
    expect(mom.streak).toBe(3);
    expect(mom.bestStreak).toBe(3);
    expect(mom.avgPoints).toBeCloseTo((9 + 10 + 15 + 15 + 15) / 5);
    expect(mom.recent).toEqual([true, true, true, false, false]); // 从新到旧
    const dad = stats.players[1]!;
    expect(dad.streak).toBe(0);
    expect(dad.bestStreak).toBe(2);
    // AI 座位不入榜
    expect(stats.players.some((p) => p.name.startsWith('电脑'))).toBe(false);
  });

  it('支持按模式过滤与最近 N 局', () => {
    const records = [
      rec({ id: 'a', finishedAt: 1000, mode: 'local', winners: [0] }),
      rec({ id: 'b', finishedAt: 2000, mode: 'ai', winners: [1] }),
      rec({ id: 'c', finishedAt: 3000, mode: 'ai', winners: [1] }),
    ];
    const onlyAi = computeStats(records, { mode: 'ai', deepLimit: 0 });
    expect(onlyAi.games).toBe(2);
    expect(onlyAi.players[0]!.name).toBe('妈妈');
    const recentOne = computeStats(records, { limit: 1, deepLimit: 0 });
    expect(recentOne.games).toBe(1);
    expect(recentOne.players[0]!.name).toBe('妈妈');
  });

  it('深度字段（平均购卡 / 最爱颜色 / 贵族）来自重演真实对局', () => {
    // 用引擎真打一局，取出种子与全部走法作为记录
    const seats = [
      { name: '爸爸', kind: 'human' as const },
      { name: '电脑1', kind: 'ai' as const, aiLevel: 'normal' as const },
    ];
    const seed = 'stats-deep';
    let state = setupGame(seats, { seed });
    const moves: Move[] = [];
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 600) {
      const move = chooseMove(state, 'normal');
      const res = applyMove(state, move);
      if (res.error) break;
      moves.push(move);
      state = res.state;
    }
    const records = [rec({ id: 'deep', finishedAt: 9000, seats, seed, moves, winners: state.winners ?? [0], points: [15, 8], turns: state.turn })];
    const stats = computeStats(records);
    const dad = stats.players[0]!;
    expect(dad.avgCards).toBeGreaterThan(3);
    expect(dad.favoriteGem).not.toBeNull();
    expect(['white', 'blue', 'green', 'red', 'black']).toContain(dad.favoriteGem!);
  });
});
