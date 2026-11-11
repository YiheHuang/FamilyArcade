import { AI_MIN_DELAY, DIFFICULTY_BUDGET, type Difficulty } from '../ai/types';
import { Game } from '../game/engine';
import { difficultyLabel, t } from '../i18n';
import type { Action, GameConfig, PassMove, PlaceMove, SerializedGame } from '../game/types';
import type { GameScreenSync, SeatInfo } from '../ui/gameScreen';

/** computes a move for an AI seat; resolves null when the seat must pass */
export interface AiProvider {
  chooseMove(
    snapshot: SerializedGame,
    seat: number,
    difficulty: Difficulty,
    budgetMs: number,
  ): Promise<PlaceMove | null>;
}

/** bridge to the LAN layer; implemented in src/net (M4) */
export interface LanBridge {
  readonly role: 'host' | 'guest';
  /** guest → host; version = state version the move was based on */
  send(action: PlaceMove | PassMove, version: number): void;
  /** host → everyone; version = the action's index in the shared history */
  broadcast(action: Action, version: number): void;
  /** host: request everyone to restart after the game ended */
  onRematch(): void;
  /** guest: ask the host for a full state snapshot */
  requestSync(): void;
  /** host: push a full snapshot to one guest */
  sendSyncTo(slot: number): void;
  /** small text for the header, e.g. connection info */
  status(): string | null;
}

export interface SessionOptions {
  config: GameConfig;
  seats: SeatInfo[];
  /** seats controlled from this device */
  localSeats: number[];
  difficulty?: Difficulty;
  allowHint: boolean;
  allowUndo: boolean;
  ai?: AiProvider;
  net?: LanBridge;
  onExit(): void;
  onGameOver?(): void;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class Session {
  readonly opts: SessionOptions;
  game: Game;

  private thinking = false;
  private awaitingNet = false;
  private frozen = false;
  private hint: PlaceMove | null = null;
  private turnStartSnapshot: SerializedGame | null = null;
  private prevTurnSnapshot: SerializedGame | null = null;
  private mustPassCache: { key: string; value: boolean } | null = null;
  private pumpSeq = 0;
  private change: () => void = () => {};

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.game = new Game(opts.config);
  }

  bind(onChange: () => void): void {
    this.change = onChange;
  }

  start(): void {
    this.beginTurn();
  }

  // ------------------------------------------------------------------- sync

  getSync(): GameScreenSync {
    const over = this.game.over;
    const turn = this.game.turn;
    const canAct =
      !over &&
      !this.thinking &&
      !this.awaitingNet &&
      !this.frozen &&
      this.opts.localSeats.includes(turn) &&
      this.opts.seats[turn]?.kind === 'human';
    const aiLabel = this.opts.difficulty
      ? t('game.difficulty', { level: difficultyLabel(this.opts.difficulty) })
      : null;
    const social = this.opts.net
      ? {
          canUndoRequest:
            !over &&
            !this.frozen &&
            this.opts.localSeats.some((p) => this.game.history.some((a) => a.p === p)),
          // the host can always toggle: pausing must not disable "resume"
          canPause: this.opts.net.role === 'host' && !over,
          canNudge: !over && !this.frozen,
        }
      : null;
    return {
      game: this.game,
      seats: this.opts.seats,
      localSeats: this.opts.localSeats,
      canAct,
      mustPass: !over && this.mustPassCached(),
      thinking: this.thinking || this.awaitingNet,
      hint: this.hint,
      hintAvailable: canAct && this.opts.allowHint && !!this.opts.ai,
      undoAvailable: this.undoAvailable(),
      status: this.opts.net?.status() ?? aiLabel,
      rematchAvailable: over && (!this.opts.net || this.opts.net.role === 'host'),
      social,
      paused: this.frozen,
    };
  }

  // ------------------------------------------------------------- local input

  handlePlace(m: PlaceMove): boolean {
    if (this.game.over || this.frozen) return false;
    if (this.opts.net?.role === 'guest') {
      if (this.awaitingNet || this.game.turn !== m.p) return false;
      const probe = this.game.clone();
      if (!probe.tryApply(m)) return false;
      this.awaitingNet = true;
      this.hint = null;
      this.opts.net.send(m, this.game.history.length);
      this.armNetWatchdog();
      this.change();
      return true;
    }
    if (!this.canActLocal(m.p)) return false;
    if (!this.game.tryApply(m)) return false;
    this.afterLocalAction(m);
    return true;
  }

