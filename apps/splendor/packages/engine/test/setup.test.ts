import { describe, expect, it } from 'vitest';
import { setupGame } from '../src/setup';
import { checkInvariants } from '../src/invariants';
import { CARDS } from '../src/data';

function collectAllCardIds(state: ReturnType<typeof setupGame>): number[] {
  const ids: number[] = [];
  for (const deck of state.decks) ids.push(...deck);
  for (const row of state.board) for (const id of row) if (id != null) ids.push(id);
  return ids;
}

describe('开局设置', () => {
  it('2 人局：每色 4 枚、金币 5、贵族 3、每档明牌 4 张', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 's1' });
    for (const c of ['white', 'blue', 'green', 'red', 'black'] as const) expect(state.bank[c]).toBe(4);
    expect(state.bank.gold).toBe(5);
    expect(state.nobles).toHaveLength(3);
    for (const row of state.board) expect(row).toHaveLength(4);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('3 人局：每色 5 枚、贵族 4', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], { seed: 's2' });
    for (const c of ['white', 'blue', 'green', 'red', 'black'] as const) expect(state.bank[c]).toBe(5);
    expect(state.nobles).toHaveLength(4);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('4 人局：每色 7 枚、贵族 5', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], { seed: 's3' });
    for (const c of ['white', 'blue', 'green', 'red', 'black'] as const) expect(state.bank[c]).toBe(7);
    expect(state.nobles).toHaveLength(5);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('牌堆剩余数正确：T1=36、T2=26、T3=16，明牌+牌堆=90 张且不重复', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 's4' });
    expect(state.decks[0]).toHaveLength(36);
    expect(state.decks[1]).toHaveLength(26);
    expect(state.decks[2]).toHaveLength(16);
    const all = collectAllCardIds(state);
    expect(all).toHaveLength(90);
    expect(new Set(all).size).toBe(90);
  });

  it('同一 seed 结果完全一致（确定性）', () => {
    const a = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'same' });
    const b = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'same' });
    expect(a.board).toEqual(b.board);
    expect(a.decks).toEqual(b.decks);
    expect(a.nobles).toEqual(b.nobles);
  });

  it('不同 seed 的明牌组合几乎必然不同', () => {
    const a = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'x1' });
    const b = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'x2' });
    expect(JSON.stringify(a.board)).not.toBe(JSON.stringify(b.board));
  });

  it('不支持的玩家数会报错', () => {
    expect(() => setupGame([{ name: 'A' }], { seed: 's' })).toThrow();
    expect(() => setupGame([{}, {}, {}, {}, {}], { seed: 's' })).toThrow();
  });

  it('卡牌总数与数据一致（防御性）', () => {
    expect(CARDS).toHaveLength(90);
  });
});
