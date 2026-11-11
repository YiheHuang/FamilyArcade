import { PIECES } from '../game/pieces';
import type { Game } from '../game/engine';
import type { PlaceMove } from '../game/types';
import { drawMark } from './marks';
import { ACCENT, BAD, BOARD_BG, INK, INK_FAINT, LINE, OK, PALETTE, withAlpha } from './theme';

export interface GhostPreview {
  piece: number;
  o: number;
  x: number;
  y: number;
  valid: boolean;
  /** player index for coloring */
  player: number;
  /** ghost = still in hand; parked = waiting for confirmation */
  kind: 'ghost' | 'parked';
}

/** rotation ring drawn around the parked piece (canvas-relative px) */
export interface RingDraw {
  cx: number;
  cy: number;
  r: number;
  band: number;
  hover: boolean;
  active: boolean;
  /** arrow direction, 1 = clockwise */
  dir: 1 | -1;
}

/** someone else just placed a piece: soft outline + name chip */
export interface MoveHighlight {
  piece: number;
  o: number;
  x: number;
  y: number;
  player: number;
  label: string;
  /** 1 = fresh, 0 = gone */
  strength: number;
}

export interface BoardDrawState {
  game: Game;
  /** padded indices of legal anchor cells for the active piece */
  anchors: ReadonlySet<number> | null;
  ghost: GhostPreview | null;
  hint: PlaceMove | null;
  ring: RingDraw | null;
  /** fading highlight of another player's latest move */
  remote: MoveHighlight | null;
  /** 0..1 border shimmer when someone finished all pieces */
  celebrate: number;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** draw a piece as rounded cells at (left, top) with a given cell size */
export function drawPieceShape(
  ctx: CanvasRenderingContext2D,
  piece: number,
  o: number,
  cs: number,
  left: number,
  top: number,
  opts: {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    clip?: { w: number; h: number };
  },
): void {
  const or = PIECES[piece].orientations[o];
  const inset = Math.max(0.7, cs * 0.045);
  const radius = Math.max(2, cs * 0.16);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < or.cells.length; i += 2) {
    const x = left + or.cells[i] * cs;
    const y = top + or.cells[i + 1] * cs;
    const clip = opts.clip;
    if (clip && (x <= -cs || y <= -cs || x >= clip.w || y >= clip.h)) continue;
    xs.push(x);
    ys.push(y);
  }
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    for (let k = 0; k < xs.length; k++) {
      rr(ctx, xs[k] + inset, ys[k] + inset, cs - inset * 2, cs - inset * 2, radius);
      ctx.fill();
    }
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lineWidth ?? 1.5;
    for (let k = 0; k < xs.length; k++) {
      rr(ctx, xs[k] + inset, ys[k] + inset, cs - inset * 2, cs - inset * 2, radius);
      ctx.stroke();
    }
  }
}

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cs = 24;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
  }

  cellSize(): number {
    return this.cs;
  }

  /** size the canvas to `avail` css px; returns the used css size */
  layout(gameSize: number, avail: number): number {
    const cs = Math.max(10, Math.floor(avail / gameSize));
    this.cs = cs;
    this.dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const px = cs * gameSize;
    this.canvas.style.width = `${px}px`;
    this.canvas.style.height = `${px}px`;
    this.canvas.width = Math.round(px * this.dpr);
    this.canvas.height = Math.round(px * this.dpr);
    return px;
  }

  /** client coordinates -> board cell, or null when outside the grid */
  cellFromClient(clientX: number, clientY: number, game: Game): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / this.cs);
    const y = Math.floor((clientY - rect.top) / this.cs);
    if (x < 0 || y < 0 || x >= game.size || y >= game.size) return null;
    return { x, y };
  }

  cellFromEvent(ev: { clientX: number; clientY: number }, game: Game): { x: number; y: number } | null {
    return this.cellFromClient(ev.clientX, ev.clientY, game);
  }

  draw(s: BoardDrawState): void {
    const { game } = s;
    const ctx = this.ctx;
    const cs = this.cs;
    const size = game.size;
    const stride = game.stride;
    const px = cs * size;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, px, px);

    // --- placed cells
    const inset = Math.max(0.7, cs * 0.045);
    const radius = Math.max(2, cs * 0.16);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = game.at(x, y);
        if (v === 0 || v >= 15) continue;
        ctx.fillStyle = PALETTE[v - 1];
        rr(ctx, x * cs + inset, y * cs + inset, cs - inset * 2, cs - inset * 2, radius);
        ctx.fill();
        // color-blind double coding: a per-player mark in every cell
        drawMark(ctx, v - 1, x * cs + cs / 2, y * cs + cs / 2, cs * 0.16);
      }
    }

    // --- grid
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < size; i++) {
      const p = Math.round(i * cs) + 0.5;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, px);
      ctx.moveTo(0, p);
      ctx.lineTo(px, p);
    }
    ctx.stroke();

    // --- last move outline
    const last = game.history[game.history.length - 1];
    if (last && last.kind === 'place') {
      const or = PIECES[last.piece].orientations[last.o];
      ctx.strokeStyle = withAlpha(INK, 0.38);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < or.cells.length; i += 2) {
        const cx = (last.x + or.cells[i]) * cs;
        const cy = (last.y + or.cells[i + 1]) * cs;
        rr(ctx, cx + 1.2, cy + 1.2, cs - 2.4, cs - 2.4, radius * 0.8);
        ctx.stroke();
      }
    }

    // --- legal anchors
    if (s.anchors && s.anchors.size > 0) {
      ctx.fillStyle = withAlpha(INK_FAINT, 0.6);
      const r = Math.max(1.4, cs * 0.075);
      for (const idx of s.anchors) {
        const x = (idx % stride) - 2;
        const y = Math.floor(idx / stride) - 2;
        ctx.beginPath();
        ctx.arc(x * cs + cs / 2, y * cs + cs / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- hint (dashed)
    if (s.hint) {
      const h = s.hint;
      const or = PIECES[h.piece].orientations[h.o];
      for (let i = 0; i < or.cells.length; i += 2) {
        const cx = (h.x + or.cells[i]) * cs;
        const cy = (h.y + or.cells[i + 1]) * cs;
        if (cx < -cs || cy < -cs || cx > px || cy > px) continue;
        ctx.fillStyle = withAlpha(PALETTE[h.p], 0.26);
        rr(ctx, cx + inset, cy + inset, cs - inset * 2, cs - inset * 2, radius);
        ctx.fill();
      }
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < or.cells.length; i += 2) {
        const cx = (h.x + or.cells[i]) * cs;
        const cy = (h.y + or.cells[i + 1]) * cs;
        if (cx < -cs || cy < -cs || cx > px || cy > px) continue;
        rr(ctx, cx + inset, cy + inset, cs - inset * 2, cs - inset * 2, radius);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // --- ghost / parked preview
    if (s.ghost) {
      const g = s.ghost;
      const parked = g.kind === 'parked';
      const left = g.x * cs;
      const top = g.y * cs;
      const fill = g.valid
        ? withAlpha(PALETTE[g.player], parked ? 0.5 : 0.42)
        : withAlpha(BAD, parked ? 0.18 : 0.2);
      const stroke = parked ? (g.valid ? OK : BAD) : g.valid ? PALETTE[g.player] : BAD;
      drawPieceShape(ctx, g.piece, g.o, cs, left, top, {
        fill,
        stroke,
        lineWidth: parked ? 2 : 1.5,
        clip: { w: px, h: px },
      });
      // keep the double coding visible on the parked preview as well
      if (parked) {
        const or = PIECES[g.piece].orientations[g.o];
        for (let i = 0; i < or.cells.length; i += 2) {
          const cx = (g.x + or.cells[i]) * cs + cs / 2;
          const cy = (g.y + or.cells[i + 1]) * cs + cs / 2;
          if (cx < 0 || cy < 0 || cx > px || cy > px) continue;
          drawMark(ctx, g.player, cx, cy, cs * 0.16);
        }
      }
    }

    // --- remote move highlight (fades out)
    if (s.remote && s.remote.strength > 0.02) {
      const h = s.remote;
      const or = PIECES[h.piece].orientations[h.o];
      const strength = Math.min(1, h.strength);
      ctx.strokeStyle = withAlpha(INK, 0.62 * strength);
      ctx.lineWidth = 1.6 + 1.6 * strength;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < or.cells.length; i += 2) {
        const cx = (h.x + or.cells[i]) * cs;
        const cy = (h.y + or.cells[i + 1]) * cs;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        if (cx < -cs || cy < -cs || cx > px || cy > px) continue;
        rr(ctx, cx + 1, cy + 1, cs - 2, cs - 2, radius * 0.85);
        ctx.stroke();
      }
      // name chip above the move
      if (h.label && minX < Infinity) {
        const chipCx = (minX + maxX + cs) / 2;
        const chipCy = Math.max(16, minY - 12);
        ctx.font = '11px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(h.label).width + 14;
        ctx.fillStyle = withAlpha(BOARD_BG, 0.92 * strength);
        rr(ctx, chipCx - w / 2, chipCy - 9, w, 18, 9);
        ctx.fill();
        ctx.strokeStyle = withAlpha(INK, 0.22 * strength);
        ctx.lineWidth = 1;
        rr(ctx, chipCx - w / 2, chipCy - 9, w, 18, 9);
        ctx.stroke();
        ctx.fillStyle = withAlpha(INK, 0.85 * strength);
        ctx.fillText(h.label, chipCx, chipCy + 0.5);
      }
    }

    // --- rotation ring (topmost)
    if (s.ring) {
      this.drawRing(s.ring);
    }

    // --- celebration shimmer
    if (s.celebrate > 0.02) {
      ctx.strokeStyle = withAlpha(ACCENT, 0.55 * Math.min(1, s.celebrate));
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, px - 3, px - 3);
    }
  }

  /** the grab ring with tangential chevrons */
  private drawRing(ring: RingDraw): void {
    const ctx = this.ctx;
    const rp = ring.r + ring.band / 2;
    const color = ring.active ? INK : ring.hover ? withAlpha(INK, 0.8) : withAlpha(INK_FAINT, 0.62);
    ctx.strokeStyle = color;
    ctx.lineWidth = ring.active ? 2 : 1.6;
    ctx.beginPath();
    ctx.arc(ring.cx, ring.cy, rp, 0, Math.PI * 2);
    ctx.stroke();

    const len = Math.max(6, ring.band * 0.38);
    const half = len * 0.8;
    for (let k = 0; k < 4; k++) {
      const a = (Math.PI / 2) * k - Math.PI / 2; // left / top / right / bottom
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tipX = ring.cx + ca * rp;
      const tipY = ring.cy + sa * rp;
      // tangent direction (screen coords, y down): +dir = clockwise
      const tx = -sa * ring.dir;
      const ty = ca * ring.dir;
      const backX = tipX - tx * len;
      const backY = tipY - ty * len;
      ctx.beginPath();
      ctx.moveTo(backX + ca * half, backY + sa * half);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(backX - ca * half, backY - sa * half);
      ctx.stroke();
    }
  }
}