  handlePass(): void {
    if (this.game.over || this.frozen) return;
    const p = this.game.turn;
    if (this.opts.net?.role === 'guest') {
      if (this.awaitingNet || !this.opts.localSeats.includes(p)) return;
      if (!this.game.mustPass(p)) return;
      this.awaitingNet = true;
      this.opts.net.send({ kind: 'pass', p }, this.game.history.length);
      this.armNetWatchdog();
      this.change();
      return;
    }
    if (!this.canActLocal(p)) return;
    if (!this.game.mustPass(p)) return;
    if (!this.game.tryApply({ kind: 'pass', p })) return;
    this.afterLocalAction({ kind: 'pass', p });
  }

  async handleHint(): Promise<void> {
    const seat = this.game.turn;
    if (!this.canActLocal(seat) || !this.opts.ai || this.game.over) return;
    const move = await this.opts.ai.chooseMove(this.game.serialize(), seat, 'hard', 900);
    if (move && !this.game.over && this.game.turn === seat) {
      this.hint = move;
      this.change();
    }
  }

  handleUndo(): void {
    if (!this.undoAvailable()) return;
    const snap = this.prevTurnSnapshot;
    if (!snap) return;
    this.game = Game.deserialize(clone(snap));
    this.prevTurnSnapshot = null;
    this.turnStartSnapshot = null;
    this.hint = null;
    this.mustPassCache = null;
    this.awaitingNet = false;
    this.thinking = false;
    this.beginTurn();
  }

  handleRematch(): void {
    if (!this.game.over) return;
    if (this.opts.net && this.opts.net.role !== 'host') return;
    this.reset(new Game(this.opts.config));
    if (this.opts.net) this.opts.net.onRematch();
  }

  handleExit(): void {
    this.opts.onExit();
  }

  /** reset to a fresh game (also used by the LAN layer on rematch) */
  reset(game: Game): void {
    this.clearNetWatchdog();
    this.game = game;
    this.hint = null;
    this.awaitingNet = false;
    this.thinking = false;
    this.turnStartSnapshot = null;
    this.prevTurnSnapshot = null;
    this.mustPassCache = null;
    this.beginTurn();
  }

  // -------------------------------------------------------------- networking

  /** host: apply a guest action and broadcast it; guest: apply an authoritative action */
  netIngest(slot: number, action: Action, version?: number): void {
    const net = this.opts.net;
    if (!net || this.frozen) return;
    this.clearNetWatchdog();
    this.awaitingNet = false;
    if (net.role === 'host') {
      // state version must match the host's history: a stale or duplicated
      // request (from a dropped/reconnected guest) is rejected and answered
      // with a fresh snapshot instead of corrupting the game
      if (version !== undefined && version !== this.game.history.length) {
        net.sendSyncTo(slot);
        return;
      }
      if (action.p !== slot || this.game.turn !== slot || this.game.over) return;
      if (action.kind === 'pass' && !this.game.mustPass(slot)) return;
      if (!this.game.tryApply(action)) return;
      this.hint = null;
      this.mustPassCache = null;
      net.broadcast(action, this.game.history.length - 1);
      this.beginTurn();
    } else {
      // a gap in the stream means we missed something: resync instead of
      // applying an action out of order
      if (version !== undefined && version !== this.game.history.length) {
        net.requestSync();
        return;
      }
      if (this.game.turn !== action.p || this.game.over) return;
      if (action.kind === 'pass' && !this.game.mustPass(action.p)) return;
      if (!this.game.tryApply(action)) return;
      this.hint = null;
      this.mustPassCache = null;
      this.beginTurn();
    }
  }

  /** called by the LAN layer when a full sync arrived from the host */
  netSync(snapshot: SerializedGame): void {
    this.clearNetWatchdog();
    this.game = Game.deserialize(snapshot);
    this.awaitingNet = false;
    this.hint = null;
    this.mustPassCache = null;
    this.beginTurn();
  }

