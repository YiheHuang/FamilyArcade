import type { Game } from '../game/engine';
import { ORI_MAPS, PIECES } from '../game/pieces';
import type { PlaceMove } from '../game/types';
import { BoardView, drawPieceShape, type GhostPreview } from './board';
import { button, el, toast } from './dom';
import { cycleSoundMode, playCelebrate, playEnd, playInvalid, playPlace, playTurn } from '../sound';
import { t } from '../i18n';
import { clampIntoPiece, transformCell, transformOrientation, type TransformKind } from './orient';
import { computeRing, inRing, ringSteps, type RingGeometry } from './ring';
import { PieceTray } from './tray';
import { cornersFor } from '../game/variants';
import { PALETTE, withAlpha } from './theme';

/** touch: two-finger rotation uses a finer step than the mouse ring */
const TOUCH_STEP_ANGLE = Math.PI / 4;
/** right-button drag distance that counts as "flip" */
const RIGHT_FLIP_DISTANCE = 24;

export interface SeatInfo {
  name: string;
  kind: 'human' | 'ai' | 'remote';
  connected?: boolean;
}

export interface GameScreenSync {
  game: Game;
  seats: SeatInfo[];
  /** seats controlled from this device */
  localSeats: number[];
  canAct: boolean;
  mustPass: boolean;
  thinking: boolean;
  hint: PlaceMove | null;
  hintAvailable: boolean;
  undoAvailable: boolean;
  status: string | null;
  rematchAvailable: boolean;
  /** LAN social affordances (null outside LAN games) */
  social: { canUndoRequest: boolean; canPause: boolean; canNudge: boolean } | null;
  /** the table is paused (host or a pending vote) */
  paused: boolean;
}

export interface GameScreenIntents {
  place(m: PlaceMove): boolean;
  pass(): void;
  hint(): void;
  undo(): void;
  exit(): void;
  rematch(): void;
  replay(): void;
  /** LAN social actions */
  undoRequest(): void;
  togglePause(): void;
  nudge(): void;
}

/** fast membership test for legal moves of one piece */
interface MoveIndex {
  keys: Set<string>;
  anchors: Set<number>;
  piece: number;
  seat: number;
}

/** a piece held under the pointer */
interface DragInfo {
  piece: number;
  o: number;
  grab: [number, number];
  px: number;
  py: number;
  startPx: number;
  startPy: number;
  snapped: { x: number; y: number } | null;
  /** if the drag resumed from a parked piece, where to fall back to */
  fromParked: { x: number; y: number } | null;
  moved: boolean;
  pointerId: number;
}

/** a piece waiting for confirmation on the board */
interface ParkedInfo {
  piece: number;
  o: number;
  x: number;
  y: number;
}

interface ReGrabInfo {
  grab: [number, number];
  pointerId: number;
  startX: number;
  startY: number;
}

const MOVE_THRESHOLD = 6; // px before a press counts as a drag

export class GameScreen {
  readonly root: HTMLElement;
  private readonly intents: GameScreenIntents;

  private readonly board = new BoardView();
  private readonly tray = new PieceTray();
  private readonly boardWrap: HTMLElement;
  private readonly turnChip: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly scoreList: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly overlayCard: HTMLElement;
  private readonly btnRotate: HTMLButtonElement;
  private readonly btnFlip: HTMLButtonElement;
  private readonly btnHint: HTMLButtonElement;
  private readonly btnUndo: HTMLButtonElement;
  private readonly btnPass: HTMLButtonElement;
  private readonly btnUndoReq: HTMLButtonElement;
  private readonly btnPause: HTMLButtonElement;
  private readonly btnNudge: HTMLButtonElement;
  private readonly socialRow: HTMLElement;
  private readonly pauseBanner: HTMLElement;
  private readonly dragLayer: HTMLCanvasElement;
  private readonly dragCtx: CanvasRenderingContext2D | null;

  private state: GameScreenSync | null = null;
  /** piece chosen with a plain click (still in the tray) */
  private selected: number | null = null;
  private selO = 0;
  private hover: { x: number; y: number } | null = null;
  private drag: DragInfo | null = null;
  private parked: ParkedInfo | null = null;
  private reGrab: ReGrabInfo | null = null;
  private twoFinger: { lastAngle: number; accum: number } | null = null;
  /** dragging along the parked piece's rotation ring */
  private ringDrag: { geom: RingGeometry; lastAngle: number; accum: number; pointerId: number } | null = null;
  private ringHover = false;
  private ringDir: 1 | -1 = 1;
  /** right button held while a piece is active: tap or drag = flip once */
  private rightPress: { x: number; y: number; flipped: boolean; pointerId: number } | null = null;
  /** touch: a finger resting on a tray piece — vertical pull picks it up */
  private pendingTray: { piece: number; grab: [number, number]; x: number; y: number; pointerId: number } | null =
    null;
  private readonly boardPointers = new Map<number, { x: number; y: number }>();
  /** the click that follows a drag/rotate interaction must not act */
  private suppressBoardClick = false;
  /** a press that may become a tap (confirm / park the selected piece) */
  private tapStart: { x: number; y: number; pointerId: number } | null = null;
  /** the current press already belongs to a drag / ring / rotation */
  private tapConsumed = false;
  private moveIndex: MoveIndex | null = null;
  private playableCache: { key: string; set: Set<number> } | null = null;
  private lastWheelAt = 0;
  private invalidToastAt = 0;
  /** another seat's latest move, highlighted while it fades */
  private remote: { piece: number; o: number; x: number; y: number; player: number; label: string; start: number } | null =
    null;
  private celebrateStart: number | null = null;
  private animHandle: number | null = null;
  /** last observed game signature (history / turn / over / remaining) */
  private prevSig: { history: number; turn: number; over: boolean; remaining: number[] } | null = null;
  private resizeObserver: ResizeObserver;

