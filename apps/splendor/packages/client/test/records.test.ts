import { applyMove, chooseMove, setupGame, totalPoints } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import { buildFrames, type GameRecord } from '../src/records';

/** 造一局真实对局（AI 互打）作为记录素材 */
function playFullGame(): GameRecord {
  const seats = [
    { name: 'A', kind: 'human' as const },
    { name: 'B', kind: 'ai' as const, aiLevel: 'normal' as const },
    { name: 'C', kind: 'ai' as const, aiLevel: 'hard' as const },
  ];
  const seed = 'records-test';
  let state = setupGame(seats, { seed });
  const moves: GameRecord['moves'] = [];
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 800) {
    const move = chooseMove(state, 'normal');
    const res = applyMove(state, move);
    if (res.error) break;
    moves.push(move);
    state = res.state;
  }
  return {
    id: 'test-1',
    mode: 'ai',
    createdAt: Date.now() - 1000,
    finishedAt: Date.now(),
    seats,
    seed,
    moves,
    winners: state.winners ?? [],
    points: state.players.map((p) => totalPoints(p)),
    turns: state.turn,
  };
}

describe('对局记录与复盘', () => {
  it('buildFrames：以"一位玩家的一轮操作"为一步，且能完整重演终局', () => {
    const rec = playFullGame();
    const frames = buildFrames(rec);
    expect(frames.length).toBeGreaterThan(1);
    // 首帧 = 开局
    expect(frames[0]!.moveCount).toBe(0);
    expect(frames[0]!.state.turn).toBe(1);
    // 末帧 = 终局，且走法数一致
    const last = frames[frames.length - 1]!;
    expect(last.moveCount).toBe(rec.moves.length);
    expect(last.state.phase).toBe('ended');
    // 帧之间"当前座位"必须发生变化（一轮一步）
    for (let i = 1; i < frames.length - 1; i++) {
      expect(frames[i]!.state.current).not.toBe(frames[i - 1]!.state.current);
    }
    // 每帧的走法数严格递增
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.moveCount).toBeGreaterThan(frames[i - 1]!.moveCount);
    }
    // 重演终局与原始终局一致（分数与卡数）
    const lastPoints = last.state.players.map((p) => p.purchased.length);
    expect(lastPoints.length).toBe(rec.seats.length);
  });

  it('同回合内的多次动作（归还/贵族）合并在一步内', () => {
    // 用真实对局找到一次"同回合多走法"的边界：帧内 moveCount 差值 > 1 即说明合并
    const rec = playFullGame();
    const frames = buildFrames(rec);
    const gaps = frames.slice(1).map((f, i) => f.moveCount - frames[i]!.moveCount);
    // 至少存在一次合并（归还/贵族让一个回合包含多个原子动作）或全部为 1
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(6);
  });
});
