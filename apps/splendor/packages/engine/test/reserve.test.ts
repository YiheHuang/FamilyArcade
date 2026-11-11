import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/apply';
import { legalMoves } from '../src/legal';
import { checkInvariants } from '../src/invariants';
import { boardCardId, findCard, testGame, topOfDeck } from './helpers';
import type { Move } from '../src/types';
import { cardById } from '../src/data';

describe('预定卡', () => {
  it('从桌面预定：移到预定区、桌面补牌、获得 1 枚金币', () => {
    const state = testGame();
    const cardId = state.board[0]![2]!;
    const deckTop = topOfDeck(state, 1);
    const res = applyMove(state, { type: 'reserve', target: { kind: 'board', tier: 1, slot: 2 } });
    expect(res.error).toBeUndefined();
    const next = res.state;
    expect(next.players[0]!.reserved).toEqual([{ cardId, fromDeck: false }]);
    expect(next.players[0]!.tokens.gold).toBe(1);
    expect(next.bank.gold).toBe(4);
    expect(boardCardId(next, 1, 2)).toBe(deckTop);
    expect(checkInvariants(next)).toEqual([]);
  });

  it('从牌堆顶盲抽预定：标记 fromDeck，牌堆 -1', () => {
    const state = testGame();
    const top = topOfDeck(state, 2);
    const res = applyMove(state, { type: 'reserve', target: { kind: 'deck', tier: 2 } });
    expect(res.error).toBeUndefined();
    expect(res.state.players[0]!.reserved).toEqual([{ cardId: top, fromDeck: true }]);
    expect(res.state.decks[1]).toHaveLength(25);
  });

  it('预定上限 3 张', () => {
    const state = testGame();
    const reserveMove: Move = { type: 'reserve', target: { kind: 'deck', tier: 1 } };
    const takeMove: Move = { type: 'take', colors: ['white'] };
    let s = state;
    // P0 预定 3 次（中间由 P1 行动）；每次预定获得 1 金币，总数不超过 10 不会触发归还
    for (let i = 0; i < 3; i++) {
      const r = applyMove(s, reserveMove);
      expect(r.error).toBeUndefined();
      s = r.state;
      if (i < 2) {
        const t = applyMove(s, takeMove);
        expect(t.error).toBeUndefined();
        s = t.state;
      }
    }
    expect(s.players[0]!.reserved).toHaveLength(3);
    expect(s.current).toBe(1);
    // P1 行动，回到 P0：P0 不能再预定
    s = applyMove(s, takeMove).state;
    expect(s.current).toBe(0);
    const moves = legalMoves(s);
    expect(moves.some((m) => m.type === 'reserve')).toBe(false);
    const bad = applyMove(s, reserveMove);
    expect(bad.error).toMatch(/E_RESERVE_FULL/);
  });

  it('官方规则：银行没有金币时仍可预定，只是拿不到金币', () => {
    const state = testGame();
    // 把金币全部转移给 1 号位
    const p1 = state.players[1]!;
    p1.tokens.gold += 5;
    state.bank.gold = 0;
    const res = applyMove(state, { type: 'reserve', target: { kind: 'deck', tier: 3 } });
    // 规则书原文：If there is no gold left, you can still reserve a card, but you won't get any gold.
    expect(res.error).toBeUndefined(); // 预定动作本身依然合法
    expect(res.state.players[0]!.tokens.gold).toBe(0); // 不会凭空得到金币
    expect(res.state.bank.gold).toBe(0); // 银行也不会变成负数
  });

  it('购买后预定区卡片数据仍正确（可作为购买来源）', () => {
    const state = testGame();
    const deckTop = topOfDeck(state, 1);
    const res = applyMove(state, { type: 'reserve', target: { kind: 'deck', tier: 1 } });
    const s = res.state;
    expect(cardById(s.players[0]!.reserved[0]!.cardId).id).toBe(deckTop);
    expect(findCard((c) => c.id === deckTop).tier).toBe(1);
  });
});
