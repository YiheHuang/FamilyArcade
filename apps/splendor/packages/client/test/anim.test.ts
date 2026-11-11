import type { GameEvent } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import { STAGGER_MS, stepsFromEvents } from '../src/anim/steps';

const emptyTokens = () => ({ white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 });

describe('操作动画：事件 → 飞行步骤', () => {
  it('拿宝石：每枚不同颜色一步，按 90ms 错峰', () => {
    const steps = stepsFromEvents([{ type: 'tokens-taken', seat: 1, tokens: { ...emptyTokens(), white: 1, blue: 2 } }]);
    expect(steps.map((s) => `${s.kind}:${s.color}`)).toEqual(['gem:white', 'gem:blue']);
    expect(steps.map((s) => s.delay)).toEqual([0, STAGGER_MS]);
    expect(steps.every((s) => s.seat === 1)).toBe(true);
  });

  it('拿 2 枚同色 = 两个宝石步骤；归还宝石方向为 gemReturn', () => {
    const take2 = stepsFromEvents([{ type: 'tokens-taken', seat: 0, tokens: { ...emptyTokens(), red: 2 } }]);
    expect(take2).toHaveLength(1); // 同一颜色合并成一步（携带数量语义 = 一枚图标）
    expect(take2[0]!.kind).toBe('gem');

    const back = stepsFromEvents([{ type: 'tokens-returned', seat: 0, tokens: { ...emptyTokens(), gold: 1, black: 2 } }]);
    expect(back.map((s) => `${s.kind}:${s.color}`)).toEqual(['gemReturn:black', 'gemReturn:gold']);
  });

  it('买卡：卡片飞向加成行', () => {
    const steps = stepsFromEvents([{ type: 'card-bought', seat: 2, cardId: 17, paid: emptyTokens() }]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'card', cardId: 17, dest: 'bonus', seat: 2 });
  });

  it('预定：卡片飞向预定区；有金币时金币跟飞；盲抽保留 tier（供从正确牌堆飞出）', () => {
    const steps = stepsFromEvents([
      { type: 'card-reserved', seat: 0, cardId: 42, fromDeck: true, goldTaken: true, tier: 3 },
    ]);
    expect(steps.map((s) => s.kind)).toEqual(['card', 'gold']);
    expect(steps[0]).toMatchObject({ cardId: 42, tier: 3, dest: 'reserved' });
    expect(steps[1]!.delay).toBe(STAGGER_MS);

    // 对他人保密的盲抽：id 被脱敏为 -1，但动画仍需从对应档位的牌堆飞出
    const blind = stepsFromEvents([{ type: 'card-reserved', seat: 1, cardId: -1, fromDeck: true, goldTaken: false, tier: 2 }]);
    expect(blind[0]).toMatchObject({ cardId: -1, tier: 2 });
  });

  it('贵族来访：一步；无关事件不产生动画', () => {
    const steps = stepsFromEvents([
      { type: 'turn-start', seat: 0 },
      { type: 'noble-visit', seat: 1, nobleId: 5 },
      { type: 'board-refilled', tier: 1, slot: 0 },
      { type: 'game-end', winners: [1] },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'noble', nobleId: 5, seat: 1 });
  });

  it('单批步骤有上限（防刷屏）与全局递增 id', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 30; i++) events.push({ type: 'tokens-taken', seat: 0, tokens: { ...emptyTokens(), white: 1 } });
    const steps = stepsFromEvents(events, 100);
    expect(steps).toHaveLength(12);
    expect(steps[0]!.id).toBe(100);
    expect(steps[11]!.id).toBe(111);
  });
});
