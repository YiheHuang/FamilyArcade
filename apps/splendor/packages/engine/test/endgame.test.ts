import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/apply';
import { setupGame } from '../src/setup';
import { totalPoints, scoreboard } from '../src/scoring';
import { craftPurchases, findCard, putOnBoard, testGame, transferTo } from './helpers';
import { CARDS } from '../src/data';

describe('终局与胜负判定', () => {
  it('达到 15 分触发终局，回到起始玩家时结束', () => {
    const state = testGame(3, 'endgame-1');
    const purchased = craftPurchases(state, 0, 14);
    const onePoint = findCard((c) => c.tier === 1 && c.points === 1 && c.cost.green === 4 && c.cost.white + c.cost.blue + c.cost.red + c.cost.black === 0);
    putOnBoard(state, 1, 1, onePoint.id);
    transferTo(state, 0, { green: 4 });

    const res = applyMove(state, { type: 'buy', target: { kind: 'board', tier: 1, slot: 1 } });
    expect(res.error).toBeUndefined();
    const s1 = res.state;
    expect(totalPoints(s1.players[0]!)).toBe(15);
    expect(s1.finalRound).toBe(true);
    expect(s1.finalTriggered).toBe(0);
    expect(s1.phase).toBe('playing'); // 其他玩家补齐回合

    const s2 = applyMove(s1, { type: 'take', colors: ['white'] }).state;
    expect(s2.phase).toBe('playing');
    const s3 = applyMove(s2, { type: 'take', colors: ['white'] }).state;
    expect(s3.phase).toBe('ended');
    expect(s3.winners).toEqual([0]);
    expect(purchased.length).toBeGreaterThan(0);
  });

  it('平分时购卡数少者胜', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'tie-1' });
    state.finalRound = true;
    state.finalTriggered = 0;
    state.turnsTaken = [1, 0];
    state.current = 1;
    // 玩家 0：15 分 / 4 张卡；玩家 1：15 分 / 3 张卡
    const five = CARDS.filter((c) => c.points === 5);
    const four = CARDS.filter((c) => c.points === 4);
    const three = CARDS.filter((c) => c.points === 3);
    state.players[0]!.purchased = [four[0]!.id, four[1]!.id, four[2]!.id, three[0]!.id]; // 4+4+4+3 = 15
    state.players[0]!.cardPoints = 15;
    state.players[1]!.purchased = [five[0]!.id, five[1]!.id, five[2]!.id]; // 5+5+5 = 15
    state.players[1]!.cardPoints = 15;

    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.error).toBeUndefined();
    expect(res.state.phase).toBe('ended');
    expect(res.state.winners).toEqual([1]);
  });

  it('平分且购卡数相同：预定卡少者胜', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'tie-2' });
    state.finalRound = true;
    state.turnsTaken = [1, 0];
    state.current = 1;
    const five = CARDS.filter((c) => c.points === 5);
    state.players[0]!.purchased = [five[0]!.id, five[1]!.id, five[2]!.id];
    state.players[0]!.cardPoints = 15;
    state.players[1]!.purchased = [five[3]!.id, five[4]!.id, CARDS.filter((c) => c.points === 5)[5]?.id ?? five[0]!.id];
    state.players[1]!.cardPoints = 15;
    state.players[0]!.reserved = [{ cardId: state.decks[0]!.pop()!, fromDeck: true }];

    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.state.phase).toBe('ended');
    expect(res.state.winners).toEqual([1]);
  });

  it('全平则共享胜利', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'tie-3' });
    state.finalRound = true;
    state.turnsTaken = [1, 0];
    state.current = 1;
    const five = CARDS.filter((c) => c.points === 5);
    const four = CARDS.filter((c) => c.points === 4);
    const one = CARDS.filter((c) => c.points === 1);
    // 双方均 15 分、4 张卡、0 预定卡 -> 共享胜利
    state.players[0]!.purchased = [five[0]!.id, five[1]!.id, four[0]!.id, one[0]!.id];
    state.players[0]!.cardPoints = 15;
    state.players[1]!.purchased = [five[2]!.id, five[3]!.id, four[1]!.id, one[1]!.id];
    state.players[1]!.cardPoints = 15;
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.state.phase).toBe('ended');
    expect([...res.state.winners!].sort()).toEqual([0, 1]);
  });

  it('分数高者优先于购卡数少者', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'tie-4' });
    state.finalRound = true;
    state.turnsTaken = [1, 0];
    state.current = 1;
    state.players[0]!.purchased = [CARDS.filter((c) => c.points === 5)[0]!.id];
    state.players[0]!.cardPoints = 16;
    state.players[1]!.purchased = [];
    state.players[1]!.cardPoints = 15;
    const res = applyMove(state, { type: 'take', colors: ['white'] });
    expect(res.state.winners).toEqual([0]);
  });

  it('死锁（银行掏空且无人可行动）：整轮 pass 后按分数结算', () => {
    const state = setupGame([{ name: 'A' }, { name: 'B' }], { seed: 'deadlock' });
    // 掏空银行（含金币）
    for (const c of ['white', 'blue', 'green', 'red', 'black'] as const) state.bank[c] = 0;
    state.bank.gold = 0;
    // 双方预定位满 3 张，阻止预定
    for (const seat of [0, 1]) {
      state.players[seat]!.reserved = [0, 1, 2].map(() => ({ cardId: state.decks[0]!.pop()!, fromDeck: false }));
    }
    // 桌面只剩一张无人买得起的贵卡
    const expensive = CARDS.find((c) => c.tier === 3 && c.points === 5)!;
    state.board[0]![0] = expensive.id;
    // 玩家 0 有 5 分优势
    craftPurchases(state, 0, 5);

    const r1 = applyMove(state, { type: 'pass' });
    expect(r1.error).toBeUndefined();
    expect(r1.state.phase).toBe('playing');
    const r2 = applyMove(r1.state, { type: 'pass' });
    expect(r2.error).toBeUndefined();
    expect(r2.state.phase).toBe('ended');
    expect(r2.state.endReason).toBe('deadlock');
    expect(r2.state.winners).toEqual([0]);
  });

  it('scoreboard 汇总正确', () => {
    const state = testGame(2, 'scoreboard');
    craftPurchases(state, 0, 10);
    state.players[0]!.nobles = [0];
    const rows = scoreboard(state.players);
    expect(rows[0]!.points).toBe(13);
    expect(rows[0]!.noblePoints).toBe(3);
    expect(rows[1]!.points).toBe(0);
  });
});
