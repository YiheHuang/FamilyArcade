import { PIECES } from '../game/pieces';
import { t } from '../i18n';
import { drawPieceShape } from './board';
import { button, el } from './dom';
import type { AppCtx, Screen } from './screens';
import { INK, INK_FAINT, LINE, OK, PALETTE, withAlpha } from './theme';

const CELL = 20;
const PATCH = 3; // 3x3 cells per illustration

function mini(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  const c = el('canvas', 'guide-canvas');
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    draw(ctx);
  }
  return c;
}

/** a small grid patch the pieces live on */
function patch(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(ox, oy, PATCH * CELL, PATCH * CELL);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < PATCH; i++) {
    const p = Math.round(ox + i * CELL) + 0.5;
    ctx.moveTo(p, oy);
    ctx.lineTo(p, oy + PATCH * CELL);
    ctx.moveTo(ox, p - ox + oy);
    ctx.lineTo(ox + PATCH * CELL, p - ox + oy);
  }
  ctx.stroke();
}

function chevrons(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, band: number): void {
  const rp = r + band / 2;
  ctx.strokeStyle = withAlpha(INK_FAINT, 0.75);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, rp, 0, Math.PI * 2);
  ctx.stroke();
  const len = 6;
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tipX = cx + ca * rp;
    const tipY = cy + sa * rp;
    const tx = -sa;
    const ty = ca;
    const bx = tipX - tx * len;
    const by = tipY - ty * len;
    ctx.beginPath();
    ctx.moveTo(bx + ca * 4.8, by + sa * 4.8);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx - ca * 4.8, by - sa * 4.8);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ screens

export function renderGuide(ctx: AppCtx): Screen {
  const root = el('div', 'screen setup');
  const topbar = el('header', 'topbar');
  topbar.append(
    button('btn ghost', t('setup.back'), () => markSeen()),
    el('div', 'spacer'),
    el('h2', 'topbar-title', t('guide.title')),
    el('div', 'spacer'),
  );

  const body = el('div', 'setup-body guide-body');

  // --- three steps --------------------------------------------------------
  const steps: Array<{ title: string; body: string; canvas: HTMLCanvasElement }> = [
    {
      title: t('guide.step1.title'),
      body: t('guide.step1.body'),
      canvas: mini(150, 84, (c) => {
        // a tray swatch and a dashed drag to the board
        c.fillStyle = PALETTE[0];
        c.beginPath();
        c.roundRect(6, 32, 16, 16, 3);
        c.fill();
        c.strokeStyle = withAlpha(INK_FAINT, 0.8);
        c.setLineDash([3, 3]);
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(24, 40);
        c.quadraticCurveTo(40, 20, 56, 30);
        c.stroke();
        c.setLineDash([]);
        const ox = 52;
        const oy = 12;
        patch(c, ox, oy);
        drawPieceShape(c, 1, 1, CELL, ox + CELL, oy, {
          fill: withAlpha(PALETTE[0], 0.42),
          stroke: PALETTE[0],
          lineWidth: 1.6,
        });
      }),
    },
    {
      title: t('guide.step2.title'),
      body: t('guide.step2.body'),
      canvas: mini(150, 84, (c) => {
        const ox = 52;
        const oy = 12;
        patch(c, ox, oy);
        const piece = 3; // L3
        drawPieceShape(c, piece, 0, CELL, ox + CELL, oy + CELL, {
          fill: withAlpha(PALETTE[0], 0.5),
          stroke: OK,
          lineWidth: 2,
        });
        chevrons(c, ox + 1.5 * CELL, oy + 1.5 * CELL, 1.3 * CELL, 16);
      }),
    },
    {
      title: t('guide.step3.title'),
      body: t('guide.step3.body'),
      canvas: mini(150, 84, (c) => {
        const ox = 52;
        const oy = 12;
        patch(c, ox, oy);
        // S4 is three cells wide: start at the left edge so it stays inside
        // the 3x3 patch (it used to start one cell in and overflowed)
        drawPieceShape(c, 7, 0, CELL, ox, oy + CELL, {
          fill: withAlpha(PALETTE[0], 0.5),
          stroke: OK,
          lineWidth: 2,
        });
        // the cursor
        const cx = ox + 2.4 * CELL;
        const cy = oy + 2.1 * CELL;
        c.fillStyle = INK;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + 10, cy + 4);
        c.lineTo(cx + 4.5, cy + 5.5);
        c.lineTo(cx + 3, cy + 11);
        c.closePath();
        c.fill();
        // a little tick
        c.strokeStyle = OK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx + 12, cy - 8);
        c.lineTo(cx + 15, cy - 5);
        c.lineTo(cx + 21, cy - 12);
        c.stroke();
      }),
    },
  ];
  for (const s of steps) {
    const row = el('div', 'guide-step');
    row.append(s.canvas);
    const text = el('div', 'guide-step-text');
    text.append(el('div', 'guide-step-title', s.title), el('div', 'field-hint', s.body));
    row.appendChild(text);
    body.appendChild(row);
  }

  // --- rules --------------------------------------------------------------
  const rules = el('div', 'guide-rules');
  rules.appendChild(el('div', 'field-label', t('guide.rules.title')));
  for (let i = 1; i <= 5; i++) {
    rules.appendChild(el('div', 'guide-rule', `${i}. ${t(`guide.rules.${i}` as 'guide.rules.1')}`));
  }
  body.appendChild(rules);

  // --- the piece library --------------------------------------------------
  const pieces = el('div', 'guide-pieces');
  pieces.appendChild(el('div', 'field-label', t('guide.pieces.title')));
  const grid = el('div', 'guide-piece-grid');
  const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  for (const piece of PIECES) {
    const or = piece.orientations[0];
    const cs = 11;
    const c = el('canvas', 'guide-piece');
    c.style.width = `${or.w * cs}px`;
    c.style.height = `${or.h * cs}px`;
    c.width = Math.round(or.w * cs * dpr);
    c.height = Math.round(or.h * cs * dpr);
    c.title = piece.id;
    const cx = c.getContext('2d');
    if (cx) {
      cx.scale(dpr, dpr);
      drawPieceShape(cx, PIECES.indexOf(piece), 0, cs, 0, 0, {
        fill: withAlpha(piece.size === 1 ? INK : PALETTE[0], 0.55),
      });
    }
    grid.appendChild(c);
  }
  pieces.appendChild(grid);
  pieces.appendChild(el('div', 'field-hint', t('guide.pieces.sizes')));
  body.appendChild(pieces);

  const start = button('btn primary big', t('guide.close'), () => markSeen());
  const actions = el('div', 'setup-actions');
  actions.appendChild(start);

  root.append(topbar, body, actions);
  return { root };

  function markSeen(): void {
    try {
      localStorage.setItem('blokus.guide.seen', '1');
    } catch {
      /* ignore */
    }
    ctx.show(ctx.home());
  }
}

/** true when the player has never opened the guide */
export function guideSeen(): boolean {
  try {
    return localStorage.getItem('blokus.guide.seen') === '1';
  } catch {
    return true;
  }
}