  // bound listeners (for removal)
  private readonly onWinMove: (ev: PointerEvent) => void;
  private readonly onWinUp: (ev: PointerEvent) => void;
  private readonly onWinCancel: (ev: PointerEvent) => void;
  private readonly onWinKey: (ev: KeyboardEvent) => void;
  private readonly onWinWheel: (ev: WheelEvent) => void;
  private readonly onWinContext: (ev: MouseEvent) => void;

  constructor(intents: GameScreenIntents) {
    this.intents = intents;
    this.root = el('div', 'screen game');

    // header
    const header = el('header', 'game-header');
    const btnExit = button('btn ghost', t('game.quit'), () => this.requestExit());
    this.turnChip = el('div', 'turn-chip');
    this.statusEl = el('div', 'status-line');
    const spacer = el('div', 'spacer');
    header.append(btnExit, this.turnChip, spacer, this.statusEl);

    // body
    const body = el('div', 'game-body');
    this.boardWrap = el('div', 'board-wrap');
    this.boardWrap.appendChild(this.board.canvas);
    const side = el('aside', 'side');

    this.scoreList = el('div', 'score-list');
    const trayLabel = el('div', 'tray-label', t('game.tray'));
    this.tray.root.classList.add('tray');
    this.actions = el('div', 'actions');

    this.btnRotate = button('btn small', t('game.rotate'), () => this.rotateActive(1));
    this.btnFlip = button('btn small', t('game.flip'), () => this.flipActive());
    this.btnHint = button('btn small', t('game.hint'), () => this.intents.hint());
    this.btnUndo = button('btn small', t('game.undo'), () => this.intents.undo());
    this.btnPass = button('btn small danger', t('game.pass'), () => this.intents.pass());
    this.btnUndoReq = button('btn small', t('game.undoRequest'), () => this.intents.undoRequest());
    this.btnPause = button('btn small', t('game.pause'), () => this.intents.togglePause());
    this.btnNudge = button('btn small', t('game.nudge'), () => this.intents.nudge());
    const actionRow1 = el('div', 'action-row');
    actionRow1.append(this.btnRotate, this.btnFlip);
    const actionRow2 = el('div', 'action-row');
    actionRow2.append(this.btnHint, this.btnUndo);
    this.socialRow = el('div', 'action-row social');
    this.socialRow.append(this.btnUndoReq, this.btnPause, this.btnNudge);
    this.actions.append(actionRow1, actionRow2, this.socialRow, this.btnPass);

    const opsHint = el('div', 'ops-hint', t('game.ops'));
    side.append(this.scoreList, trayLabel, this.tray.root, opsHint, this.actions);
    body.append(this.boardWrap, side);

    // floating layer for the piece following the cursor outside the board
    this.dragLayer = el('canvas', 'drag-layer');
    this.dragCtx = this.dragLayer.getContext('2d');
    this.root.appendChild(this.dragLayer);

    // overlay
    this.overlay = el('div', 'overlay hidden');
    this.overlayCard = el('div', 'overlay-card');
    this.overlay.appendChild(this.overlayCard);

    this.pauseBanner = el('div', 'pause-banner hidden', t('game.paused'));

    this.root.append(header, body, this.overlay, this.pauseBanner);

    // ---- interactions
    this.tray.onDown = (piece, grab, ev) => {
      if (ev.pointerType === 'touch') {
        // touch: the tray is a horizontal scroll strip, so a piece is picked
        // up by pulling it out vertically (handled in handleWindowMove)
        this.pendingTray = {
          piece,
          grab,
          x: ev.clientX,
          y: ev.clientY,
          pointerId: ev.pointerId,
        };
        return;
      }
      this.beginDragFromTray(piece, grab, ev);
    };
    this.tray.onSelect = (piece) => {
      if (this.drag || this.reGrab) return; // a drag just happened
      this.selectPiece(piece);
    };
    const canvas = this.board.canvas;
    canvas.addEventListener('pointerdown', (ev) => this.onBoardPointerDown(ev));
    canvas.addEventListener('pointermove', (ev) => this.onBoardPointerMove(ev));
    canvas.addEventListener('pointerleave', () => {
      if (this.hover) {
        this.hover = null;
        this.repaint();
      }
    });
    canvas.addEventListener('click', (ev) => this.onBoardClick(ev));

    this.onWinMove = (ev) => this.handleWindowMove(ev);
    this.onWinUp = (ev) => this.handlePointerEnd(ev);
    this.onWinCancel = (ev) => this.handlePointerEnd(ev, true);
    this.onWinKey = (ev) => this.onKey(ev);
    this.onWinWheel = (ev) => this.onWheel(ev);
    this.onWinContext = (ev) => this.onContextMenu(ev);
    window.addEventListener('pointermove', this.onWinMove);
    window.addEventListener('pointerup', this.onWinUp);
    window.addEventListener('pointercancel', this.onWinCancel);
    window.addEventListener('keydown', this.onWinKey);
    window.addEventListener('wheel', this.onWinWheel, { passive: false });
    window.addEventListener('contextmenu', this.onWinContext);

    this.resizeObserver = new ResizeObserver(() => this.relayout());
    this.resizeObserver.observe(this.boardWrap);

    // debug/test hook (read-only snapshot)
    (globalThis as Record<string, unknown>).__blokus = {
      snapshot: () => this.debugSnapshot(),
    };
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    if (this.animHandle !== null) cancelAnimationFrame(this.animHandle);
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('pointerup', this.onWinUp);
    window.removeEventListener('pointercancel', this.onWinCancel);
    window.removeEventListener('keydown', this.onWinKey);
    window.removeEventListener('wheel', this.onWinWheel);
    window.removeEventListener('contextmenu', this.onWinContext);
    const g = globalThis as Record<string, unknown>;
    if (g.__blokus) delete g.__blokus;
  }

