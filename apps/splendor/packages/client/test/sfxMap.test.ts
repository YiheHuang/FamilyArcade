import type { GameEvent } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import { mapEventToSfx } from '../src/ui/sfxMap';

const ctx = { humanSeats: new Set([0]), mySeat: 0 };

describe('事件 → 音效映射', () => {
  it('操作类事件各自对应音效', () => {
    const cases: Array<[GameEvent, string | null]> = [
      [{ type: 'tokens-taken', seat: 0, tokens: { white: 2 } as never }, 'gemTake'],
      [{ type: 'tokens-returned', seat: 0, tokens: { white: 1 } as never }, 'gemReturn'],
      [{ type: 'card-bought', seat: 0, cardId: 1, paid: {} as never }, 'buy'],
      [{ type: 'card-reserved', seat: 0, cardId: 1, fromDeck: false, goldTaken: false, tier: 1 }, 'reserve'],
      [{ type: 'card-reserved', seat: 0, cardId: 1, fromDeck: false, goldTaken: true, tier: 1 }, 'reserveGold'],
      [{ type: 'noble-visit', seat: 0, nobleId: 1 }, 'noble'],
      [{ type: 'final-round', triggeredBy: 0 }, 'finalRound'],
      [{ type: 'board-refilled', tier: 1, slot: 0 }, null],
    ];
    for (const [event, expected] of cases) {
      expect(mapEventToSfx(event, ctx)).toBe(expected);
    }
  });

  it('轮到自己才响「轮到你」；待办提醒只提醒本人', () => {
    expect(mapEventToSfx({ type: 'turn-start', seat: 0 }, ctx)).toBe('yourTurn');
    expect(mapEventToSfx({ type: 'turn-start', seat: 1 }, ctx)).toBeNull();
    expect(mapEventToSfx({ type: 'discard-required', seat: 0, total: 12 }, ctx)).toBe('attention');
    expect(mapEventToSfx({ type: 'discard-required', seat: 1, total: 12 }, ctx)).toBeNull();
    expect(mapEventToSfx({ type: 'noble-choice-required', seat: 0, options: [1, 2] }, ctx)).toBe('attention');
  });

  it('本地热座：任何真人的回合切换都算「轮到你」，AI 不算', () => {
    const hotseat = { humanSeats: new Set([0, 1]), mySeat: 0, anyHumanTurn: true };
    expect(mapEventToSfx({ type: 'turn-start', seat: 0 }, hotseat)).toBe('yourTurn');
    expect(mapEventToSfx({ type: 'turn-start', seat: 1 }, hotseat)).toBe('yourTurn');
    expect(mapEventToSfx({ type: 'turn-start', seat: 2 }, hotseat)).toBeNull();
    // 局域网：只有自己的回合才响
    const lan = { humanSeats: new Set([0, 1]), mySeat: 0, anyHumanTurn: false };
    expect(mapEventToSfx({ type: 'turn-start', seat: 1 }, lan)).toBeNull();
  });

  it('终局：自己获胜用胜利音，否则失败音', () => {
    expect(mapEventToSfx({ type: 'game-end', winners: [0] }, ctx)).toBe('win');
    expect(mapEventToSfx({ type: 'game-end', winners: [1] }, ctx)).toBe('lose');
    expect(mapEventToSfx({ type: 'game-end', winners: [1, 2] }, { ...ctx, mySeat: null })).toBe('lose');
  });
});
