import { INK, withAlpha } from './theme';

/**
 * Color-blind double coding: every player gets its own small mark drawn
 * inside each cell, on top of the player colour. Four shapes are easy to
 * tell apart at any size and stay subtle enough for the minimal look.
 */
export type MarkKind = 'dot' | 'plus' | 'ring' | 'slash';

export const PLAYER_MARKS: readonly MarkKind[] = ['dot', 'plus', 'ring', 'slash'];

export function markKind(player: number): MarkKind {
  return PLAYER_MARKS[player % PLAYER_MARKS.length];
}

/**
 * Draw the mark for `player` centred at (cx, cy).
 * `size` is the half-extent of the mark's footprint in css px.
 */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  player: number,
  cx: number,
  cy: number,
  size: number,
  color: string = withAlpha(INK, 0.34),
): void {
  const kind = markKind(player);
  const s = Math.max(1.6, size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.1, s * 0.4);
  ctx.beginPath();
  switch (kind) {
    case 'dot':
      ctx.arc(cx, cy, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'plus':
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx + s, cy);
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx, cy + s);
      ctx.stroke();
      break;
    case 'ring':
      ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'slash':
      ctx.moveTo(cx - s * 0.66, cy + s * 0.66);
      ctx.lineTo(cx + s * 0.66, cy - s * 0.66);
      ctx.stroke();
      break;
  }
}