  // ------------------------------------------------------------------ state

  sync(s: GameScreenSync): void {
    const prev = this.state;
    this.detectEvents(s);
    this.prevSig = {
      history: s.game.history.length,
      turn: s.game.turn,
      over: s.game.over,
      remaining: [...s.game.remaining],
    };
    this.state = s;
    if (!prev || prev.game.size !== s.game.size) {
      this.relayout();
    }
    if (this.selected !== null && ((s.game.remaining[s.game.turn] >>> this.selected) & 1) === 0) {
      this.selected = null;
    }
    if (!this.canInteract()) {
      this.hover = null;
      this.drag = null;
      this.reGrab = null;
      this.parked = null;
      this.twoFinger = null;
      this.ringDrag = null;
      this.ringHover = false;
      this.rightPress = null;
    }
    this.refreshMoveIndex();
    this.root.classList.toggle('is-over', s.game.over);
    this.paint();
  }

  // ------------------------------------------------------------------ paint

  /** sound + highlight reactions for whatever just happened in the game */
  private detectEvents(s: GameScreenSync): void {
    const g = s.game;
    const sig = this.prevSig;
    if (!sig) return;
    // a fresh action landed (the session mutates the game in place, so we
    // compare signatures instead of object identity)
    if (g.history.length === sig.history + 1) {
      const a = g.history[g.history.length - 1];
      if (a.kind === 'place') {
        playPlace();
        if (!s.localSeats.includes(a.p)) {
          this.remote = {
            piece: a.piece,
            o: a.o,
            x: a.x,
            y: a.y,
            player: a.p,
            label: s.seats[a.p]?.name ?? '',
            start: performance.now(),
          };
          this.startAnim();
        }
      }
    }
    // someone finished all of their pieces
    for (let p = 0; p < g.playerCount; p++) {
      if (sig.remaining[p] !== undefined && sig.remaining[p] !== 0 && g.remaining[p] === 0) {
        playCelebrate();
        const name = s.seats[p]?.name ?? t('result.player', { n: p + 1 });
        toast(t('game.celebrate', { name }), 3600);
        this.celebrateStart = performance.now();
        this.startAnim();
      }
    }
    // your turn begins
    if (!sig.over && !g.over && g.turn !== sig.turn && s.canAct && s.localSeats.includes(g.turn)) {
      playTurn();
    }
    if (!sig.over && g.over) {
      playEnd();
    }
  }

  private startAnim(): void {
    if (this.animHandle !== null) return;
    const step = (): void => {
      const now = performance.now();
      const remoteAlive = this.remote !== null && now - this.remote.start < 1650;
      const celebAlive = this.celebrateStart !== null && now - this.celebrateStart < 1900;
      if (!remoteAlive) this.remote = null;
      if (!celebAlive) this.celebrateStart = null;
      this.paint();
      if (remoteAlive || celebAlive) {
        this.animHandle = requestAnimationFrame(step);
      } else {
        this.animHandle = null;
      }
    };
    this.animHandle = requestAnimationFrame(step);
  }

  private canInteract(): boolean {
    return !!this.state && this.state.canAct && !this.state.game.over;
  }

  private relayout(): void {
    const g = this.state?.game;
    if (!g) return;
    const avail = Math.min(this.boardWrap.clientWidth, this.boardWrap.clientHeight);
    if (avail <= 0) return;
    this.board.layout(g.size, avail - 16);
    const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dragLayer.style.width = `${w}px`;
    this.dragLayer.style.height = `${h}px`;
    this.dragLayer.width = Math.round(w * dpr);
    this.dragLayer.height = Math.round(h * dpr);
    this.paint();
  }

  private activePiece(): number | null {
    if (this.drag) return this.drag.piece;
    if (this.parked) return this.parked.piece;
    return this.selected;
  }

  private refreshMoveIndex(): void {
    const s = this.state;
    const piece = this.activePiece();
    this.moveIndex = null;
    if (!s || piece === null || !this.canInteract()) return;
    const seat = s.game.turn;
    const moves = s.game.legalMoves(seat);
    const keys = new Set<string>();
    const anchors = new Set<number>();
    const stride = s.game.stride;
    for (const m of moves) {
      if (m.piece !== piece) continue;
      keys.add(`${m.o}:${m.x}:${m.y}`);
      const or = PIECES[piece].orientations[m.o];
      const ax = m.x + or.cells[0];
      const ay = m.y + or.cells[1];
      anchors.add((ay + 2) * stride + (ax + 2));
    }
    this.moveIndex = { keys, anchors, piece, seat };
  }

  private isValidAt(piece: number, o: number, x: number, y: number): boolean {
    return (
      this.moveIndex !== null &&
      this.moveIndex.piece === piece &&
      this.moveIndex.keys.has(`${o}:${x}:${y}`)
    );
  }

  private boardGhost(): GhostPreview | null {
    const s = this.state;
    if (!s || !this.canInteract()) return null;
    const player = s.game.turn;
    if (this.parked) {
      const pk = this.parked;
      return {
        piece: pk.piece,
        o: pk.o,
        x: pk.x,
        y: pk.y,
        valid: this.isValidAt(pk.piece, pk.o, pk.x, pk.y),
        player,
        kind: 'parked',
      };
    }
    const d = this.drag;
    if (d && d.snapped) {
      return {
        piece: d.piece,
        o: d.o,
        x: d.snapped.x,
        y: d.snapped.y,
        valid: this.isValidAt(d.piece, d.o, d.snapped.x, d.snapped.y),
        player,
        kind: 'ghost',
      };
    }
    if (this.selected !== null && this.hover) {
      const or = PIECES[this.selected].orientations[this.selO];
      const x = this.hover.x - or.cells[0];
      const y = this.hover.y - or.cells[1];
      return {
        piece: this.selected,
        o: this.selO,
        x,
        y,
        valid: this.isValidAt(this.selected, this.selO, x, y),
        player,
        kind: 'ghost',
      };
    }
    return null;
  }

