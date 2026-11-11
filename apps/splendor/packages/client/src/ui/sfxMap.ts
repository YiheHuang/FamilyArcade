import type { GameEvent } from '@splendor/engine';
import { playSfx, type SfxId } from './sfx';

export interface SfxEventContext {
  /** 真人座位（真人操作正常音量，AI 座位更轻） */
  humanSeats: Set<number>;
  /** 自己的座位（局域网=lan.you；本地=当前行动者） */
  mySeat: number | null;
  /** 本地热座：同一台电脑轮流操作，任何真人的回合切换都算"轮到你" */
  anyHumanTurn?: boolean;
}

/** 引擎事件 → 音效 id（纯函数，便于单测） */
export function mapEventToSfx(e: GameEvent, ctx: SfxEventContext): SfxId | null {
  /** 该事件对应的座位是否"在键盘前的人"（本地热座=任意真人；局域网=仅自己） */
  const mine = (seat: number): boolean => (ctx.anyHumanTurn ? ctx.humanSeats.has(seat) : seat === ctx.mySeat);
  switch (e.type) {
    case 'tokens-taken':
      return 'gemTake';
    case 'tokens-returned':
      return 'gemReturn';
    case 'card-bought':
      return 'buy';
    case 'card-reserved':
      return e.goldTaken ? 'reserveGold' : 'reserve';
    case 'noble-visit':
      return 'noble';
    case 'final-round':
      return 'finalRound';
    case 'turn-start':
      return mine(e.seat) ? 'yourTurn' : null;
    case 'discard-required':
    case 'noble-choice-required':
      return mine(e.seat) ? 'attention' : null;
    case 'game-end':
      return ctx.mySeat != null && e.winners.includes(ctx.mySeat) ? 'win' : 'lose';
    default:
      return null;
  }
}

/** 播放一组引擎事件对应的音效 */
export function sfxForEvents(events: GameEvent[], ctx: SfxEventContext): void {
  for (const e of events) {
    const id = mapEventToSfx(e, ctx);
    if (!id) continue;
    const soft = 'seat' in e && !ctx.humanSeats.has(e.seat);
    playSfx(id, { soft });
  }
}
