import { useEffect, useRef, useState } from 'react';
import { useGame } from './store';
import { playSfx } from './ui/sfx';
import { T } from './i18n';

/**
 * 回合读秒：纯提示（超时只变色提示，不做任何强制/代打）。
 * 本文件上半部分是可直接单测的纯函数，下半部分是 React hook。
 */

export const TURN_LIMITS = [0, 30, 45, 60, 90] as const;
export type TurnLimit = (typeof TURN_LIMITS)[number];
export type ClockUrgency = 'normal' | 'warn' | 'danger' | 'over';

/** 档位文案：0 = 不限 */
export function limitLabel(sec: number): string {
  return sec > 0 ? T.game.turnOn(sec) : T.menu.turnTimeNone;
}

export function isValidLimit(sec: number): boolean {
  return (TURN_LIMITS as readonly number[]).includes(sec);
}

/** 紧急度：≤10 秒琥珀、≤5 秒红色、归零后为超时 */
export function urgencyOf(secondsLeft: number): ClockUrgency {
  if (secondsLeft <= 0) return 'over';
  if (secondsLeft <= 5) return 'danger';
  if (secondsLeft <= 10) return 'warn';
  return 'normal';
}

/** 显示用整数秒：剩余向上取整；超时后至少显示 +1 秒并持续正计时 */
export function displaySeconds(secondsLeft: number): number {
  if (secondsLeft > 0) return Math.ceil(secondsLeft);
  return -Math.max(1, Math.ceil(-secondsLeft));
}

export function formatRemaining(display: number): string {
  return display > 0 ? T.game.turnOn(display) : T.game.overtime(Math.abs(display));
}

/** 剩余比例（用于细进度条；超时后为 0） */
export function ratioOf(secondsLeft: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(0, Math.min(1, secondsLeft / limit));
}

/** 由倒计时展示状态计算紧急度样式类 */
export function urgencyClass(u: ClockUrgency): string {
  switch (u) {
    case 'warn':
      return 'text-accent-700';
    case 'danger':
      return 'text-[color:var(--color-danger-500)] clock-pulse';
    case 'over':
      return 'text-[color:var(--color-danger-500)]';
    default:
      return 'text-ink-500';
  }
}

export interface TurnClockView {
  /** 是否显示读秒（有时限 + 当前是真人 + 对局进行中） */
  active: boolean;
  /** 显示的整数秒（负数 = 已超时） */
  display: number;
  urgency: ClockUrgency;
  ratio: number;
  /** 当前被计时的座位 */
  seat: number | null;
  /** 是否轮到自己 */
  isMe: boolean;
}

const IDLE: TurnClockView = { active: false, display: 0, urgency: 'normal', ratio: 1, seat: null, isMe: false };

/** 当前回合的读秒视图（本地=本地截止时刻；局域网=服务器时钟推送 + 本地平滑） */
export function useTurnClock(): TurnClockView {
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.mode);
  const lan = useGame((s) => s.lan);
  const limit = useGame((s) => s.turnLimitSec);
  const deadline = useGame((s) => s.turnDeadline);
  const lanClock = useGame((s) => s.lanClock);
  const [, forceTick] = useState(0);

  const seat = view?.current ?? null;
  const humanPromise =
    !!view &&
    view.phase !== 'ended' &&
    (mode === 'lan'
      ? (lan?.seats[seat ?? -1]?.kind ?? 'human') !== 'ai' && !lan?.spectator
      : view.players[seat ?? -1]?.kind === 'human');
  const active = limit > 0 && seat != null && humanPromise;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [active]);

  if (!active || seat == null) return IDLE;

  let secondsLeft: number | null = null;
  if (mode === 'lan') {
    if (lanClock && lanClock.seat === seat) {
      const since = (Date.now() - lanClock.at) / 1000;
      secondsLeft = lanClock.over > 0 ? -(lanClock.over + since) : lanClock.remaining - since;
    } else {
      // 等服务器第一帧时钟推送前先按满额显示，避免闪跳
      secondsLeft = limit;
    }
  } else if (deadline != null) {
    secondsLeft = (deadline - Date.now()) / 1000;
  } else {
    return IDLE;
  }

  const display = displaySeconds(secondsLeft);
  return {
    active: true,
    display,
    urgency: urgencyOf(display),
    ratio: ratioOf(secondsLeft, limit),
    seat,
    isMe: mode === 'lan' ? lan?.you === seat : true,
  };
}

/**
 * 读秒音效：最后 5 秒每秒一声滴答（只给当前行动者）；
 * 归零时一声提示（自己听得重一些，其他座位轻一些）。
 */
export function useClockSfx(clock: TurnClockView): void {
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    const display = clock.active ? clock.display : null;
    const prev = lastRef.current;
    lastRef.current = display;
    if (display == null || prev == null || display === prev) return;
    if (display > 0 && display <= 5 && clock.isMe) playSfx('tick');
    if (display <= 0 && prev > 0) playSfx('timeout', { soft: !clock.isMe });
  }, [clock.active, clock.display, clock.isMe]);
}
