import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/apply';
import { legalMoves } from '../src/legal';
import { NOBLES } from '../src/data';
import { giveBonuses, testGame, transferTo } from './helpers';
import { totalPoints } from '../src/scoring';

function findNoble(name: string) {
  const noble = NOBLES.find((n) => n.name === name);
  if (!noble) throw new Error(`找不到贵族：${name}`);
  return noble;
}

const mary = findNoble('Mary Stuart'); // 绿4 红4
const charles = findNoble('Charles V'); // 蓝4 绿4

describe('贵族来访', () => {
  it('恰好满足一位贵族时自动来访（+3 分）', () => {
    const state = testGame();
    state.nobles = [mary.id, charles.id];
    giveBonuses(state, 0, { green: 4, red: 4 });
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.error).toBeUndefined();
    expect(res.state.players[0]!.nobles).toEqual([mary.id]);
    expect(res.state.nobles).not.toContain(mary.id);
    expect(res.state.nobles).toContain(charles.id);
    expect(totalPoints(res.state.players[0]!)).toBe(3);
    expect(res.state.current).toBe(1);
  });

  it('多位贵族同时满足时进入选择阶段', () => {
    const state = testGame();
    state.nobles = [mary.id, charles.id];
    giveBonuses(state, 0, { green: 4, red: 4, blue: 4 });
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.error).toBeUndefined();
    const s = res.state;
    expect(s.phase).toBe('choosing-noble');
    expect(s.pending).toMatchObject({ player: 0 });
    const options = legalMoves(s);
    expect(options).toHaveLength(2);

    const bad = applyMove(s, { type: 'chooseNoble', nobleId: 999 });
    expect(bad.error).toBeDefined();

    const ok = applyMove(s, { type: 'chooseNoble', nobleId: mary.id });
    expect(ok.error).toBeUndefined();
    expect(ok.state.phase).toBe('playing');
    expect(ok.state.players[0]!.nobles).toEqual([mary.id]);
    expect(ok.state.current).toBe(1);
  });

  it('贵族判定先于归还令牌（官方顺序）', () => {
    const state = testGame();
    state.nobles = [mary.id];
    giveBonuses(state, 0, { green: 4, red: 4 });
    transferTo(state, 0, { white: 4, blue: 4, green: 1 }); // 手上 9 枚
    const res = applyMove(state, { type: 'take', colors: ['green', 'red', 'black'] });
    // 行动后：先贵族来访，再因 12 枚进入归还
    const s = res.state;
    expect(s.phase).toBe('discarding');
    expect(s.players[0]!.nobles).toContain(mary.id);
    expect(totalPoints(s.players[0]!)).toBe(3);
  });

  it('未满足要求不会来访', () => {
    const state = testGame();
    state.nobles = [mary.id];
    giveBonuses(state, 0, { green: 4, red: 3 });
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.state.players[0]!.nobles).toHaveLength(0);
    expect(res.state.nobles).toContain(mary.id);
  });
});
