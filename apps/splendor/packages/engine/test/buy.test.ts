import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/apply';
import { legalMoves } from '../src/legal';
import { checkInvariants } from '../src/invariants';
import { boardCardId, findCard, putOnBoard, testGame, topOfDeck, transferTo } from './helpers';

describe('购买发展卡', () => {
  it('无加成时全额支付，桌面补牌、银行回收令牌', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.points === 0 && c.cost.green === 3 && c.cost.white + c.cost.blue + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    const deckTop = topOfDeck(state, 1);
    transferTo(state, 0, { green: 3 });

    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 1, slot: 0 } });
    expect(res.error).toBeUndefined();
    const next = res.state;
    expect(next.players[0]!.purchased).toContain(card.id);
    expect(next.players[0]!.bonuses.black).toBe(1);
    expect(next.players[0]!.tokens.green).toBe(0);
    expect(next.bank.green).toBe(4);
    expect(boardCardId(next, 1, 0)).toBe(deckTop);
    expect(next.decks[0]).toHaveLength(35);
    expect(checkInvariants(next)).toEqual([]);
  });

  it('已购卡加成自动抵扣成本', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.white === 2 && c.cost.green === 2 && c.cost.blue + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    state.players[0]!.bonuses.white = 2; // 白加成 2 点：只需支付 2 绿
    transferTo(state, 0, { green: 2 });

    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 1, slot: 0 } });
    expect(res.error).toBeUndefined();
    expect(res.state.bank.green).toBe(4);
    expect(res.state.players[0]!.tokens.green).toBe(0);
  });

  it('金币作为万能替代', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.black === 3 && c.cost.white + c.cost.blue + c.cost.green + c.cost.red === 0);
    putOnBoard(state, 1, 0, card.id);
    transferTo(state, 0, { black: 2, gold: 1 });

    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 1, slot: 0 } });
    expect(res.error).toBeUndefined();
    const p = res.state.players[0]!;
    expect(p.tokens.black).toBe(0);
    expect(p.tokens.gold).toBe(0);
    expect(res.state.bank.gold).toBe(5);
  });

  it('买不起时不在合法走法中，直接调用报错', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 3 && c.points === 5);
    putOnBoard(state, 3, 0, card.id);
    expect(legalMoves(state).some((m) => m.type === 'buy' && m.target.kind === 'board' && m.target.tier === 3 && m.target.slot === 0)).toBe(false);
    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 3, slot: 0 } });
    expect(res.error).toMatch(/E_CANNOT_PAY/);
  });

  it('不允许超额支付（无找零）', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.blue === 3 && c.cost.white + c.cost.green + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    transferTo(state, 0, { blue: 3, white: 1 });
    const res = applyMove(state, {
      type: 'buy',
      target: { kind: 'board', tier: 1, slot: 0 },
      pay: { blue: 3, white: 1 },
    });
    expect(res.error).toMatch(/E_OVERPAY/);
  });

  it('显式支付时金币数量必须恰好补足缺口', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.blue === 3 && c.cost.white + c.cost.green + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    transferTo(state, 0, { blue: 1, gold: 2 });
    const res = applyMove(state, {
      type: 'buy',
      target: { kind: 'board', tier: 1, slot: 0 },
      pay: { blue: 1 },
    });
    expect(res.error).toMatch(/E_GOLD_MISUSE/);
  });

  it('可以购买自己预定区中的卡', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.cost.white + c.cost.blue + c.cost.green + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    const s1 = applyMove(state, { type: 'reserve', target: { kind: 'board', tier: 1, slot: 0 } });
    expect(s1.error).toBeUndefined();
    expect(s1.state.players[0]!.reserved[0]!.cardId).toBe(card.id);
    s1.state.current = 0; // 回到 P0 来购买（预定动作已消耗其回合）
    transferTo(s1.state, 0, { red: 3 });
    const res = applyMove(s1.state, { type: 'buy', target: { kind: 'reserved', index: 0 } });
    expect(res.error).toBeUndefined();
    expect(res.state.players[0]!.reserved).toHaveLength(0);
    expect(res.state.players[0]!.purchased).toContain(card.id);
    expect(checkInvariants(res.state)).toEqual([]);
  });

  it('牌堆耗尽后桌面留空', () => {
    const state = testGame();
    const card = findCard((c) => c.tier === 1 && c.cost.green === 3 && c.cost.white + c.cost.blue + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 0, card.id);
    // 清空牌堆：把剩余卡转移到两位玩家的预定区之外——直接置空（仅为测试补牌逻辑）
    state.decks[0] = [];
    transferTo(state, 0, { green: 3 });
    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 1, slot: 0 } });
    expect(res.error).toBeUndefined();
    expect(boardCardId(res.state, 1, 0)).toBeNull();
  });
});