  private paintDragLayer(): void {
    const ctx = this.dragCtx;
    if (!ctx) return;
    const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const d = this.drag;
    const s = this.state;
    if (!d || d.snapped || !s || d.px < 0 || d.py < 0) return;
    const cs = this.board.cellSize();
    const left = d.px - (d.grab[0] + 0.5) * cs;
    const top = d.py - (d.grab[1] + 0.5) * cs;
    drawPieceShape(ctx, d.piece, d.o, cs, left, top, {
      fill: withAlpha(PALETTE[s.game.turn], 0.85),
    });
  }

  private paint(): void {
    const s = this.state;
    if (!s) return;

    const ringGeom = this.ringDrag ? this.ringDrag.geom : this.currentRing();
    const rect = this.board.canvas.getBoundingClientRect();
    const now = performance.now();
    const remote = this.remote
      ? {
          piece: this.remote.piece,
          o: this.remote.o,
          x: this.remote.x,
          y: this.remote.y,
          player: this.remote.player,
          label: this.remote.label,
          strength: Math.max(0, 1 - (now - this.remote.start) / 1650),
        }
      : null;
    const celebrate = this.celebrateStart
      ? Math.max(0, 1 - (now - this.celebrateStart) / 1900)
      : 0;
    this.board.draw({
      game: s.game,
      anchors: this.moveIndex?.anchors ?? null,
      ghost: this.boardGhost(),
      hint: s.hint,
      remote,
      celebrate,
      ring: ringGeom
        ? {
            cx: ringGeom.cx - rect.left,
            cy: ringGeom.cy - rect.top,
            r: ringGeom.r,
            band: ringGeom.band,
            hover: this.ringHover,
            active: this.ringDrag !== null,
            dir: this.ringDir,
          }
        : null,
    });
    this.paintDragLayer();

    const active = this.activePiece();
    const traySeat = s.localSeats.includes(s.game.turn) ? s.game.turn : s.localSeats[0] ?? s.game.turn;
    const playable = s.canAct ? this.playablePieces() : null;
    this.tray.sync(s.game.remaining[traySeat] ?? 0, traySeat, active, playable);

    // header
    const acting = s.seats[s.game.turn];
    this.turnChip.replaceChildren();
    if (acting) {
      const dot = el('span', 'dot');
      dot.style.background = PALETTE[s.game.turn];
      const label = el('span', 'turn-name');
      let text = acting.name;
      if (s.localSeats.includes(s.game.turn)) text += ` · ${t('game.yourTurn')}`;
      label.textContent = text;
      const suffix = el('span', 'turn-suffix');
      if (s.thinking) suffix.textContent = t('game.thinking');
      else if (!s.localSeats.includes(s.game.turn)) suffix.textContent = t('game.waiting');
      else if (s.mustPass) suffix.textContent = t('game.noMoves');
      else if (this.parked) suffix.textContent = t('game.clickBoard');
      this.turnChip.append(dot, label, suffix);
    }
    this.statusEl.textContent = s.status ?? '';

    // score list
    this.scoreList.replaceChildren();
    const scores = s.game.scores();
    s.seats.forEach((seat, p) => {
      const row = el('div', `score-row${p === s.game.turn ? ' active' : ''}`);
      const dot = el('span', 'dot');
      dot.style.background = PALETTE[p];
      const name = el('span', 'score-name');
      name.textContent = seat.name;
      const tags = el('span', 'score-tags');
      if (s.localSeats.includes(p)) tags.textContent = t('game.tag.you');
      else if (seat.kind === 'ai') tags.textContent = t('game.tag.ai');
      if (seat.kind === 'remote') {
        tags.textContent = seat.connected === false ? t('game.tag.offline') : t('game.tag.online');
      }
      const val = el('span', 'score-val');
      val.textContent = t('game.score', { cells: scores[p].cells, left: scores[p].piecesLeft });
      row.append(dot, name, tags, val);
      this.scoreList.appendChild(row);
    });

    // actions
    const interactable = this.canInteract();
    const hasActive = active !== null;
    this.btnRotate.disabled = !interactable || !hasActive;
    this.btnFlip.disabled = !interactable || !hasActive;
    this.btnHint.hidden = !s.hintAvailable;
    this.btnHint.disabled = !interactable || s.thinking;
    this.btnUndo.hidden = !s.undoAvailable;
    this.btnUndo.disabled = !s.undoAvailable;
    this.btnPass.hidden = !(interactable && s.mustPass);

    // LAN social row
    this.socialRow.hidden = !s.social;
    if (s.social) {
      this.btnUndoReq.disabled = !s.social.canUndoRequest;
      this.btnPause.disabled = !s.social.canPause;
      this.btnPause.textContent = s.paused ? t('game.resume') : t('game.pause');
      this.btnNudge.disabled = !s.social.canNudge;
    }
    this.pauseBanner.classList.toggle('hidden', !s.paused);

    // cursor feedback
    this.root.classList.toggle('is-dragging', !!(this.drag || this.reGrab || this.twoFinger || this.ringDrag));
    const canvas = this.board.canvas;
    const onBody = !!this.parked && !!this.hover && this.isOnPieceBody(this.parked, this.hover);
    canvas.style.cursor = this.ringHover || onBody ? 'grab' : 'default';

    // result overlay
    if (s.game.over) {
      this.renderResult(s);
    } else {
      this.overlay.classList.add('hidden');
    }
  }

  private playablePieces(): Set<number> | null {
    const s = this.state;
    if (!s || !this.canInteract()) return null;
    const key = `${s.game.history.length}:${s.game.turn}`;
    if (this.playableCache && this.playableCache.key === key) return this.playableCache.set;
    const set = new Set<number>();
    for (const m of s.game.legalMoves(s.game.turn)) set.add(m.piece);
    this.playableCache = { key, set };
    return set;
  }

