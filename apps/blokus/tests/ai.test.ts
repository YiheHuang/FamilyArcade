import { describe, expect, it } from 'vitest';
import { chooseMove, scoreMoveFast } from '../src/ai/search';
import { DIFFICULTY_BUDGET, DIFFICULTIES, type Difficulty } from '../src/ai/types';
import { Game } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';

/** a deterministic mid-game position */
function midGame(seed: number, moves: number): Game {
  const g = new Game({ variant: 'standard', players: 4 });
  const rng = mulberry32(seed);
  for (let i = 0; i < moves && !g.over; i++) {
    const ms = g.legalMoves(g.turn);
    if (ms.length === 0) {
      g.tryApply({ kind: 'pass', p: g.turn });
    } else {
      g.tryApply(ms[Math.floor(rng() * ms.length)]);
    }
  }
  return g;
}

describe('AI：出招正确性', () => {
  it.each(DIFFICULTIES)('%s 在预算内返回合法走法', (difficulty: Difficulty) => {
    const g = midGame(11, 24);
    const started = Date.now();
    const move = chooseMove(g, g.turn, difficulty, started + DIFFICULTY_BUDGET[difficulty], mulberry32(1));
    const elapsed = Date.now() - started;
    expect(move, difficulty).not.toBeNull();
    const probe = g.clone();
    expect(probe.tryApply(move!), `${difficulty} 返回了非法走法`).toBe(true);
    expect(elapsed, `${difficulty} 超时`).toBeLessThan(DIFFICULTY_BUDGET[difficulty] + 1500);
  });

  it('无棋可走时返回 null', () => {
    const g = midGame(5, 10);
    g.remaining[g.turn] = 0;
    expect(chooseMove(g, g.turn, 'normal', Date.now() + 500, mulberry32(2))).toBeNull();
  });

  it('相同种子下高手结果确定', () => {
    const g = midGame(21, 20);
    const a = chooseMove(g, g.turn, 'hard', Date.now() + 5000, mulberry32(7));
    const b = chooseMove(g, g.turn, 'hard', Date.now() + 5000, mulberry32(7));
    expect(a).toEqual(b);
  });

  it('高手选择的走法启发式评分处于前列', () => {
    const g = midGame(33, 26);
    const seat = g.turn;
    const frontier = g.frontierFlagsFor(seat);
    const all = g.legalMoves(seat).map((m) => scoreMoveFast(g, m, frontier, 0));
    all.sort((x, y) => y - x);
    const median = all[Math.floor(all.length / 2)];
    const hard = chooseMove(g, seat, 'hard', Date.now() + 3000, mulberry32(3));
    expect(hard).not.toBeNull();
    const hardScore = scoreMoveFast(g, hard!, frontier, 0);
    expect(hardScore).toBeGreaterThan(median);
  });

  it('普通难度的决策速度可接受（20×20 四人中局）', () => {
    const g = midGame(55, 20);
    const started = Date.now();
    chooseMove(g, g.turn, 'normal', started + 1000, mulberry32(4));
    expect(Date.now() - started).toBeLessThan(600);
  });
});
