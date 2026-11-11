import { COLORS } from './types.js';
import type { GameState } from './types.js';
import { cardById, nobleById } from './data/index.js';
import { gemsPerColorFor } from './setup.js';
import { totalPoints } from './scoring.js';

/**
 * 全量不变量检查（测试与 AI 模拟回归用）：
 *  - 令牌守恒（各色 = 初始枚数；金币 = 5）
 *  - 卡牌守恒（90 张全部可追踪且不重复）
 *  - 贵族守恒（桌面 + 各玩家 = 10）
 *  - 分数/加成与已购卡一致
 *  - 阶段与 pending 一致、预定上限、手上限
 */
export function checkInvariants(state: GameState): string[] {
  const issues: string[] = [];
  const n = state.playerCount;

  // 令牌守恒
  const perColor = gemsPerColorFor(n);
  for (const c of COLORS) {
    const total = state.bank[c] + state.players.reduce((s, p) => s + p.tokens[c], 0);
    if (total !== perColor) issues.push(`令牌不守恒：${c} 总量 ${total} ≠ ${perColor}`);
  }
  const goldTotal = state.bank.gold + state.players.reduce((s, p) => s + p.tokens.gold, 0);
  if (goldTotal !== 5) issues.push(`金币不守恒：总量 ${goldTotal} ≠ 5`);

  // 卡牌守恒
  const ids: number[] = [];
  for (const deck of state.decks) ids.push(...deck);
  for (const row of state.board) for (const id of row) if (id != null) ids.push(id);
  for (const p of state.players) {
    ids.push(...p.purchased);
    ids.push(...p.reserved.map((r) => r.cardId));
  }
  if (ids.length !== 90) issues.push(`卡牌数量异常：${ids.length} ≠ 90`);
  if (new Set(ids).size !== ids.length) issues.push('存在重复卡牌（同一张卡出现在多处）');

  // 贵族守恒：投入游戏的贵族数 = 玩家数 + 1（桌面 + 已被玩家获得）
  const nobleIds = [...state.nobles, ...state.players.flatMap((p) => p.nobles)];
  const expectedNobles = n + 1;
  if (nobleIds.length !== expectedNobles) {
    issues.push(`贵族数量异常：${nobleIds.length} ≠ ${expectedNobles}`);
  }
  if (new Set(nobleIds).size !== nobleIds.length) issues.push('存在重复贵族');

  // 玩家一致性
  for (const p of state.players) {
    const cardPoints = p.purchased.reduce((s, id) => s + cardById(id).points, 0);
    if (cardPoints !== p.cardPoints) issues.push(`玩家 ${p.seat} 分数与购卡不一致：${p.cardPoints} ≠ ${cardPoints}`);
    for (const c of COLORS) {
      const count = p.purchased.filter((id) => cardById(id).bonus === c).length;
      if (count !== p.bonuses[c]) issues.push(`玩家 ${p.seat} ${c} 加成不一致：${p.bonuses[c]} ≠ ${count}`);
    }
    if (p.reserved.length > 3) issues.push(`玩家 ${p.seat} 预定卡超过 3 张`);
    for (const id of p.nobles) {
      const noble = nobleById(id);
      if (!COLORS.every((c) => p.bonuses[c] >= noble.requirement[c])) {
        issues.push(`玩家 ${p.seat} 持有未满足要求的贵族 #${id}`);
      }
    }
  }

  // 阶段一致性
  const totalTokensOf = (seat: number) => {
    const t = state.players[seat]!.tokens;
    return COLORS.reduce((s, c) => s + t[c], 0) + t.gold;
  };
  if (state.phase === 'discarding') {
    const pending = state.pending as { player: number } | null;
    if (!pending || totalTokensOf(pending.player) <= 10) issues.push('discarding 阶段但无需归还');
  } else if (state.phase === 'choosing-noble') {
    const pending = state.pending as { player: number; options: number[] } | null;
    if (!pending || pending.options.length < 2) issues.push('choosing-noble 阶段但可选项不足');
  } else if (state.phase === 'playing') {
    for (const p of state.players) {
      if (totalTokensOf(p.seat) > 10) issues.push(`玩家 ${p.seat} 在非归还阶段持有超过 10 枚令牌`);
    }
  } else if (state.phase === 'ended') {
    if (!state.winners || state.winners.length === 0) issues.push('已结束但没有胜者');
  }

  // 终局一致性
  if (state.phase === 'ended') {
    const best = Math.max(...state.players.map(totalPoints));
    if (state.endReason !== 'deadlock' && state.players.every((p) => totalPoints(p) < 15)) {
      issues.push('终局时无人达到 15 分');
    }
    if (!state.winners!.some((seat) => totalPoints(state.players[seat]!) === best)) {
      issues.push('胜者不是最高分');
    }
  }

  return issues;
}