  private renderResult(s: GameScreenSync): void {
    const ranking = s.game.ranking();
    const best = s.game.score(ranking[0]);
    const tied = s.game.playerCount > 1 && s.game.score(ranking[1]).total === best.total;
    const card = el('div', 'result');
    const title = el('h2', 'result-title');
    if (tied) title.textContent = t('result.draw');
    else {
      const name = s.seats[ranking[0]]?.name ?? t('result.player', { n: ranking[0] + 1 });
      title.textContent = t('result.win', { name });
    }
    const scores = s.game.scores();
    const table = el('div', 'result-table');
    ranking.forEach((p, i) => {
      const row = el('div', `result-row${i === 0 ? ' win' : ''}`);
      const rank = el('span', 'rank', String(i + 1));
      const dot = el('span', 'dot');
      dot.style.background = PALETTE[p];
      const name = el('span', 'rname');
      name.textContent = s.seats[p]?.name ?? t('result.player', { n: p + 1 });
      const detail = el('span', 'rval');
      detail.textContent = `${t('result.cells', { cells: scores[p].cells })}${
        scores[p].bonus ? ` + ${scores[p].bonus}` : ''
      }`;
      const total = el('span', 'rtotal', String(scores[p].total));
      row.append(rank, dot, name, detail, total);
      table.appendChild(row);
    });
    const actions = el('div', 'result-actions');
    if (s.rematchAvailable) {
      actions.appendChild(button('btn primary', t('result.playAgain'), () => this.intents.rematch()));
    }
    actions.appendChild(button('btn', t('replay.title'), () => this.intents.replay()));
    actions.appendChild(button('btn', t('result.home'), () => this.requestExit(true)));
    card.replaceChildren(title, table, actions);
    this.overlayCard.replaceChildren(card);
    this.overlay.classList.remove('hidden');
  }

  // ------------------------------------------------------- piece management

  private selectPiece(piece: number): void {
    if (!this.canInteract()) return;
    this.parked = null;
    this.drag = null;
    if (this.selected === piece) {
      this.selected = null;
    } else {
      this.selected = piece;
      this.selO = 0;
    }
    this.refreshMoveIndex();
    this.repaint();
  }

  private beginDragFromTray(piece: number, grab: [number, number], ev: PointerEvent): void {
    if (!this.canInteract()) return;
    this.parked = null;
    this.reGrab = null;
    this.selected = piece;
    this.selO = 0;
    this.drag = {
      piece,
      o: 0,
      grab,
      px: ev.clientX,
      py: ev.clientY,
      startPx: ev.clientX,
      startPy: ev.clientY,
      snapped: null,
      fromParked: null,
      moved: false,
      pointerId: ev.pointerId,
    };
    this.suppressBoardClick = false;
    this.updateDragSnap();
    this.refreshMoveIndex();
    this.repaint();
  }

  private beginDragFromParked(pk: ParkedInfo, ev: PointerEvent): void {
    this.drag = {
      piece: pk.piece,
      o: pk.o,
      grab: this.grabCellWithin(pk, ev),
      px: ev.clientX,
      py: ev.clientY,
      startPx: ev.clientX,
      startPy: ev.clientY,
      snapped: null,
      fromParked: { x: pk.x, y: pk.y },
      moved: true,
      pointerId: ev.pointerId,
    };
    this.parked = null;
    this.reGrab = null;
    this.updateDragSnap();
    this.refreshMoveIndex();
    this.repaint();
  }

  private updateDragSnap(): void {
    const s = this.state;
    const d = this.drag;
    if (!s || !d) return;
    const cell = this.board.cellFromClient(d.px, d.py, s.game);
    d.snapped = cell ? { x: cell.x - d.grab[0], y: cell.y - d.grab[1] } : null;
  }

  private finishDrag(drop: boolean): void {
    const d = this.drag;
    if (!d) return;
    let next: ParkedInfo | null = null;
    if (drop && d.snapped) {
      // dropping anywhere on the board parks the piece (red = needs fixing)
      next = { piece: d.piece, o: d.o, x: d.snapped.x, y: d.snapped.y };
    } else if (drop && d.fromParked) {
      next = { piece: d.piece, o: d.o, x: d.fromParked.x, y: d.fromParked.y };
    }
    this.parked = next;
    this.selected = null;
    this.drag = null;
    if (d.moved) this.suppressBoardClick = true;
    this.refreshMoveIndex();
    this.repaint();
  }

  private confirmParked(): void {
    const s = this.state;
    const pk = this.parked;
    if (!s || !pk) return;
    if (!this.isValidAt(pk.piece, pk.o, pk.x, pk.y)) {
      const now = performance.now();
      playInvalid();
      if (now - this.invalidToastAt > 1500) {
        this.invalidToastAt = now;
        const reason = s.game.illegalReason({
          kind: 'place',
          p: s.game.turn,
          piece: pk.piece,
          o: pk.o,
          x: pk.x,
          y: pk.y,
        });
        toast(reason ? t(`illegal.${reason}` as 'illegal.occupied') : t('game.badSpot'));
      }
      return;
    }
    const mv: PlaceMove = {
      kind: 'place',
      p: s.game.turn,
      piece: pk.piece,
      o: pk.o,
      x: pk.x,
      y: pk.y,
    };
    if (this.intents.place(mv)) {
      this.parked = null;
      this.selected = null;
      this.refreshMoveIndex();
      this.repaint();
    }
  }

  private rotateParked(dir: 1 | -1): void {
    const pk = this.parked;
    if (!pk) return;
    const next = transformOrientation(pk.piece, pk.o, dir === 1 ? 'cw' : 'ccw');
    if (next >= 0) pk.o = next;
  }

