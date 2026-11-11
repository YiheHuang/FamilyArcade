import { MONOMINO, PIECES, PIECE_COUNT, TOTAL_CELLS } from './pieces';
import { VARIANTS, cornersFor } from './variants';
import type { Action, GameConfig, PlaceMove, PlayerScore, SerializedGame } from './types';

/**
 * Non-zero filler around the board. This collapses bounds checking into
 * occupancy checks: an out-of-board cell is either a border cell (non-zero)
 * or reads past the array (undefined !== 0). Both count as "occupied".
 */
const BORDER = 15;

/** user-facing reasons why a placement is illegal */
export type IllegalReason =
  | 'over'
  | 'turn'
  | 'piece-used'
  | 'bounds'
  | 'occupied'
  | 'edge-touch'
  | 'no-corner'
  | 'no-contact';

/** Padded offset tables are identical for every game with the same stride. */
const OFFSET_CACHE = new Map<number, Int16Array[][]>();

function buildOffsets(stride: number): Int16Array[][] {
  const cached = OFFSET_CACHE.get(stride);
  if (cached) return cached;
  const tables = PIECES.map((piece) =>
    piece.orientations.map((or) => {
      const arr = new Int16Array(or.cells.length / 2);
      for (let i = 0; i < or.cells.length; i += 2) {
        arr[i >> 1] = or.cells[i + 1] * stride + or.cells[i];
      }
      return arr;
    }),
  );
  OFFSET_CACHE.set(stride, tables);
  return tables;
}

export class Game {
  readonly config: GameConfig;
  readonly size: number;
  readonly stride: number;
  readonly playerCount: number;
  /** padded board indices of each player's start corner */
  readonly startCorners: readonly number[];

  /** 0 = empty, p+1 = player p; includes a 2-cell non-zero border */
  board: Uint8Array;
  /** per player: 21-bit mask of remaining pieces */
  remaining: number[];
  /** per player: squares placed so far */
  placedCells: number[];
  /** per player: last piece index placed (for monomino-last bonus) */
  lastPiece: number[];

  turn = 0;
  consecutivePasses = 0;
  over = false;
  history: Action[] = [];

  private readonly off: Int16Array[][];

