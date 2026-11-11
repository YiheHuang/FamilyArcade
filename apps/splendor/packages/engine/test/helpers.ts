import type { CardDef, Color, GameState, Tier, TokenColor, Tokens } from '../src/types';
import { setupGame, type PlayerConfig } from '../src/setup';
import { CARDS, cardById } from '../src/data';

export function testGame(players = 2, seed = 'test-seed'): GameState {
  const configs: PlayerConfig[] = Array.from({ length: players }, (_, i) => ({ name: `P${i}`, kind: 'human' }));
  return setupGame(configs, { seed });
}

/** 从银行把令牌"转移"给玩家（保持守恒，用于构造场景） */
export function transferTo(state: GameState, seat: number, tokens: Partial<Tokens>): void {
  const p = state.players[seat]!;
  for (const [k, v] of Object.entries(tokens)) {
    const key = k as TokenColor;
    const count = v as number;
    if (state.bank[key] < count) throw new Error(`银行 ${key} 不足：${state.bank[key]} < ${count}`);
    state.bank[key] -= count;
    p.tokens[key] += count;
  }
}

/** 直接设定玩家令牌（不做守恒检查，仅用于纯逻辑测试） */
export function setTokens(state: GameState, seat: number, tokens: Partial<Tokens>): void {
  const p = state.players[seat]!;
  for (const [k, v] of Object.entries(tokens)) p.tokens[k as TokenColor] = v as number;
}

export function giveBonuses(state: GameState, seat: number, bonuses: Partial<Record<Color, number>>): void {
  const p = state.players[seat]!;
  for (const [k, v] of Object.entries(bonuses)) p.bonuses[k as Color] += v as number;
}

/** 把指定卡放到桌面某个位置（保持 90 张守恒：原位置卡放回该档牌堆顶） */
export function putOnBoard(state: GameState, tier: Tier, slot: number, cardId: number): void {
  // ① 把 cardId 从当前所在位置（牌堆或桌面）移除
  let found = false;
  for (let t = 0; t < 3 && !found; t++) {
    const i = state.decks[t]!.indexOf(cardId);
    if (i >= 0) {
      state.decks[t]!.splice(i, 1);
      found = true;
    }
  }
  if (!found) {
    for (let t = 0; t < 3 && !found; t++) {
      for (let sl = 0; sl < 4; sl++) {
        if (state.board[t]![sl] === cardId) {
          if (t === tier - 1 && sl === slot) return; // 已在目标位置
          state.board[t]![sl] = null;
          found = true;
          break;
        }
      }
    }
  }
  // ② 目标位置原卡放回牌堆，保持卡牌总数守恒
  const old = state.board[tier - 1]![slot];
  if (old != null) state.decks[tier - 1]!.push(old);
  state.board[tier - 1]![slot] = cardId;
}

export function findCard(pred: (c: CardDef) => boolean): CardDef {
  const card = CARDS.find(pred);
  if (!card) throw new Error('找不到符合条件的卡');
  return card;
}

export function cardsWithPoints(points: number, tier?: Tier): CardDef[] {
  return CARDS.filter((c) => c.points === points && (tier === undefined || c.tier === tier));
}

/** 构造"以指定分数买下某些卡"的玩家状态（用于终局测试） */
export function craftPurchases(state: GameState, seat: number, targetPoints: number): number[] {
  const p = state.players[seat]!;
  const picked: CardDef[] = [];
  let remaining = targetPoints;
  const pool = [...CARDS].sort((a, b) => b.points - a.points);
  for (const card of pool) {
    if (remaining <= 0) break;
    if (card.points > 0 && card.points <= remaining) {
      picked.push(card);
      remaining -= card.points;
    }
  }
  if (remaining > 0) throw new Error(`无法凑出 ${targetPoints} 分`);
  p.purchased = picked.map((c) => c.id);
  p.cardPoints = picked.reduce((s, c) => s + c.points, 0);
  p.bonuses = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  for (const c of picked) p.bonuses[c.bonus]++;
  return p.purchased;
}

export function topOfDeck(state: GameState, tier: Tier): number {
  return state.decks[tier - 1]![state.decks[tier - 1]!.length - 1]!;
}

export function boardCardId(state: GameState, tier: Tier, slot: number): number | null {
  return state.board[tier - 1]![slot] ?? null;
}

export function cardCostTokens(card: CardDef): Partial<Tokens> {
  const t: Partial<Tokens> = {};
  for (const c of ['white', 'blue', 'green', 'red', 'black'] as Color[]) {
    if (card.cost[c] > 0) t[c] = card.cost[c];
  }
  return t;
}

export function cardByIdForTest(id: number): CardDef {
  return cardById(id);
}