  /** rotate the piece currently held by the pointer (keeps the grab cell) */
  private rotateHeld(dir: 1 | -1): void {
    const d = this.drag;
    if (!d) return;
    const kind: TransformKind = dir === 1 ? 'cw' : 'ccw';
    const next = transformOrientation(d.piece, d.o, kind);
    if (next >= 0) {
      d.grab = transformCell(d.piece, d.o, kind, d.grab);
      d.o = next;
    }
  }

  private rotateActive(dir: 1 | -1): void {
    if (!this.canInteract()) return;
    const kind: TransformKind = dir === 1 ? 'cw' : 'ccw';
    if (this.drag) {
      this.rotateHeld(dir);
      this.updateDragSnap();
    } else if (this.parked) {
      this.rotateParked(dir);
    } else if (this.selected !== null) {
      const next = transformOrientation(this.selected, this.selO, kind);
      if (next >= 0) this.selO = next;
    } else {
      return;
    }
    this.repaint();
  }

  private flipActive(): void {
    if (!this.canInteract()) return;
    if (this.drag) {
      const next = transformOrientation(this.drag.piece, this.drag.o, 'mirror');
      if (next >= 0) {
        this.drag.grab = transformCell(this.drag.piece, this.drag.o, 'mirror', this.drag.grab);
        this.drag.o = next;
        this.updateDragSnap();
      }
    } else if (this.parked) {
      const next = transformOrientation(this.parked.piece, this.parked.o, 'mirror');
      if (next >= 0) this.parked.o = next;
    } else if (this.selected !== null) {
      const next = transformOrientation(this.selected, this.selO, 'mirror');
      if (next >= 0) this.selO = next;
    } else {
      return;
    }
    this.repaint();
  }

  // --------------------------------------------------------------- geometry

  private orientationOfActive(): { piece: number; o: number } | null {
    if (this.drag) return { piece: this.drag.piece, o: this.drag.o };
    if (this.parked) return { piece: this.parked.piece, o: this.parked.o };
    if (this.selected !== null) return { piece: this.selected, o: this.selO };
    return null;
  }

  private isOnPieceBody(pk: ParkedInfo, cell: { x: number; y: number }): boolean {
    const or = PIECES[pk.piece].orientations[pk.o];
    for (let i = 0; i < or.cells.length; i += 2) {
      if (pk.x + or.cells[i] === cell.x && pk.y + or.cells[i + 1] === cell.y) return true;
    }
    return false;
  }

  private grabCellWithin(pk: ParkedInfo, ev: { clientX: number; clientY: number }): [number, number] {
    const rect = this.board.canvas.getBoundingClientRect();
    const cs = this.board.cellSize();
    const cell = {
      x: (ev.clientX - rect.left) / cs - 0.5,
      y: (ev.clientY - rect.top) / cs - 0.5,
    };
    return clampIntoPiece(pk.piece, pk.o, Math.floor(cell.x) - pk.x, Math.floor(cell.y) - pk.y);
  }

  /** rotation ring around the parked piece (client coordinates), if any */
  private currentRing(): RingGeometry | null {
    const pk = this.parked;
    if (!pk || !this.canInteract()) return null;
    const rect = this.board.canvas.getBoundingClientRect();
    return computeRing({
      piece: pk.piece,
      o: pk.o,
      x: pk.x,
      y: pk.y,
      cell: this.board.cellSize(),
      left: rect.left,
      top: rect.top,
    });
  }

  // ------------------------------------------------------------------ input

  private onBoardPointerDown(ev: PointerEvent): void {
    const s = this.state;
    if (!s) return;
    this.boardPointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // second finger while parked: rotate with a two-finger gesture
    if (this.boardPointers.size === 2) {
      this.reGrab = null;
      this.ringDrag = null;
      this.rightPress = null;
      this.tapConsumed = true;
      if (this.parked && this.canInteract()) {
        const [a, b] = [...this.boardPointers.values()];
        this.twoFinger = { lastAngle: Math.atan2(b.y - a.y, b.x - a.x), accum: 0 };
        this.suppressBoardClick = true;
        this.repaint();
      }
      return;
    }

    if (!this.canInteract()) return;

    // right button: a tap or a drag (any direction) flips the active piece once
    if (ev.button === 2) {
      if (this.parked || this.drag || this.selected !== null) {
        this.rightPress = { x: ev.clientX, y: ev.clientY, flipped: false, pointerId: ev.pointerId };
        ev.preventDefault();
      }
      return;
    }

    if (ev.button !== 0) return;
    this.suppressBoardClick = false;
    this.tapStart = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
    this.tapConsumed = false;
    const cell = this.board.cellFromClient(ev.clientX, ev.clientY, s.game);

    // rotation ring: press + drag rotates in place; a plain tap does nothing
    const ring = this.currentRing();
    if (ring && inRing(ring, ev.clientX, ev.clientY) && cell) {
      this.tapConsumed = true;
      this.ringDrag = {
        geom: ring,
        lastAngle: Math.atan2(ev.clientY - ring.cy, ev.clientX - ring.cx),
        accum: 0,
        pointerId: ev.pointerId,
      };
      this.suppressBoardClick = true;
      this.ringHover = false;
      this.repaint();
      ev.preventDefault();
      return;
    }

    if (!cell) return;
    if (this.parked && this.isOnPieceBody(this.parked, cell)) {
      this.reGrab = {
        grab: this.grabCellWithin(this.parked, ev),
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
      };
      ev.preventDefault();
    }
  }

  private onBoardPointerMove(ev: PointerEvent): void {
    if (this.drag || this.reGrab || this.twoFinger || this.ringDrag || this.rightPress) return;
    const s = this.state;
    if (!s) return;
    const cell = this.board.cellFromClient(ev.clientX, ev.clientY, s.game);
    const cellChanged =
      (cell === null) !== (this.hover === null) ||
      (cell && this.hover && (cell.x !== this.hover.x || cell.y !== this.hover.y));
    const ring = this.currentRing();
    const ringHover = !!cell && !!ring && inRing(ring, ev.clientX, ev.clientY);
    if (cellChanged || ringHover !== this.ringHover) {
      this.hover = cell;
      this.ringHover = ringHover;
      this.repaint();
    }
  }

