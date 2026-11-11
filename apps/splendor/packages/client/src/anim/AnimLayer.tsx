import { cardById, nobleById } from '@splendor/engine';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { GEM_HEX, GemIcon } from '../ui/gems';
import { FLY_MS, HIGHLIGHT_MS, PULSE_MS, stepTotalMs } from './steps';
import type { QueuedAnim } from './types';
import { CardBack, CardView } from '../components/CardView';
import { NobleTile } from '../components/NobleTile';

/**
 * 操作动画层：每一步先"预备高亮"源组件（轻微放大 + 琥珀光圈），再沿弧线飞向目标，
 * 到达时目标位置有一次轻微脉冲。pointer-events: none，不干扰任何点击。
 * - 关闭「动效」时零开销；开发/自动化可用 window.__animLog 观察
 */

interface FlyerSpec {
  baseW: number;
  baseH: number;
  visual: React.ReactNode;
  /** 弧线偏移（负=向上） */
  arc: number;
  /** 高亮放大倍率 */
  pop: number;
}

/** 读取 CSS 变量像素值（如 --card-w → 126） */
function cssPx(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function specFor(step: QueuedAnim): FlyerSpec {
  switch (step.kind) {
    case 'gem':
    case 'gold': {
      const color = step.kind === 'gold' ? 'gold' : (step.color ?? 'white');
      return {
        baseW: 30,
        baseH: 30,
        arc: -52 + step.delay / 16,
        pop: 1.22,
        visual: (
          <span className="grid h-full w-full place-items-center rounded-full" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 3px 10px rgba(28,39,58,0.3)' }}>
            <GemIcon color={color} size={22} />
          </span>
        ),
      };
    }
    case 'gemReturn': {
      const color = step.color ?? 'white';
      return {
        baseW: 27,
        baseH: 27,
        arc: 46 - step.delay / 16,
        pop: 1.18,
        visual: (
          <span className="grid h-full w-full place-items-center rounded-full opacity-90" style={{ background: 'rgba(255,255,255,0.88)', boxShadow: '0 2px 8px rgba(28,39,58,0.24)' }}>
            <GemIcon color={color} size={19} />
          </span>
        ),
      };
    }
    case 'card': {
      const back = step.cardId == null || step.cardId < 0;
      const card = !back && step.cardId != null ? cardById(step.cardId) : null;
      // 从桌面大卡飞出时用大卡视觉（"组件放大"才说得通）；从牌堆/预定区飞出用迷你卡
      const big = step.from.w >= 80;
      const w = big ? cssPx('--card-w', 126) : cssPx('--mini-w', 40);
      const h = big ? cssPx('--card-h', 176) : cssPx('--mini-h', 56);
      return {
        baseW: w,
        baseH: h,
        arc: -42,
        pop: 1.1,
        visual: back ? (
          <CardBack className="drop-shadow-[0_8px_16px_rgba(28,39,58,0.32)]" />
        ) : card ? (
          <CardView card={card} size={big ? 'board' : 'mini'} className="drop-shadow-[0_8px_16px_rgba(28,39,58,0.32)]" />
        ) : null,
      };
    }
    case 'noble': {
      const noble = step.nobleId != null ? nobleById(step.nobleId) : null;
      const s = cssPx('--noble-s', 78);
      return {
        baseW: s,
        baseH: s,
        arc: -34,
        pop: 1.14,
        visual: noble ? (
          <div className="drop-shadow-[0_12px_20px_rgba(201,147,46,0.5)]">
            <NobleTile noble={noble} />
          </div>
        ) : null,
      };
    }
    default:
      return { baseW: 24, baseH: 24, arc: -30, pop: 1.1, visual: null };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function Flyer({ item, scale }: { item: QueuedAnim; scale: number }) {
  const { from, to } = item;
  const spec = useRef(specFor(item)).current;
  if (!spec.visual) return null;

  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const dx = to.x + to.w / 2 - cx;
  const dy = to.y + to.h / 2 - cy;
  const endScale = clamp(Math.min(to.w / spec.baseW, to.h / spec.baseH), 0.22, 1.4);

  // 时间轴：[0, tH] 高亮预备 → [tH, tFlyEnd] 飞行 → 尾帧留白给落点脉冲
  // 比例与速度档无关（同乘 scale），总时长按档位缩放
  const baseTotal = HIGHLIGHT_MS + FLY_MS + PULSE_MS;
  const total = stepTotalMs(scale);
  const tH = HIGHLIGHT_MS / baseTotal;
  const pPad = PULSE_MS / baseTotal;
  const tFlyEnd = 1 - pPad;
  const times = [0, tH, tH + (tFlyEnd - tH) * 0.5, tFlyEnd, 1];

  return (
    <>
      <motion.div
        data-anim-step={item.kind}
        data-anim-seat={item.seat}
        data-anim-phase="fly"
        data-anim-card={item.cardId != null && item.cardId < 0 ? 'back' : undefined}
        className="absolute"
        style={{ left: cx, top: cy, width: spec.baseW, height: spec.baseH, marginLeft: -spec.baseW / 2, marginTop: -spec.baseH / 2 }}
        initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
        animate={{
          x: [0, 0, dx * 0.5, dx, dx],
          y: [0, 0, spec.arc, dy, dy],
          scale: [1, spec.pop, spec.pop * 0.96, endScale, endScale],
          opacity: [0, 1, 1, 0.15, 0],
        }}
        transition={{ delay: item.delay / 1000, duration: total / 1000, times, ease: 'easeInOut' }}
      >
        {/* 预备高亮光圈 */}
        <motion.span
          className="pointer-events-none absolute -inset-2 rounded-2xl"
          style={{ boxShadow: '0 0 0 3px rgba(201,147,46,0.55), 0 0 22px 6px rgba(201,147,46,0.35)' }}
          animate={{ opacity: [0, 0.95, 0.35, 0] }}
          transition={{ delay: item.delay / 1000, duration: total / 1000, times: [0, tH * 0.7, tH, Math.min(0.99, tH + 0.12)], ease: 'easeOut' }}
        />
        {spec.visual}
      </motion.div>

      {/* 落点脉冲（到达目标位置的强调） */}
      <motion.span
        data-anim-phase="land"
        className="pointer-events-none absolute rounded-xl"
        style={{ left: to.x - 3, top: to.y - 3, width: to.w + 6, height: to.h + 6, border: '2px solid rgba(201,147,46,0.85)' }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: [0, 0, 0.9, 0], scale: [0.94, 0.94, 1.12, 1.3] }}
        transition={{ delay: item.delay / 1000, duration: total / 1000, times: [0, tFlyEnd - 0.02, tFlyEnd + 0.02, 1], ease: 'easeOut' }}
      />
    </>
  );
}

export function AnimLayer() {
  const queue = useGame((s) => s.animQueue);
  const clearAnim = useGame((s) => s.clearAnim);
  const animations = useGame((s) => s.settings.animations);
  const scale = useGame((s) => s.settings.animSpeed);
  const [items, setItems] = useState<QueuedAnim[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => {
    if (queue.length === 0) return;
    const log = ((window as unknown as { __animLog?: string[] }).__animLog ??= []);
    for (const q of queue) log.push(`${q.kind}:${q.seat}@${scale}x`);
    if (log.length > 120) log.splice(0, log.length - 120);
    setItems((prev) => [...prev, ...queue].slice(-14));
    // 用定时器兜底清理（不依赖动画完成回调：重渲染可能打断回调导致元素残留）
    const total = stepTotalMs(scale);
    for (const q of queue) {
      timers.current.push(
        setTimeout(() => {
          setItems((prev) => prev.filter((p) => p.id !== q.id));
        }, q.delay + total + 150),
      );
    }
    clearAnim();
  }, [queue, clearAnim, scale]);

  // 切换「动效」时清空在播元素
  useEffect(() => {
    if (!animations) {
      clearTimers();
      setItems([]);
    }
  }, [animations]);

  useEffect(() => clearTimers, []);

  if (!animations) return null;

  return (
    <div data-testid="anim-layer" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {items.map((item) => (
        <Flyer key={item.id} item={item} scale={scale} />
      ))}
    </div>
  );
}