  constructor(config: GameConfig, history: Action[] = []) {
    const variant = VARIANTS[config.variant];
    if (!variant) throw new Error(`未知变体: ${config.variant}`);
    if (!variant.corners[config.players]) {
      throw new Error(`变体 ${config.variant} 不支持 ${config.players} 人`);
    }
    this.config = { ...config };
    this.size = variant.size;
    this.stride = this.size + 4;
    this.playerCount = config.players;
    this.off = buildOffsets(this.stride);

    const total = this.stride * this.stride;
    this.board = new Uint8Array(total).fill(BORDER);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        this.board[(y + 2) * this.stride + (x + 2)] = 0;
      }
    }

    this.remaining = new Array(this.playerCount).fill((1 << PIECE_COUNT) - 1);
    this.placedCells = new Array(this.playerCount).fill(0);
    this.lastPiece = new Array(this.playerCount).fill(-1);

    const corners = cornersFor(config.variant, config.players);
    this.startCorners = corners.map(([x, y]) => (y + 2) * this.stride + (x + 2));

    for (const a of history) {
      if (!this.tryApply(a)) {
        throw new Error(`历史记录中存在非法走子: ${JSON.stringify(a)}`);
      }
    }
  }

  // ------------------------------------------------------------------ state

  /** board cell value at (x, y): 0 empty, 1..4 = player + 1 */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return BORDER;
    return this.board[(y + 2) * this.stride + (x + 2)];
  }

  /** pass is only sensible when no placement exists — UI and hosts enforce this */
  mustPass(p: number): boolean {
    return !this.hasMove(p);
  }

  remainingPieces(p: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < PIECE_COUNT; i++) {
      if ((this.remaining[p] >>> i) & 1) out.push(i);
    }
    return out;
  }

  score(p: number): PlayerScore {
    const cells = this.placedCells[p];
    let piecesLeft = 0;
    for (let m = this.remaining[p]; m !== 0; m &= m - 1) piecesLeft++;
    let bonus = 0;
    if (piecesLeft === 0 && cells === TOTAL_CELLS) {
      bonus = this.lastPiece[p] === MONOMINO ? 20 : 15;
    }
    return { cells, bonus, total: cells + bonus, piecesLeft };
  }

  scores(): PlayerScore[] {
    return Array.from({ length: this.playerCount }, (_, p) => this.score(p));
  }

  /** players to rank: by total desc, then fewer pieces left, then seat order */
  ranking(): number[] {
    const scores = this.scores();
    return Array.from({ length: this.playerCount }, (_, p) => p).sort((a, b) => {
      const sa = scores[a];
      const sb = scores[b];
      return sb.total - sa.total || sa.piecesLeft - sb.piecesLeft || a - b;
    });
  }

  // ------------------------------------------------------------- move search

  private frontierFlags(p: number): Uint8Array {
    const flags = new Uint8Array(this.board.length);
    const b = this.board;
    const s = this.stride;
    const c = p + 1;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = (y + 2) * s + (x + 2);
        if (b[i] !== 0) continue;
        if (b[i - s - 1] === c || b[i - s + 1] === c || b[i + s - 1] === c || b[i + s + 1] === c) {
          flags[i] = 1;
        }
      }
    }
    return flags;
  }

  /** core legality test for a candidate placement */
  private fits(
    p: number,
    cells: Int16Array,
    base: number,
    frontier: Uint8Array | null,
    corner: number,
  ): boolean {
    const b = this.board;
    const s = this.stride;
    const own = p + 1;
    let touch = false;
    for (let i = 0; i < cells.length; i++) {
      const idx = base + cells[i];
      if (b[idx] !== 0) return false;
      if (
        b[idx - 1] === own ||
        b[idx + 1] === own ||
        b[idx - s] === own ||
        b[idx + s] === own
      ) {
        return false;
      }
      if (frontier === null) {
        if (idx === corner) touch = true;
      } else if (frontier[idx] === 1) {
        touch = true;
      }
    }
    return touch;
  }

  /** Enumerate placements; `visit` returns true to stop early. */
  private scan(
    p: number,
    visit: (m: PlaceMove, base: number) => boolean,
  ): boolean {
    if (this.over || this.remaining[p] === 0) return false;
    const first = this.placedCells[p] === 0;
    const frontier = first ? null : this.frontierFlags(p);
    const corner = this.startCorners[p];
    const size = this.size;
    const stride = this.stride;

    for (let piece = 0; piece < PIECE_COUNT; piece++) {
      if (((this.remaining[p] >>> piece) & 1) === 0) continue;
      const orientations = PIECES[piece].orientations;
      const offsets = this.off[piece];
      for (let o = 0; o < orientations.length; o++) {
        const { w, h } = orientations[o];
        const cells = offsets[o];
        if (first) {
          for (let k = 0; k < cells.length; k++) {
            const base = corner - cells[k];
            const qy = Math.floor(base / stride) - 2;
            const qx = (base % stride) - 2;
            if (qx < 0 || qy < 0 || qx + w > size || qy + h > size) continue;
            const m: PlaceMove = { kind: 'place', p, piece, o, x: qx, y: qy };
            if (this.fits(p, cells, base, null, corner) && visit(m, base)) return true;
          }
        } else {
          for (let y = 0; y + h <= size; y++) {
            for (let x = 0; x + w <= size; x++) {
              const base = (y + 2) * stride + (x + 2);
              if (!this.fits(p, cells, base, frontier, corner)) continue;
              const m: PlaceMove = { kind: 'place', p, piece, o, x, y };
              if (visit(m, base)) return true;
            }
          }
        }
      }
    }
    return false;
  }

  legalMoves(p: number): PlaceMove[] {
    const out: PlaceMove[] = [];
    this.scan(p, (m) => {
      out.push(m);
      return false;
    });
    return out;
  }

  hasMove(p: number): boolean {
    return this.scan(p, () => true);
  }

  /** number of empty cells diagonally adjacent to p's pieces (mobility proxy) */
  frontierSize(p: number): number {
    const flags = this.frontierFlags(p);
    let n = 0;
    for (let i = 0; i < flags.length; i++) if (flags[i] === 1) n++;
    return n;
  }

  /** per board-length flags: 1 where an empty cell is diagonally adjacent to p */
  frontierFlagsFor(p: number): Uint8Array {
    return this.frontierFlags(p);
  }

  // ------------------------------------------------------------------ update

  /**
   * Why would this placement be rejected? (for user-facing explanations)
   * Returns null when the move is legal.
   */
  illegalReason(a: PlaceMove): IllegalReason | null {
    if (this.over) return 'over';
    if (a.p !== this.turn) return 'turn';
    if (!Number.isInteger(a.piece) || a.piece < 0 || a.piece >= PIECE_COUNT) return 'piece-used';
    if (((this.remaining[a.p] >>> a.piece) & 1) === 0) return 'piece-used';
    const or = PIECES[a.piece].orientations[a.o];
    if (!or) return 'piece-used';
    if (a.x < 0 || a.y < 0 || a.x + or.w > this.size || a.y + or.h > this.size) return 'bounds';

    const cells = this.off[a.piece][a.o];
    const base = (a.y + 2) * this.stride + (a.x + 2);
    const first = this.placedCells[a.p] === 0;
    const frontier = first ? null : this.frontierFlags(a.p);
    const corner = this.startCorners[a.p];
    const b = this.board;
    const s = this.stride;
    const own = a.p + 1;

    let touches = false;
    for (let i = 0; i < cells.length; i++) {
      const idx = base + cells[i];
      if (b[idx] !== 0) return 'occupied';
      if (b[idx - 1] === own || b[idx + 1] === own || b[idx - s] === own || b[idx + s] === own) {
        return 'edge-touch';
      }
      if (frontier === null) {
        if (idx === corner) touches = true;
      } else if (frontier[idx] === 1) {
        touches = true;
      }
    }
    if (!touches) return first ? 'no-corner' : 'no-contact';
    return null;
  }

  tryApply(a: Action): boolean {
    if (this.over) return false;
    if (a.p !== this.turn) return false;

    if (a.kind === 'pass') {
      this.history.push(a);
      this.consecutivePasses++;
      this.advanceTurn();
      return true;
    }

    const { piece, o, x, y } = a;
    if (!Number.isInteger(piece) || piece < 0 || piece >= PIECE_COUNT) return false;
    if (((this.remaining[a.p] >>> piece) & 1) === 0) return false;
    const or = PIECES[piece].orientations[o];
    if (!or) return false;
    if (x < 0 || y < 0 || x + or.w > this.size || y + or.h > this.size) return false;

    const base = (y + 2) * this.stride + (x + 2);
    const first = this.placedCells[a.p] === 0;
    const frontier = first ? null : this.frontierFlags(a.p);
    if (!this.fits(a.p, this.off[piece][o], base, frontier, this.startCorners[a.p])) return false;

    const cells = this.off[piece][o];
    const val = a.p + 1;
    for (let k = 0; k < cells.length; k++) this.board[base + cells[k]] = val;

    this.remaining[a.p] &= ~(1 << piece);
    this.placedCells[a.p] += or.cells.length / 2;
    this.lastPiece[a.p] = piece;
    this.history.push(a);
    this.consecutivePasses = 0;
    this.advanceTurn();
    return true;
  }

  private activeCount(): number {
    let n = 0;
    for (let p = 0; p < this.playerCount; p++) if (this.remaining[p] !== 0) n++;
    return n;
  }

  private advanceTurn(): void {
    if (this.consecutivePasses >= this.activeCount()) {
      this.over = true;
      return;
    }
    let t = this.turn;
    do {
      t = (t + 1) % this.playerCount;
    } while (this.remaining[t] === 0);
    this.turn = t;
  }

  // ------------------------------------------------------------ (de)hydrate

  clone(): Game {
    const g = new Game(this.config);
    g.board.set(this.board);
    g.remaining = [...this.remaining];
    g.placedCells = [...this.placedCells];
    g.lastPiece = [...this.lastPiece];
    g.turn = this.turn;
    g.consecutivePasses = this.consecutivePasses;
    g.over = this.over;
    g.history = [...this.history];
    return g;
  }

  serialize(): SerializedGame {
    return { v: 1, config: { ...this.config }, history: [...this.history] };
  }

  static deserialize(s: SerializedGame): Game {
    if (s.v !== 1) throw new Error(`不支持的存档版本: ${s.v}`);
    return new Game(s.config, s.history);
  }
}