  private handleWindowMove(ev: PointerEvent): void {
    // two-finger rotation tracking
    if (this.boardPointers.has(ev.pointerId)) {
      this.boardPointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.twoFinger && this.boardPointers.size >= 2 && this.parked) {
        const [a, b] = [...this.boardPointers.values()];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        let d = angle - this.twoFinger.lastAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.twoFinger.lastAngle = angle;
        this.twoFinger.accum += d;
        const steps = Math.trunc(this.twoFinger.accum / TOUCH_STEP_ANGLE);
        if (steps !== 0) {
          this.twoFinger.accum -= steps * TOUCH_STEP_ANGLE;
          for (let i = 0; i < Math.abs(steps); i++) this.rotateParked(steps > 0 ? 1 : -1);
          this.repaint();
        }
      }
    }

    // right-button drag (any direction) flips the active piece once
    const rp = this.rightPress;
    if (rp && ev.pointerId === rp.pointerId && !rp.flipped) {
      if (Math.hypot(ev.clientX - rp.x, ev.clientY - rp.y) >= RIGHT_FLIP_DISTANCE) {
        rp.flipped = true;
        this.flipActive();
      }
    }

    // touch: pulling a tray piece out vertically starts the drag
    const pt = this.pendingTray;
    if (pt && ev.pointerId === pt.pointerId) {
      const dx = ev.clientX - pt.x;
      const dy = ev.clientY - pt.y;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        const piece = pt.piece;
        const grab = pt.grab;
        this.pendingTray = null;
        this.beginDragFromTray(piece, grab, ev);
        return;
      }
    }

    // rotation ring: circling the ring rotates the parked piece in place
    const rd = this.ringDrag;
    if (rd && ev.pointerId === rd.pointerId) {
      const ang = Math.atan2(ev.clientY - rd.geom.cy, ev.clientX - rd.geom.cx);
      let d = ang - rd.lastAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      rd.lastAngle = ang;
      const res = ringSteps(rd.accum + d);
      rd.accum = res.rest;
      if (res.steps !== 0) {
        this.ringDir = res.steps > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(res.steps); i++) this.rotateParked(this.ringDir);
        this.repaint();
      }
      return;
    }

    const d = this.drag;
    if (d && ev.pointerId === d.pointerId) {
      d.px = ev.clientX;
      d.py = ev.clientY;
      if (!d.moved && Math.hypot(d.px - d.startPx, d.py - d.startPy) > MOVE_THRESHOLD) {
        d.moved = true;
      }
      this.updateDragSnap();
      this.repaint();
      return;
    }

    const r = this.reGrab;
    if (r && ev.pointerId === r.pointerId && this.parked) {
      // dragging a parked piece lifts it once the pointer travels far enough
      if (Math.hypot(ev.clientX - r.startX, ev.clientY - r.startY) > MOVE_THRESHOLD) {
        this.beginDragFromParked(this.parked, ev);
        this.suppressBoardClick = true;
      }
    }
  }

  private handlePointerEnd(ev: PointerEvent, cancelled = false): void {
    this.boardPointers.delete(ev.pointerId);
    if (this.twoFinger && this.boardPointers.size < 2) this.twoFinger = null;
    if (this.pendingTray && ev.pointerId === this.pendingTray.pointerId) {
      this.pendingTray = null; // a plain tap: selection happens via click
    }
    const leftButton = ev.button === 0 || cancelled;

    // decide up front whether this press was a tap (handled on release so it
    // never depends on the browser's synthetic click)
    const ts = this.tapStart;
    const isTap =
      !!ts &&
      leftButton &&
      ev.pointerId === ts.pointerId &&
      !cancelled &&
      !this.tapConsumed &&
      Math.hypot(ev.clientX - ts.x, ev.clientY - ts.y) < 8;
    this.tapStart = null;

    const rd = this.ringDrag;
    if (rd && leftButton && ev.pointerId === rd.pointerId) {
      this.ringDrag = null;
      this.suppressBoardClick = true; // the click after a ring gesture must not confirm
      this.repaint();
      return;
    }

    const rp = this.rightPress;
    if (rp && (ev.button === 2 || cancelled) && ev.pointerId === rp.pointerId) {
      this.rightPress = null;
      if (!rp.flipped && !cancelled) this.flipActive(); // a plain right-click also flips
      return;
    }

    const d = this.drag;
    if (d && leftButton && ev.pointerId === d.pointerId) {
      this.finishDrag(!cancelled);
      return;
    }
    const r = this.reGrab;
    if (r && leftButton && ev.pointerId === r.pointerId) {
      this.reGrab = null;
      this.repaint();
    }

    if (isTap) {
      this.handleBoardTap(ev.clientX, ev.clientY);
      this.suppressBoardClick = true; // swallow the synthetic click, if any
    }
  }

  /** tap semantics: confirm a parked piece, or park the selected one */
  private handleBoardTap(clientX: number, clientY: number): void {
    const s = this.state;
    if (!s || !this.canInteract()) return;
    const cell = this.board.cellFromClient(clientX, clientY, s.game);
    if (!cell) return;
    if (this.parked) {
      this.confirmParked();
      return;
    }
    if (this.drag) return;
    this.parkSelectedAt(cell);
  }

  /** park the selected piece with its first cell under `cell` */
  private parkSelectedAt(cell: { x: number; y: number }): void {
    const sel = this.selected;
    if (sel === null) return;
    const or = PIECES[sel].orientations[this.selO];
    this.parked = {
      piece: sel,
      o: this.selO,
      x: cell.x - or.cells[0],
      y: cell.y - or.cells[1],
    };
    this.selected = null;
    this.refreshMoveIndex();
    this.repaint();
  }

  /**
   * Keyboard placement flow: arrows move a cursor (or nudge the parked
   * piece), Enter parks the selected piece / confirms it.
   */
  private moveKeyCursor(dx: number, dy: number): boolean {
    const s = this.state;
    if (!s || !this.canInteract()) return false;
    const size = s.game.size;
    if (this.parked) {
      const or = PIECES[this.parked.piece].orientations[this.parked.o];
      const x = Math.min(Math.max(this.parked.x + dx, 0), size - or.w);
      const y = Math.min(Math.max(this.parked.y + dy, 0), size - or.h);
      if (x !== this.parked.x || y !== this.parked.y) {
        this.parked = { ...this.parked, x, y };
        this.repaint();
      }
      return true;
    }
    if (this.selected === null || this.drag) return false;
    const cur = this.hover ?? this.cursorStart();
    this.hover = {
      x: Math.min(Math.max(cur.x + dx, 0), size - 1),
      y: Math.min(Math.max(cur.y + dy, 0), size - 1),
    };
    this.repaint();
    return true;
  }

  /** where the keyboard cursor appears on the first arrow press */
  private cursorStart(): { x: number; y: number } {
    const s = this.state;
    if (!s) return { x: 0, y: 0 };
    const [cx, cy] = cornersFor(s.game.config.variant, s.game.config.players)[s.game.turn];
    return { x: cx, y: cy };
  }

  private onBoardClick(ev: MouseEvent): void {
    // taps are handled on pointerup; this is only a safety net
    if (this.suppressBoardClick) {
      this.suppressBoardClick = false;
      return;
    }
    this.handleBoardTap(ev.clientX, ev.clientY);
  }

  private onWheel(ev: WheelEvent): void {
    if (!this.canInteract()) return;
    if (!this.drag && !this.parked && this.selected === null) return;
    const target = ev.target as HTMLElement | null;
    if (!target?.closest?.('.board-canvas') && !target?.closest?.('.tray')) return;
    ev.preventDefault();
    const now = performance.now();
    if (now - this.lastWheelAt < 60) return;
    this.lastWheelAt = now;
    this.rotateActive(ev.deltaY < 0 ? 1 : -1);
  }

  private onContextMenu(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target?.closest?.('.board-canvas') && !target?.closest?.('.tray')) return;
    // the native menu never shows; flipping is driven by pointer events
    ev.preventDefault();
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    const key = ev.key.toLowerCase();
    if (key === 'r') this.rotateActive(ev.shiftKey ? -1 : 1);
    else if (key === 'q') this.rotateActive(-1);
    else if (key === 'f') this.flipActive();
    else if (key === 'enter' || key === ' ') {
      if (this.parked) {
        ev.preventDefault();
        this.confirmParked();
      } else if (this.selected !== null) {
        // keyboard flow: Enter parks the selected piece under the cursor
        ev.preventDefault();
        if (!this.hover) this.hover = this.cursorStart();
        this.parkSelectedAt(this.hover);
      }
    } else if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
      const dx = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;
      const dy = key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0;
      if (this.moveKeyCursor(dx, dy)) ev.preventDefault();
    } else if (key === 'escape') {
      this.drag = null;
      this.reGrab = null;
      this.parked = null;
      this.selected = null;
      this.hover = null;
      this.refreshMoveIndex();
      this.repaint();
    } else if (key === 'p' && this.state?.mustPass && this.canInteract()) {
      this.intents.pass();
    } else if (key === 'm') {
      const mode = cycleSoundMode();
      toast(t('sound.label', { state: t(`sound.${mode}` as 'sound.normal') }), 1500);
    }
  }

  private repaint(): void {
    this.paint();
  }

  private requestExit(fromResult = false): void {
    const s = this.state;
    if (!fromResult && s && !s.game.over) {
      const ok = window.confirm(t('game.quitConfirm'));
      if (!ok) return;
    }
    this.intents.exit();
  }

  private debugSnapshot(): Record<string, unknown> {
    const s = this.state;
    return {
      turn: s?.game.turn ?? -1,
      over: s?.game.over ?? false,
      canAct: this.canInteract(),
      history: s?.game.history.length ?? 0,
      selected: this.selected,
      drag: this.drag
        ? {
            piece: this.drag.piece,
            o: this.drag.o,
            grab: this.drag.grab,
            snapped: this.drag.snapped,
            moved: this.drag.moved,
          }
        : null,
      parked: this.parked
        ? {
            piece: this.parked.piece,
            o: this.parked.o,
            x: this.parked.x,
            y: this.parked.y,
            valid: this.isValidAt(this.parked.piece, this.parked.o, this.parked.x, this.parked.y),
          }
        : null,
      activeO: this.orientationOfActive(),
      reGrab: this.reGrab !== null,
      paused: this.state?.paused ?? false,
      hint: this.state?.hint ?? null,
      // the fading highlight of someone else's move (for tests)
      remote: this.remote
        ? { piece: this.remote.piece, x: this.remote.x, y: this.remote.y, player: this.remote.player }
        : null,
      // ring geometry in client px (for e2e / debugging)
      ring: (() => {
        const g = this.ringDrag ? this.ringDrag.geom : this.currentRing();
        return g ? { cx: g.cx, cy: g.cy, r: g.r, band: g.band } : null;
      })(),
      // debug-only: the legal-move keys of the active piece
      miPiece: this.moveIndex?.piece ?? null,
      miKeys: this.moveIndex ? [...this.moveIndex.keys] : [],
      // debug-only: a few legal moves for the current seat (for e2e)
      legalSample: this.state ? this.state.game.legalMoves(this.state.game.turn).slice(0, 3) : [],
    };
  }
}
