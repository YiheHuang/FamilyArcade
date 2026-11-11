import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai';
import { aiVisibleState } from '../src/ai';
import { applyMove } from '../src/apply';
import { legalMoves } from '../src/legal';
import { randomAgent } from '../src/simulation';
import { totalPoints } from '../src/scoring';
import { AI_LEVELS } from '../src/types';
import { craftPurchases, findCard, putOnBoard, setTokens, testGame } from './helpers';

describe('AI', () => {
  it('四个档位在任意局面都返回合法走法', () => {
    let state = testGame(3, 'ai-legal');
    const rnd = randomAgent();
    for (let i = 0; i < 15 && state.phase !== 'ended'; i++) {
      const res = applyMove(state, rnd(state));
      expect(res.error).toBeUndefined();
      state = res.state;
    }
    const moves = legalMoves(state);
    for (const level of AI_LEVELS) {
      const move = chooseMove(state, level);
      expect(moves.some((m) => JSON.stringify(m) === JSON.stringify(move))).toBe(true);
    }
  });

  it('困难 AI 会抓住制胜购买（直接到 15 分）', () => {
    const state = testGame(2, 'ai-win');
    craftPurchases(state, 0, 14);
    const winCard = findCard((c) => c.tier === 3 && c.points === 5);
    putOnBoard(state, 3, 0, winCard.id);
    setTokens(state, 0, { ...winCard.cost });
    const move = chooseMove(state, 'hard');
    expect(move.type).toBe('buy');
    const res = applyMove(state, move);
    expect(res.error).toBeUndefined();
    expect(totalPoints(res.state.players[0]!)).toBeGreaterThanOrEqual(15);
    expect(res.state.finalRound).toBe(true);
  });

  it('陪玩档与困难档的决定都是确定性的（同局面同结果）', () => {
    const state = testGame(2, 'ai-det');
    for (const level of ['friendly', 'hard'] as const) {
      const a = chooseMove(state, level);
      const b = chooseMove(state, level);
      expect(a).toEqual(b);
    }
  });

  it('AI 不读取牌堆顺序（隐藏信息）：同可见局面、不同牌序 → 同一步', () => {
    const base = testGame(2, 'ai-hidden-order');
    // 让双方都进入终局区间（启用困难档的两层深搜）
    craftPurchases(base, 0, 12);
    craftPurchases(base, 1, 11);
    const shuffled = structuredClone(base) as typeof base;
    shuffled.decks = shuffled.decks.map((deck) => [...deck].reverse());

    // 可见信息一致、牌堆顺序不同
    expect(JSON.stringify(shuffled.board)).toBe(JSON.stringify(base.board));
    expect(JSON.stringify(shuffled.players)).toBe(JSON.stringify(base.players));
    expect(JSON.stringify(shuffled.decks)).not.toBe(JSON.stringify(base.decks));

    for (const level of AI_LEVELS) {
      expect(chooseMove(shuffled, level)).toEqual(chooseMove(base, level));
    }
  });

  it('AI 决策与牌堆顺序无关（多局面扫描）', { timeout: 30000 }, () => {
    let probes = 0;
    let compared = 0;
    const CHEAP = ['friendly', 'easy', 'normal'] as const;
    for (const seed of ['scan-a', 'scan-b', 'scan-c', 'scan-d']) {
      for (const seats of [2, 3, 4] as const) {
        let state = testGame(seats, seed);
        let probeIndex = 0;
        for (let step = 0; step < 13; step++) {
          // 每 6 步比对一次（含"有人接近获胜"的终局区间，会触发困难档两层深搜）
          if (step % 6 === 0 || step === 12) {
            const probe = structuredClone(state) as typeof state;
            if (step >= 12) craftPurchases(probe, 0, 12);
            const flipped = structuredClone(probe) as typeof probe;
            flipped.decks = flipped.decks.map((deck) => [...deck].reverse());
            probes += 1;
            // 轻档位全扫；困难档（两层深搜，较慢）每 3 个局面抽 1 个
            const levels = probeIndex % 3 === 0 ? [...CHEAP, 'hard' as const] : [...CHEAP];
            probeIndex += 1;
            for (const level of levels) {
              const mvA = chooseMove(probe, level);
              const mvB = chooseMove(flipped, level);
              if (JSON.stringify(mvA) !== JSON.stringify(mvB)) {
                console.log('SCANDBG', seed, seats, step, level, JSON.stringify(mvA), JSON.stringify(mvB));
              }
              expect(mvB).toEqual(mvA);
              compared += 1;
            }
          }
          const res = applyMove(state, chooseMove(state, 'normal'));
          if (res.error) break;
          state = res.state;
        }
      }
    }
    expect(probes).toBeGreaterThanOrEqual(30);
    expect(compared).toBeGreaterThanOrEqual(100);
  });

  it('AI 可见局面把牌堆顺序规范化（同牌堆集合 → 同一局面）', () => {
    const base = testGame(2, 'ai-canonical');
    const shuffled = structuredClone(base) as typeof base;
    shuffled.decks = shuffled.decks.map((deck) => [...deck].reverse());
    expect(aiVisibleState(shuffled).decks).toEqual(aiVisibleState(base).decks);
    // 规范化只动顺序，不动张数
    expect(aiVisibleState(base).decks.map((d) => d.length)).toEqual(base.decks.map((d) => d.length));
    // 真实牌序不在其中：规范化结果与真实顺序无关
    expect(JSON.stringify(aiVisibleState(base).decks)).not.toBe(JSON.stringify(base.decks));
  });
});
