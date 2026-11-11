import { COLORS } from './types.js';
import type { CardDef, Color, Cost, PlayerState, TokenColor, Tokens } from './types.js';
import { emptyTokens } from './setup.js';

/** 折扣后的成本缺口：max(0, 成本 - 加成) */
export function deficitFor(card: CardDef, bonuses: Cost): Cost {
  return {
    white: Math.max(0, card.cost.white - bonuses.white),
    blue: Math.max(0, card.cost.blue - bonuses.blue),
    green: Math.max(0, card.cost.green - bonuses.green),
    red: Math.max(0, card.cost.red - bonuses.red),
    black: Math.max(0, card.cost.black - bonuses.black),
  };
}

const ALL_TOKEN_COLORS: readonly TokenColor[] = [...COLORS, 'gold'];

export function totalTokens(t: Tokens): number {
  return ALL_TOKEN_COLORS.reduce((sum, k) => sum + t[k], 0);
}

/**
 * 引擎默认支付方案：优先花掉彩色令牌、减少金币消耗；
 * 无法支付时返回 null。
 */
export function defaultPayment(player: PlayerState, card: CardDef): Tokens | null {
  const def = deficitFor(card, player.bonuses);
  const pay = emptyTokens();
  let goldNeeded = 0;
  for (const c of COLORS) {
    const use = Math.min(def[c], player.tokens[c]);
    pay[c] = use;
    goldNeeded += def[c] - use;
  }
  if (goldNeeded > player.tokens.gold) return null;
  pay.gold = goldNeeded;
  return pay;
}

export function canAfford(player: PlayerState, card: CardDef): boolean {
  return defaultPayment(player, card) !== null;
}

/**
 * 校验显式支付方案（规则：不允许超额支付 / 无找零；金币恰好补足缺口）。
 * 返回错误信息；合法返回 null。
 */
export function validatePayment(player: PlayerState, card: CardDef, pay: Partial<Tokens>): string | null {
  const def = deficitFor(card, player.bonuses);
  for (const k of ALL_TOKEN_COLORS) {
    const v = pay[k] ?? 0;
    if (!Number.isInteger(v) || v < 0) return `支付数量非法：${k}=${v}`;
    if (v > player.tokens[k]) return `支付超过持有：${k}`;
  }
  let goldNeeded = 0;
  for (const c of COLORS) {
    const v = pay[c] ?? 0;
    if (v > def[c]) return `E_OVERPAY:${c}`;
    goldNeeded += def[c] - v;
  }
  const goldGiven = pay.gold ?? 0;
  if (goldGiven !== goldNeeded) return `E_GOLD_MISUSE:${goldNeeded}`;
  return null;
}

/** 把支付方案补全为完整 Tokens */
export function normalizePayment(pay: Partial<Tokens>): Tokens {
  return { ...emptyTokens(), ...pay };
}

export function tokensToArray(t: Tokens): { color: TokenColor; count: number }[] {
  return ALL_TOKEN_COLORS.filter((k) => t[k] > 0).map((k) => ({ color: k, count: t[k] }));
}

export function zeroDelta(): Tokens {
  return emptyTokens();
}

export function addTokens(target: Tokens, delta: Tokens, sign: 1 | -1): void {
  for (const k of ALL_TOKEN_COLORS) target[k] += sign * delta[k];
}

export function countColorTokens(t: Tokens, colors: readonly Color[]): number {
  return colors.reduce((n, c) => n + t[c], 0);
}
