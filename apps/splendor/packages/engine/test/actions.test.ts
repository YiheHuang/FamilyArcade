import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/apply';
import { legalMoves } from '../src/legal';
import { checkInvariants } from '../src/invariants';
import { testGame, transferTo } from './helpers';
import type { Move } from '../src/types';

function expectOk(state: ReturnType<typeof testGame>, move: Move) {
  const res = applyMove(state, move);
  expect(res.error).toBeUndefined();
  return res;
}

describe('拿取宝石', () => {
  it('拿 3 枚不同色', () => {
    const state = testGame();
    const res = expectOk(state, { type: 'take', colors: ['white', 'blue', 'green'] });
    const next = res.state;
    expect(next.players[0]!.tokens.white).toBe(1);
    expect(next.players[0]!.tokens.blue).toBe(1);
    expect(next.players[0]!.tokens.green).toBe(1);
    expect(next.bank.white).toBe(3);
    expect(next.current).toBe(1);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe('playing');
    expect(checkInvariants(next)).toEqual([]);
  });

  it('允许只拿 1~2 枚不同色', () => {
    const state = testGame();
    const r1 = applyMove(state, { type: 'take', colors: ['white'] });
    expect(r1.error).toBeUndefined();
    const r2 = applyMove(r1.state, { type: 'take', colors: ['blue', 'red'] });
    expect(r2.error).toBeUndefined();
    expect(r2.state.players[1]!.tokens.blue).toBe(1);
    expect(r2.state.players[1]!.tokens.red).toBe(1);
  });

  it('颜色必须互不相同', () => {
    const state = testGame();
    const res = applyMove(state, { type: 'take', colors: ['white', 'white'] });
    expect(res.error).toMatch(/E_TAKE_DUP/);
  });

  it('不能拿 4 枚', () => {
    const state = testGame();
    const res = applyMove(state, { type: 'take', colors: ['white', 'blue', 'green', 'red'] });
    expect(res.error).toBeDefined();
  });

  it('银行没有的颜色不能拿', () => {
    const state = testGame();
    transferTo(state, 1, { white: 4 });
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.error).toMatch(/E_BANK_EMPTY/);
    // 合法走法列表中也不应出现
    expect(legalMoves(state).some((m) => m.type === 'take' && m.colors.includes('white'))).toBe(false);
  });
});

describe('拿 2 枚同色', () => {
  it('银行 ≥4 时合法；拿完后 <4 则不合法', () => {
    const state = testGame();
    expect(state.bank.white).toBe(4);
    const res = expectOk(state, { type: 'take2', color: 'white' });
    expect(res.state.bank.white).toBe(2);
    expect(res.state.players[0]!.tokens.white).toBe(2);

    const res2 = applyMove(res.state, { type: 'take2', color: 'white' });
    expect(res2.error).toMatch(/E_TAKE2_BANK/);
    expect(legalMoves(res.state).some((m) => m.type === 'take2' && m.color === 'white')).toBe(false);
  });

  it('银行只有 3 枚时不合法', () => {
    const state = testGame();
    transferTo(state, 1, { white: 1 });
    expect(state.bank.white).toBe(3);
    const res = applyMove(state, { type: 'take2', color: 'white' });
    expect(res.error).toMatch(/E_TAKE2_BANK/);
  });
});

describe('10 枚上限与归还', () => {
  it('超过 10 枚进入归还阶段，必须恰好归还到 10', () => {
    const state = testGame();
    transferTo(state, 0, { white: 4, blue: 4, green: 1 }); // 手上 9 枚
    const takeRes = expectOk(state, { type: 'take', colors: ['green', 'red', 'black'] });
    const s = takeRes.state;
    expect(s.phase).toBe('discarding');
    expect(s.pending).toEqual({ player: 0, total: 12 });

    // 归还不正确数量 -> 报错
    const bad = applyMove(s, { type: 'discard', tokens: { green: 1 } });
    expect(bad.error).toMatch(/E_DISCARD_EXACT:2/);

    // 正确归还
    const ok = applyMove(s, { type: 'discard', tokens: { green: 1, red: 1 } });
    expect(ok.error).toBeUndefined();
    const next = ok.state;
    expect(next.phase).toBe('playing');
    expect(next.current).toBe(1);
    expect(next.players[0]!.tokens.green).toBe(1);
    expect(next.players[0]!.tokens.red).toBe(0);
    expect(next.bank.green).toBe(3);
    expect(next.bank.red).toBe(4);
    expect(checkInvariants(next)).toEqual([]);
  });

  it('归还枚举覆盖所有合法组合', () => {
    const state = testGame();
    transferTo(state, 0, { white: 4, blue: 4, green: 1 });
    const s = expectOk(state, { type: 'take', colors: ['green', 'red', 'black'] }).state;
    const discards = legalMoves(s);
    expect(discards.length).toBeGreaterThan(0);
    for (const d of discards) {
      if (d.type !== 'discard') throw new Error('期望 discard 走法');
      const sum = Object.values(d.tokens).reduce<number>((a, b) => a + (b ?? 0), 0);
      expect(sum).toBe(2);
      const res = applyMove(s, d);
      expect(res.error).toBeUndefined();
    }
  });

  it('金币计入 10 枚上限：10 枚时预定会触发归还', () => {
    const state = testGame();
    transferTo(state, 0, { white: 4, blue: 4, green: 2 }); // 10 枚
    const res = expectOk(state, { type: 'reserve', target: { kind: 'deck', tier: 1 } });
    expect(res.state.phase).toBe('discarding');
    expect(res.state.players[0]!.tokens.gold).toBe(1);
  });
});
