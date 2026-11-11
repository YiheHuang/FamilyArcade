import { COLORS, type Color, type GameEvent, type Tier, type Tokens } from '@splendor/engine';

/**
 * 操作动画的步骤推导（纯函数，便于单测）。
 * 输入引擎事件流，输出"飞行步骤"：从哪飞到哪、显示什么、何时开始。
 */

export type AnimKind = 'gem' | 'gold' | 'gemReturn' | 'card' | 'noble';

export interface AnimStep {
  /** 步骤 id（全局递增，用作 React key） */
  id: number;
  kind: AnimKind;
  /** 行动玩家座位 */
  seat: number;
  /** 宝石颜色（gem / gemReturn）；gold 表示金币 */
  color?: Color | 'gold';
  /** 卡牌 id；-1 表示对他人保密的盲抽（显示卡背） */
  cardId?: number;
  /** 卡牌档位（盲抽时决定从哪个牌堆飞出） */
  tier?: Tier;
  /** 卡片去向：买到 → 加成行；预定 → 预定区 */
  dest?: 'bonus' | 'reserved';
  /** 贵族 id */
  nobleId?: number;
  /** 同批内的错峰延迟（ms） */
  delay: number;
}

/** 动画节奏（基准 = 标准 1x；实际时长乘以「动效速度」档位 scale） */
export const HIGHLIGHT_MS = 260;
export const FLY_MS = 680;
export const STAGGER_MS = 180;
/** 落点脉冲时长（到达目标位置的强调） */
export const PULSE_MS = 220;
/** 单步总时长（高亮 + 飞行 + 落点脉冲，未乘速度档） */
export const STEP_BASE_MS = HIGHLIGHT_MS + FLY_MS + PULSE_MS;
/** 动效速度档：1=标准、2=慢、3=更慢（默认） */
export const ANIM_SPEEDS = [1, 2, 3] as const;
export type AnimSpeed = (typeof ANIM_SPEEDS)[number];

/** 按速度档换算单步时长 */
export function stepTotalMs(scale: number): number {
  return STEP_BASE_MS * scale;
}

/** 按速度档换算错峰间隔 */
export function staggerMs(scale: number): number {
  return STAGGER_MS * scale;
}
/** 单批最多播多少步（防极端情况下刷屏） */
const MAX_STEPS = 12;

/** 依次列出有数量的宝石（五色在前、金币最后） */
function tokensWithGold(t: Tokens): Array<{ color: Color | 'gold'; count: number }> {
  const out: Array<{ color: Color | 'gold'; count: number }> = [];
  for (const c of COLORS) {
    if (t[c] > 0) out.push({ color: c, count: t[c] });
  }
  if (t.gold > 0) out.push({ color: 'gold', count: t.gold });
  return out;
}

export function stepsFromEvents(events: GameEvent[], startId = 1, scale = 1): AnimStep[] {
  const steps: AnimStep[] = [];
  const stagger = staggerMs(scale);
  let delay = 0;
  const push = (step: Omit<AnimStep, 'id' | 'delay'>): void => {
    if (steps.length >= MAX_STEPS) return;
    steps.push({ ...step, id: startId + steps.length, delay });
    delay += stagger;
  };

  for (const e of events) {
    switch (e.type) {
      case 'tokens-taken': {
        for (const { color } of tokensWithGold(e.tokens)) {
          push(color === 'gold' ? { kind: 'gold', seat: e.seat } : { kind: 'gem', seat: e.seat, color });
        }
        break;
      }
      case 'tokens-returned': {
        for (const { color } of tokensWithGold(e.tokens)) {
          push({ kind: 'gemReturn', seat: e.seat, color });
        }
        break;
      }
      case 'card-bought':
        push({ kind: 'card', seat: e.seat, cardId: e.cardId, dest: 'bonus' });
        break;
      case 'card-reserved': {
        push({ kind: 'card', seat: e.seat, cardId: e.cardId, tier: e.tier, dest: 'reserved' });
        // 金币跟在卡后飞入
        if (e.goldTaken) push({ kind: 'gold', seat: e.seat });
        break;
      }
      case 'noble-visit':
        push({ kind: 'noble', seat: e.seat, nobleId: e.nobleId });
        break;
      default:
        break;
    }
  }
  return steps;
}
