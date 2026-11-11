import { describe, expect, it } from 'vitest';
import { CARDS, NOBLES } from '../src/data';
import { COLORS } from '../src/types';

describe('卡牌数据完整性', () => {
  it('共 90 张，各档 40/30/20', () => {
    expect(CARDS).toHaveLength(90);
    expect(CARDS.filter((c) => c.tier === 1)).toHaveLength(40);
    expect(CARDS.filter((c) => c.tier === 2)).toHaveLength(30);
    expect(CARDS.filter((c) => c.tier === 3)).toHaveLength(20);
  });

  it('每个加成色每档 8/6/4 张', () => {
    for (const [tier, expected] of [
      [1, 8],
      [2, 6],
      [3, 4],
    ] as const) {
      for (const color of COLORS) {
        expect(CARDS.filter((c) => c.tier === tier && c.bonus === color)).toHaveLength(expected);
      }
    }
  });

  it('点数直方图符合官方牌组', () => {
    const hist = (tier: number) => {
      const m = new Map<number, number>();
      for (const c of CARDS.filter((c) => c.tier === tier)) m.set(c.points, (m.get(c.points) ?? 0) + 1);
      return Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0]));
    };
    expect(hist(1)).toEqual({ 0: 35, 1: 5 });
    expect(hist(2)).toEqual({ 1: 10, 2: 15, 3: 5 });
    expect(hist(3)).toEqual({ 3: 5, 4: 10, 5: 5 });
  });

  it('卡牌 ID 唯一且成本合法', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(90);
    for (const c of CARDS) {
      const values = COLORS.map((k) => c.cost[k]);
      expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      expect(values.some((v) => v > 0)).toBe(true);
    }
  });

  it('贵族 10 张：5 张 4+4 与 5 张 3+3+3，各 3 分', () => {
    expect(NOBLES).toHaveLength(10);
    const byKind = { two: 0, three: 0 };
    for (const n of NOBLES) {
      expect(n.points).toBe(3);
      const colors = COLORS.filter((c) => n.requirement[c] > 0);
      const vals = colors.map((c) => n.requirement[c]);
      if (colors.length === 2 && vals.every((v) => v === 4)) byKind.two++;
      else if (colors.length === 3 && vals.every((v) => v === 3)) byKind.three++;
      else throw new Error(`贵族 ${n.name} 要求不合法`);
    }
    expect(byKind.two).toBe(5);
    expect(byKind.three).toBe(5);
  });
});
