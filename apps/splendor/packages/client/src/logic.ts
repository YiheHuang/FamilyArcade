import {
  COLORS,
  cardById,
  deficitFor,
  nobleById,
  totalPoints,
  type CardDef,
  type Cost,
  type GameEvent,
  type GameState,
  type Move,
  type Tokens,
  type TokenColor,
} from '@splendor/engine';
import { T } from './i18n';
import { GEM_NAME, GEM_SHORT, tokenText } from './ui/gems';
import type { Color } from '@splendor/engine';
import type { GameView } from './view';

/** 购买/成本计算只需要加成与令牌（GameState 与局域网视图通用） */
interface EconomyPlayer {
  bonuses: Cost;
  tokens: Tokens;
}

/** 扣除加成与金币后，玩家购买该卡还缺哪些颜色 */
export function playerDeficit(player: EconomyPlayer, card: CardDef): Cost {
  const def = deficitFor(card, player.bonuses);
  const out: Cost = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  let goldAvailable = player.tokens.gold;
  for (const c of COLORS) {
    const have = Math.min(def[c], player.tokens[c]);
    let missing = def[c] - have;
    if (missing > 0 && goldAvailable > 0) {
      const use = Math.min(missing, goldAvailable);
      missing -= use;
      goldAvailable -= use;
    }
    out[c] = missing;
  }
  return out;
}

export function canAffordCard(player: EconomyPlayer, card: CardDef): boolean {
  const def = playerDeficit(player, card);
  return COLORS.every((c) => def[c] === 0);
}

export function deficitSummary(player: EconomyPlayer, card: CardDef): string {
  const def = playerDeficit(player, card);
  const parts = COLORS.filter((c) => def[c] > 0).map((c) => `${GEM_SHORT[c]}${def[c]}`);
  return parts.join(' ');
}

/** 缺口总数（用于决定是否显示"缺 X"角标，避免满屏噪声） */
export function deficitTotal(player: EconomyPlayer, card: CardDef): number {
  const def = playerDeficit(player, card);
  return COLORS.reduce((s, c) => s + def[c], 0);
}

/** 自动归还建议：优先留下"接下来要买卡所缺的颜色"，优先归还多余/不需要的 */
export function autoDiscardTokens(view: GameView, seat: number): Partial<Record<TokenColor, number>> {
  const p = view.players[seat]!;
  const total = COLORS.reduce((s, c) => s + p.tokens[c], 0) + p.tokens.gold;
  const need = total - 10;
  if (need <= 0) return {};
  const wanted = new Map<Color, number>();
  const consider = (card: CardDef): void => {
    const def = deficitFor(card, p.bonuses);
    let gap = 0;
    for (const c of COLORS) gap += Math.max(0, def[c] - p.tokens[c]);
    gap = Math.max(0, gap - p.tokens.gold);
    if (gap <= 2) {
      for (const c of COLORS) if (def[c] > p.tokens[c]) wanted.set(c, (wanted.get(c) ?? 0) + 1);
    }
  };
  for (const id of view.board.flat()) if (id != null) consider(cardById(id));
  for (const r of p.reserved) if (!('hidden' in r)) consider(cardById(r.cardId));

  const entries: { c: TokenColor; count: number; want: number }[] = (
    ['white', 'blue', 'green', 'red', 'black'] as Color[]
  ).map((c) => ({ c, count: p.tokens[c], want: wanted.get(c) ?? 0 }));
  entries.sort((a, b) => a.want - b.want || b.count - a.count);
  entries.push({ c: 'gold', count: p.tokens.gold, want: 1 }); // 金币最后归还

  const out: Partial<Record<TokenColor, number>> = {};
  let left = need;
  for (const e of entries) {
    if (left <= 0) break;
    const take = Math.min(e.count, left);
    if (take > 0) {
      out[e.c] = take;
      left -= take;
    }
  }
  return out;
}

export function totalTokensOf(player: { tokens: Tokens }): number {
  return COLORS.reduce((s, c) => s + player.tokens[c], 0) + player.tokens.gold;
}

export interface PaymentPlan {
  pay: Tokens;
  /** 描述文本，例如「白1 蓝2」或「白1 + 金币2」 */
  label: string;
}

