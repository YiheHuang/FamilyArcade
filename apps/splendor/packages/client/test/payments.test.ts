import { CARDS, cardById, validatePayment, type PlayerState } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import { paymentOptions } from '../src/logic';
import { useGame, type SeatConfig } from '../src/store';
import { localView } from '../src/view';

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('购卡支付方案', () => {
  it('随机场景下两种支付方案都能通过引擎校验', () => {
    const rnd = lcg(20261013);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const card = CARDS[Math.floor(rnd() * CARDS.length)]!;
      const player = {
        bonuses: {
          white: Math.floor(rnd() * 3),
          blue: Math.floor(rnd() * 3),
          green: Math.floor(rnd() * 3),
          red: Math.floor(rnd() * 3),
          black: Math.floor(rnd() * 3),
        },
        tokens: {
          white: Math.floor(rnd() * 4),
          blue: Math.floor(rnd() * 4),
          green: Math.floor(rnd() * 4),
          red: Math.floor(rnd() * 4),
          black: Math.floor(rnd() * 4),
          gold: Math.floor(rnd() * 3),
        },
      } as unknown as PlayerState;
      const plans = paymentOptions(player, card);
      if (!plans.affordable) continue;
      for (const plan of [plans.saveGold, plans.useGold]) {
        const err = validatePayment(player, card, plan.pay);
        expect(err, `卡#${card.id} ${plan.label}`).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('「用金币」支付会优先花掉金币、保留彩色宝石', () => {
    const seats: SeatConfig[] = [
      { kind: 'human', aiLevel: 'normal', name: 'A' },
      { kind: 'human', aiLevel: 'normal', name: 'B' },
    ];
    const syncView = () => {
      // 测试中直接改写了完整游戏状态，需要同步视图
      const g = useGame.getState().game!;
      useGame.setState({ view: localView(g) });
    };
    useGame.getState().startGame(seats, { seed: 'pay-test' });
    const g = useGame.getState().game!;
    // 找一张单一颜色成本为 3 的卡放到桌面
    const card = CARDS.find((c) => c.tier === 1 && c.cost.blue === 3 && c.cost.white + c.cost.green + c.cost.red + c.cost.black === 0)!;
    g.board[0]![0] = card.id;
    // 玩家 0：1 蓝 + 2 金
    const p = g.players[0]!;
    p.tokens = { white: 0, blue: 1, green: 0, red: 0, black: 0, gold: 2 };
    syncView();
    useGame.getState().openPopup({ cardId: card.id, source: { kind: 'board', tier: 1, slot: 0 }, anchor: { x: 0, y: 0, w: 1, h: 1 } });

    // 缺口 3、蓝只有 1 -> 无论哪种方案都必须用掉 2 枚金币
    useGame.getState().doBuy('saveGold');
    const after1 = useGame.getState().game!;
    expect(after1.players[0]!.tokens.gold).toBe(0);
    expect(after1.players[0]!.tokens.blue).toBe(0);
    expect(after1.players[0]!.purchased).toContain(card.id);

    // 重新构造：3 红 + 2 金，成本 3 红 -> 用金币方案应花 2 金 + 1 红
    const g2 = useGame.getState().game!;
    const card2 = CARDS.find((c) => c.tier === 1 && c.cost.red === 3 && c.cost.white + c.cost.blue + c.cost.green + c.cost.black === 0)!;
    g2.board[0]![1] = card2.id;
    g2.current = 0;
    g2.phase = 'playing';
    const p2 = g2.players[0]!;
    p2.tokens = { white: 0, blue: 0, green: 0, red: 3, black: 0, gold: 2 };
    syncView();
    useGame.getState().openPopup({ cardId: card2.id, source: { kind: 'board', tier: 1, slot: 1 }, anchor: { x: 0, y: 0, w: 1, h: 1 } });
    const plans = paymentOptions(useGame.getState().view!.players[0]!, card2);
    expect(plans.useGold.label).toContain('金');
    useGame.getState().doBuy('useGold');
    const after2 = useGame.getState().game!;
    expect(after2.players[0]!.tokens.gold).toBe(0); // 2 金全部用掉
    expect(after2.players[0]!.tokens.red).toBe(2); // 只用 1 枚红宝石
    expect(after2.players[0]!.purchased).toContain(card2.id);
  });

  it('不含金币时的默认方案与引擎默认一致', () => {
    const card = cardById(0);
    const player = {
      bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      tokens: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 0 },
    } as unknown as PlayerState;
    const plans = paymentOptions(player, card);
    expect(plans.saveGold.pay.gold).toBe(0);
    expect(plans.useGold.pay.gold).toBe(0);
  });
});