  /** LAN: freeze the table (pause, or while an undo vote is pending) */
  setFrozen(on: boolean): void {
    if (this.frozen === on) return;
    this.frozen = on;
    this.change();
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  /** LAN host: apply a rollback to a shorter history and sync everyone */
  rollbackHistory(toIndex: number): void {
    const config = this.game.config;
    const history = this.game.history.slice(0, Math.max(0, toIndex));
    this.game = new Game(config, history);
    this.hint = null;
    this.mustPassCache = null;
    this.awaitingNet = false;
    this.thinking = false;
    this.beginTurn();
  }

  /** called by the LAN layer when the room state changed (seats online/offline) */
  poke(): void {
    this.change();
  }

  // ------------------------------------------------------------------ engine

  private canActLocal(p: number): boolean {
    return (
      !this.game.over &&
      this.opts.localSeats.includes(p) &&
      this.opts.seats[p]?.kind === 'human' &&
      this.game.turn === p
    );
  }

  private afterLocalAction(action: Action): void {
    this.hint = null;
    this.mustPassCache = null;
    if (this.opts.net?.role === 'host') {
      this.opts.net.broadcast(action, this.game.history.length - 1);
    }
    this.beginTurn();
  }

  private undoAvailable(): boolean {
    return (
      this.opts.allowUndo &&
      !this.opts.net &&
      this.prevTurnSnapshot !== null &&
      !this.game.over &&
      this.canActLocal(this.game.turn)
    );
  }

  private mustPassCached(): boolean {
    const key = `${this.game.history.length}:${this.game.turn}`;
    if (this.mustPassCache?.key !== key) {
      this.mustPassCache = { key, value: this.game.mustPass(this.game.turn) };
    }
    return this.mustPassCache.value;
  }

  private netWatchdog: ReturnType<typeof setTimeout> | undefined;

  /** after sending a request, expect an answer within a few seconds */
  private armNetWatchdog(ms = 5000): void {
    this.clearNetWatchdog();
    this.netWatchdog = setTimeout(() => {
      this.netWatchdog = undefined;
      if (!this.awaitingNet) return;
      this.awaitingNet = false;
      this.change();
      this.opts.net?.requestSync();
    }, ms);
  }

  private clearNetWatchdog(): void {
    if (this.netWatchdog !== undefined) {
      clearTimeout(this.netWatchdog);
      this.netWatchdog = undefined;
    }
  }

  private beginTurn(): void {
    const seq = ++this.pumpSeq;
    const g = this.game;
    if (g.over) {
      this.thinking = false;
      this.change();
      this.opts.onGameOver?.();
      return;
    }
    const seat = this.opts.seats[g.turn];
    if (!seat) return;

    if (seat.kind === 'ai') {
      this.thinking = true;
      this.change();
      setTimeout(() => void this.aiTurn(seq), AI_MIN_DELAY);
      return;
    }

    this.thinking = seat.kind === 'remote';
    if (seat.kind === 'human' && this.opts.localSeats.includes(g.turn) && this.opts.allowUndo && !this.opts.net) {
      this.prevTurnSnapshot = this.turnStartSnapshot;
      this.turnStartSnapshot = g.serialize();
    }
    this.change();
  }

  private async aiTurn(seq: number): Promise<void> {
    const g = this.game;
    const seat = g.turn;
    if (seq !== this.pumpSeq || g.over) return;

    if (g.mustPass(seat)) {
      // no worker roundtrip needed — pass directly
      setTimeout(() => {
        if (seq !== this.pumpSeq || this.game.over || this.game.turn !== seat) return;
        const a: PassMove = { kind: 'pass', p: seat };
        if (this.game.tryApply(a)) {
          this.hint = null;
          this.mustPassCache = null;
          if (this.opts.net?.role === 'host') {
            this.opts.net.broadcast(a, this.game.history.length - 1);
          }
          this.beginTurn();
        }
      }, 360);
      return;
    }

    const ai = this.opts.ai;
    if (!ai) {
      this.thinking = false;
      this.change();
      return;
    }

    try {
      const difficulty = this.opts.difficulty ?? 'normal';
      const move = await ai.chooseMove(g.serialize(), seat, difficulty, DIFFICULTY_BUDGET[difficulty]);
      if (seq !== this.pumpSeq || this.game.over || this.game.turn !== seat) return;
      if (move && this.game.tryApply(move)) {
        this.hint = null;
        this.mustPassCache = null;
        if (this.opts.net?.role === 'host') {
          this.opts.net.broadcast(move, this.game.history.length - 1);
        }
        this.beginTurn();
      } else {
        this.thinking = false;
        this.change();
      }
    } catch (err) {
      console.error('ai error', err);
      this.thinking = false;
      this.change();
    }
  }
}