function emptyTokensLocal(): Tokens {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

function planLabel(pay: Tokens): string {
  const parts = COLORS.filter((c) => pay[c] > 0).map((c) => `${GEM_SHORT[c]}${pay[c]}`);
  if (pay.gold > 0) parts.push(`${T.gems.short.gold}${pay.gold}`);
  return parts.join(' ') || T.game.free;
}

/**
 * 两种支付方案（均满足引擎校验：不允许超额支付，金币恰好补足缺口）：
 *  - saveGold：优先花白色宝石（尽量保留金币）
 *  - useGold：尽量使用金币（保留彩色宝石，适合接下来还要买卡的场景）
 */
export function paymentOptions(player: EconomyPlayer, card: CardDef): { saveGold: PaymentPlan; useGold: PaymentPlan; affordable: boolean } {
  const def = deficitFor(card, player.bonuses);
  const totalDeficit = COLORS.reduce((s, c) => s + def[c], 0);

  // 省金币：彩色优先
  const save = emptyTokensLocal();
  let goldNeeded = 0;
  for (const c of COLORS) {
    const use = Math.min(def[c], player.tokens[c]);
    save[c] = use;
    goldNeeded += def[c] - use;
  }
  const affordable = goldNeeded <= player.tokens.gold;
  if (!affordable) {
    return { saveGold: { pay: save, label: planLabel(save) }, useGold: { pay: save, label: planLabel(save) }, affordable: false };
  }
  save.gold = goldNeeded;

  // 用金币：金币优先，彩色补足剩余
  const goldToUse = Math.min(player.tokens.gold, totalDeficit);
  let remaining = totalDeficit - goldToUse;
  const use = emptyTokensLocal();
  for (const c of COLORS) {
    const capacity = Math.min(def[c], player.tokens[c]);
    const take = Math.min(capacity, remaining);
    use[c] = take;
    remaining -= take;
  }
  use.gold = goldToUse;
  return { saveGold: { pay: save, label: planLabel(save) }, useGold: { pay: use, label: planLabel(use) }, affordable: true };
}

export function costText(cost: Cost): string {
  const parts = COLORS.filter((c) => cost[c] > 0).map((c) => `${GEM_SHORT[c]}${cost[c]}`);
  return parts.join(' ') || T.game.free;
}

/**
 * 提示的"为什么"：用公开信息给出简短理由（牌效 / 得分 / 贵族 / 缺口 / 卡人）。
 * 与 AI 的评估同源但独立实现，保持纯函数、可单测。
 */
export function explainMove(state: GameState, move: Move): string {
  const me = state.players[state.current]!;
  const pointsNow = totalPoints(state.players[state.current]!);

  const boardCardAt = (tier: 1 | 2 | 3, slot: number): CardDef | null => {
    const id = state.board[tier - 1]?.[slot];
    return id == null ? null : cardById(id);
  };

  /** 这张牌贵不贵得离谱 / 牌效高不高 */
  const efficiencyReason = (card: CardDef): string | null => {
    const costs = Object.entries(card.cost) as Array<[TokenColor, number]>;
    const total = costs.reduce((sum, [, n]) => sum + n, 0);
    const single = costs.find(([, n]) => n === total);
    if (card.tier === 1 && total === 3) {
      return single ? T.hints.effTier1Single : T.hints.effTier1Split;
    }
    if (card.tier === 2 && total === 5 && single) return T.hints.effTier2Five;
    if (card.tier === 2 && total === 7) return T.hints.effTier2FourTwoOne;
    if (card.tier === 3 && total === 7 && single) return T.hints.effTier3Seven;
    if (card.tier === 3 && total === 10) return T.hints.effTier3SevenThree;
    return null;
  };

  const nobleAfterBuy = (card: CardDef): string | null => {
    const bonuses: Record<string, number> = { ...me.bonuses };
    bonuses[card.bonus] = (bonuses[card.bonus] ?? 0) + 1;
    for (const id of state.nobles) {
      const noble = nobleById(id);
      const meets = COLORS.every((c) => (bonuses[c] ?? 0) >= noble.requirement[c]);
      if (meets && noble.requirement[card.bonus] === bonuses[card.bonus]) return T.hints.nobleVisit;
    }
    return null;
  };

  const bestTargetDeficit = (): { card: CardDef; deficit: number } | null => {
    let best: { card: CardDef; deficit: number } | null = null;
    for (const card of boardCardsOf(state)) {
      if (card.points < 3) continue;
      const deficit = tokenGap(me, card);
      if (!best || deficit < best.deficit) best = { card, deficit };
    }
    return best;
  };

  switch (move.type) {
    case 'buy': {
      let card: CardDef | null = null;
      if (move.target.kind === 'board') card = boardCardAt(move.target.tier, move.target.slot);
      else if (move.target.kind === 'reserved') {
        const r = me.reserved[move.target.index];
        card = r ? cardById(r.cardId) : null;
      }
      if (!card) return T.hints.goodMove;
      if (pointsNow + card.points >= 15) return T.hints.reachFifteen;
      const noble = nobleAfterBuy(card);
      if (noble) return noble;
      if (card.points >= 4) return T.hints.bigPoints(card.points);
      const eff = efficiencyReason(card);
      if (eff) return eff;
      return T.hints.gainBonus;
    }
    case 'take':
    case 'take2': {
      const colors = move.type === 'take' ? move.colors : [move.color];
      const target = bestTargetDeficit();
      if (target) {
        const wanted = colors.filter((c) => (target.card.cost[c] ?? 0) > 0);
        if (wanted.length > 0) return T.hints.saveForCard(target.card.points, wanted.map((c) => GEM_SHORT[c]).join(' '));
      }
      return T.hints.collectGems;
    }
    case 'reserve': {
      if (move.target.kind === 'deck') return T.hints.reserveDeck;
      const card = move.target.kind === 'board' ? boardCardAt(move.target.tier, move.target.slot) : null;
      if (card && card.points >= 4) return T.hints.lockBigCard(card.points);
      return T.hints.reserveUseful;
    }
    case 'discard':
      return T.hints.discard;
    case 'chooseNoble':
      return T.hints.pickNoble;
    default:
      return T.hints.goodMove;
  }
}

/** 还差几枚令牌才买得起（金币可顶任意颜色） */
function tokenGap(player: { bonuses: Cost; tokens: Tokens }, card: CardDef): number {
  const need = deficitFor(card, player.bonuses);
  let missing = 0;
  for (const c of COLORS) {
    const short = Math.max(0, need[c] - player.tokens[c]);
    missing += short;
  }
  return Math.max(0, missing - player.tokens.gold);
}

/** 桌面上的明牌（提示理由用，不读牌堆） */
function boardCardsOf(state: GameState): CardDef[] {
  const out: CardDef[] = [];
  for (let tier = 0; tier < 3; tier++) {
    for (const id of state.board[tier] ?? []) {
      if (id != null) out.push(cardById(id));
    }
  }
  return out;
}

export function cardLabel(card: CardDef): string {
  return T.log.cardLabel(card.tier, GEM_NAME[card.bonus], card.points);
}

export function cardName(card: CardDef): string {
  return `${GEM_NAME[card.bonus]}${card.points > 0 ? `+${card.points}` : ''}`;
}

interface NameLookup {
  players: Array<{ name: string }>;
}

export function describeEvent(event: GameEvent, view: NameLookup): string | null {
  const name = (seat: number) => view.players[seat]?.name ?? T.log.playerN(seat + 1);
  switch (event.type) {
    case 'turn-start':
      return T.log.turnStart(name(event.seat));
    case 'tokens-taken':
      return T.log.tokensTaken(name(event.seat), tokenText(event.tokens));
    case 'tokens-returned':
      return T.log.tokensReturned(name(event.seat), tokenText(event.tokens));
    case 'card-reserved':
      return T.log.cardReserved(name(event.seat), event.fromDeck, event.goldTaken);
    case 'card-bought': {
      const card = cardById(event.cardId);
      return T.log.cardBought(name(event.seat), cardLabel(card), card.points);
    }
    case 'board-refilled':
      return null;
    case 'noble-visit': {
      const noble = nobleById(event.nobleId);
      return T.log.noble(noble.name, name(event.seat));
    }
    case 'discard-required':
      return T.log.discardRequired(name(event.seat), event.total);
    case 'noble-choice-required':
      return T.log.nobleRequired(name(event.seat));
    case 'final-round':
      return T.log.finalRound(name(event.triggeredBy));
    case 'game-end':
      return T.log.gameEnd(event.winners.map(name).join(', '));
    default:
      return null;
  }
}

export function describeMove(state: GameState, move: Move): string {
  const me = state.players[state.current]!;
  switch (move.type) {
    case 'take':
      return T.log.moveTake(move.colors.map((c) => GEM_SHORT[c]).join(' '));
    case 'take2':
      return T.log.moveTake2(GEM_SHORT[move.color]);
    case 'reserve': {
      if (move.target.kind === 'board') {
        const id = state.board[move.target.tier - 1]?.[move.target.slot];
        return id != null ? T.log.moveReserve(cardLabel(cardById(id))) : T.log.moveReserveBoard;
      }
      if (move.target.kind === 'deck') return T.log.moveReserveDeck(move.target.tier);
      return T.game.reserve;
    }
    case 'buy': {
      if (move.target.kind === 'board') {
        const id = state.board[move.target.tier - 1]?.[move.target.slot];
        return id != null ? T.log.moveBuy(cardLabel(cardById(id))) : T.log.moveBuyBoard;
      }
      if (move.target.kind === 'reserved') {
        const r = me.reserved[move.target.index];
        return r ? T.log.moveBuy(cardLabel(cardById(r.cardId))) : T.log.moveBuyReserved;
      }
      return T.game.buy;
    }
    case 'discard':
      return T.log.moveDiscard(tokenText(move.tokens));
    case 'chooseNoble': {
      const noble = nobleById(move.nobleId);
      return T.log.moveNoble(noble.name);
    }
    case 'pass':
      return T.log.movePass;
    default:
      return T.log.moveCustom;
  }
}

export function totalPointsOfView(player: { cardPoints: number; nobles: unknown[] }): number {
  return player.cardPoints + player.nobles.length * 3;
}

export function displayName(view: NameLookup, seat: number): string {
  return view.players[seat]?.name ?? T.log.playerN(seat + 1);
}

export function pipCount(tokens: Partial<Record<TokenColor, number>>): number {
  return Object.values(tokens).reduce<number>((a, b) => a + (b ?? 0), 0);
}

export type { GameView };
