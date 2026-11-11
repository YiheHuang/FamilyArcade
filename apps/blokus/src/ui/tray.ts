import { PIECES } from '../game/pieces';
import { el } from './dom';
import { drawMark } from './marks';
import { PALETTE } from './theme';

/** tray cell size in css px — also used for grab-cell hit testing */
export const TRAY_CELL = 16;
/** larger cells for touch screens */
export const TRAY_CELL_TOUCH = 22;

function trayCellSize(): number {
  return window.innerWidth <= 720 ? TRAY_CELL_TOUCH : TRAY_CELL;
}

/**
 * Remaining-piece tray. Rebuilds only when the remaining mask changes;
 * selection / playability are CSS classes.
 */
export class PieceTray {
  readonly root: HTMLElement;
  onSelect: ((piece: number) => void) | null = null;
  /** press-and-hold starts a drag; `grab` is the grabbed cell of the piece */
  onDown: ((piece: number, grab: [number, number], ev: PointerEvent) => void) | null = null;

  private buttons = new Map<number, HTMLButtonElement>();
  private lastMask = -1;
  private lastPlayer = -1;
  private lastCell = 0;
  private playable: Set<number> | null = null;

  constructor() {
    this.root = el('div', 'piece-tray');
    this.root.setAttribute('role', 'listbox');
    // when the window crosses the phone breakpoint the cell size changes:
    // force a rebuild on the next sync
    window.addEventListener('resize', () => {
      if (trayCellSize() !== this.lastCell) this.lastMask = -1;
    });
  }

  sync(remainingMask: number, player: number, selected: number | null, playable: Set<number> | null): void {
    if (remainingMask !== this.lastMask || player !== this.lastPlayer) {
      this.rebuild(remainingMask, player);
    }
    this.playable = playable;
    for (const [piece, btn] of this.buttons) {
      btn.classList.toggle('is-selected', piece === selected);
      btn.classList.toggle('is-dimmed', playable !== null && !playable.has(piece));
    }
  }

  private rebuild(mask: number, player: number): void {
    this.lastMask = mask;
    this.lastPlayer = player;
    this.buttons.clear();
    this.root.replaceChildren();
    const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    // bigger cells on phones: fingers need a comfortable target
    const cs = trayCellSize();
    this.lastCell = cs;
    for (let i = 0; i < PIECES.length; i++) {
      if (((mask >>> i) & 1) === 0) continue;
      const piece = PIECES[i];
      const or = piece.orientations[0];
      const btn = el('button', 'tray-piece');
      btn.type = 'button';
      btn.dataset.piece = String(i);
      btn.setAttribute('aria-label', piece.id);
      const canvas = el('canvas');
      canvas.style.width = `${or.w * cs}px`;
      canvas.style.height = `${or.h * cs}px`;
      canvas.width = Math.round(or.w * cs * dpr);
      canvas.height = Math.round(or.h * cs * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = PALETTE[player];
        const r = 2.5;
        const inset = 0.8;
        for (let k = 0; k < or.cells.length; k += 2) {
          const x = or.cells[k] * cs + inset;
          const y = or.cells[k + 1] * cs + inset;
          const w = cs - inset * 2;
          ctx.beginPath();
          ctx.roundRect?.(x, y, w, w, r);
          if (!ctx.roundRect) ctx.rect(x, y, w, w);
          ctx.fill();
          drawMark(ctx, player, x + w / 2, y + w / 2, cs * 0.17);
        }
      }
      btn.appendChild(canvas);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const gx = Math.min(Math.max(Math.floor((ev.clientX - rect.left) / cs), 0), or.w - 1);
        const gy = Math.min(Math.max(Math.floor((ev.clientY - rect.top) / cs), 0), or.h - 1);
        this.onDown?.(i, [gx, gy], ev);
        if (ev.pointerType !== 'touch') ev.preventDefault();
      });
      btn.addEventListener('click', () => this.onSelect?.(i));
      this.buttons.set(i, btn);
      this.root.appendChild(btn);
    }
  }
}
