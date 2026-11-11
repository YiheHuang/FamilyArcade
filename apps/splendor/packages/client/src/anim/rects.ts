import type { AnimStep } from './steps';

/**
 * 动画坐标解析：把每一步映射成"起点 → 终点"的屏幕矩形。
 * 关键：必须在状态更新导致 DOM 变化之前调用（元素还在原位）。
 * 拿不到坐标的步骤会被静默跳过，绝不阻塞操作。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RectPair {
  from: Rect;
  to: Rect;
}

function rectOf(selector: string): Rect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function firstRect(...selectors: string[]): Rect | null {
  for (const s of selectors) {
    if (!s) continue;
    const r = rectOf(s);
    if (r) return r;
  }
  return null;
}

const pile = (color: string): string => `[data-testid="gem-pile"][data-gem="${color}"]`;
const panel = (seat: number, part: string): string => `[data-testid="panel-${part}-${seat}"]`;

/** 解析一步动画的起点/终点 */
export function resolveRects(step: AnimStep): RectPair | null {
  let from: Rect | null = null;
  let to: Rect | null = null;

  switch (step.kind) {
    case 'gem': {
      from = rectOf(pile(step.color ?? 'white'));
      to = firstRect(panel(step.seat, 'tokens'), panel(step.seat, 'panel'));
      break;
    }
    case 'gold': {
      from = rectOf(pile('gold'));
      to = firstRect(panel(step.seat, 'tokens'), panel(step.seat, 'panel'));
      break;
    }
    case 'gemReturn': {
      from = firstRect(`[data-testid="panel-token-${step.seat}-${step.color}"]`, panel(step.seat, 'tokens'));
      to = rectOf(pile(step.color ?? 'white'));
      break;
    }
    case 'card': {
      // 从桌面明牌 / 牌堆顶 / 自己预定区飞出（依赖卡牌元素上的 data-card-id）
      from = firstRect(
        step.cardId != null && step.cardId >= 0 ? `[data-testid="board-card"][data-card-id="${step.cardId}"]` : '',
        step.tier != null ? `[data-testid="deck-stack-${step.tier}"]` : '',
        `[data-testid="reserved-mini"][data-card-id="${step.cardId ?? -1}"]`,
      );
      to = step.dest === 'bonus' ? firstRect(panel(step.seat, 'bonuses'), panel(step.seat, 'panel')) : firstRect(panel(step.seat, 'reserved'), panel(step.seat, 'panel'));
      break;
    }
    case 'noble': {
      from = rectOf(`[data-testid="noble-tile"][data-noble="${step.nobleId ?? -1}"]`);
      to = firstRect(panel(step.seat, 'nobles'), panel(step.seat, 'panel'));
      break;
    }
    default:
      return null;
  }

  if (!from || !to) return null;
  return { from, to };
}
