import {
  applyMove,
  chooseMove,
  setupGame,
  viewFor,
  type AiLevel,
  type ClientState,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerConfig,
} from '@splendor/engine';
import type { ClientLike, SeatInfo, ServerMsg } from './protocol';

export interface RoomSeat {
  /** 座位意图：human = 留给人类（含 已加入/等待中/掉线）；ai = 电脑 */
  kind: 'human' | 'ai';
  aiLevel: AiLevel;
  name: string;
  client: ClientLike | null;
  /** 重连凭证（首次加入时生成） */
  token: string | null;
  disconnectedAt: number | null;
  /** 掉线超过阈值后由服务器临时托管 */
  autoPlay: boolean;
}

export interface Room {
  code: string;
  hostSeat: number;
  seats: RoomSeat[];
  spectators: Set<ClientLike>;
  game: GameState | null;
  started: boolean;
  createdAt: number;
  updatedAt: number;
  /** 思考时间（秒，0=不限）——纯提示，服务器不据此强制任何动作 */
  turnSeconds: number;
  /** 当前回合开始的时刻（ms，用于计算读秒） */
  turnStartedAt: number;
  /** 悔棋快照栈（每次人类落子前压栈，保留最近 30 条） */
  history: Array<{ state: GameState; seat: number; turn: number }>;
  /** 进行中的悔棋请求 */
  undo: { requester: number; pending: Set<number>; timer: ReturnType<typeof setTimeout> | null } | null;
}

export interface RoomOptions {
  aiDelayMs?: number;
  autoplayAfterMs?: number;
  roomTtlMs?: number;
  random?: () => number;
  now?: () => number;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 可选思考时间档位（秒）；0 = 不限 */
export const TURN_LIMIT_CHOICES = [0, 30, 45, 60, 90];

function makeCode(random: () => number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

function seatKindForInfo(seat: RoomSeat): SeatInfo['kind'] {
  if (seat.kind === 'ai') return 'ai';
  return seat.client ? 'human' : 'open';
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private tryCount = 0;
  private readonly aiDelayMs: number;
  private readonly autoplayAfterMs: number;
  private readonly roomTtlMs: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private persistHook: (() => void) | null = null;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoplayTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: RoomOptions = {}) {
    this.aiDelayMs = opts.aiDelayMs ?? 4400;
    this.autoplayAfterMs = opts.autoplayAfterMs ?? 15000;
    this.roomTtlMs = opts.roomTtlMs ?? 24 * 3600 * 1000;
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  setPersistHook(hook: (() => void) | null): void {
    this.persistHook = hook;
  }

  private changed(room?: Room): void {
    if (room) room.updatedAt = this.now();
    this.persistHook?.();
  }

  // ---------------- 房间生命周期 ----------------

  createRoom(client: ClientLike, name: string, seatCount: number, turnSeconds = 60): Room {
    if (seatCount < 2 || seatCount > 4) throw new Error('E_PLAYERS_RANGE');
    const limit = TURN_LIMIT_CHOICES.includes(turnSeconds) ? turnSeconds : 60;
    let code = '';
    for (let i = 0; i < 50; i++) {
      code = makeCode(this.random);
      if (!this.rooms.has(code)) break;
    }
    if (!code || this.rooms.has(code)) throw new Error('E_CODE_GEN');
    const now = this.now();
    const seats: RoomSeat[] = Array.from({ length: seatCount }, (_, i) => ({
      kind: 'human',
      aiLevel: 'normal',
      name: i === 0 ? name.trim() || '房主' : `玩家${i + 1}`,
      client: i === 0 ? client : null,
      token: i === 0 ? crypto.randomUUID() : null,
      disconnectedAt: null,
      autoPlay: false,
    }));
    const room: Room = {
      code,
      hostSeat: 0,
      seats,
      spectators: new Set(),
      game: null,
      started: false,
      createdAt: now,
      updatedAt: now,
      turnSeconds: limit,
      turnStartedAt: now,
      history: [],
      undo: null,
    };
    this.rooms.set(code, room);
    this.changed(room);
    this.sendRoom(room, client);
    return room;
  }

  private roomByCode(code: string): Room {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new Error('E_ROOM_NOT_FOUND');
    return room;
  }

  /** 加入（或带 token 重连） */
  join(client: ClientLike, code: string, name: string, token?: string): { room: Room; seat: number | null; token: string | null; spectator: boolean } {
    const room = this.roomByCode(code);
    // 重连
    if (token) {
      const idx = room.seats.findIndex((s) => s.token === token);
      if (idx >= 0) return this.attach(room, client, idx);
      throw new Error('E_BAD_TOKEN');
    }
    // 若同名且掉线，允许无 token 快速回到原座位（家庭场景友好）
    const sameName = room.seats.findIndex((s) => s.kind === 'human' && !s.client && s.disconnectedAt != null && s.name === name.trim());
    if (sameName >= 0) return this.attach(room, client, sameName);

    const free = room.seats.findIndex((s) => s.kind === 'human' && !s.client && s.disconnectedAt == null);
    if (free >= 0) {
      const seat = room.seats[free]!;
      seat.token = crypto.randomUUID();
      if (name.trim()) seat.name = name.trim();
      return this.attach(room, client, free);
    }
    // 坐满了 -> 观战
    room.spectators.add(client);
    this.changed(room);
    this.sendRoom(room, client);
    return { room, seat: null, token: null, spectator: true };
  }

  spectate(client: ClientLike, code: string): Room {
    const room = this.roomByCode(code);
    room.spectators.add(client);
    this.changed(room);
    this.sendRoom(room, client);
    if (room.game) this.sendState(room, client, []);
    return room;
  }

  private attach(room: Room, client: ClientLike, seatIndex: number): { room: Room; seat: number; token: string | null; spectator: boolean } {
    const seat = room.seats[seatIndex]!;
    seat.client = client;
    seat.disconnectedAt = null;
    seat.autoPlay = false;
    if (!seat.token) seat.token = crypto.randomUUID();
    this.changed(room);
    this.sendRoom(room, client);
    if (room.game) this.sendState(room, client, []);
    this.broadcastRoom(room);
    this.scheduleAi(room);
    return { room, seat: seatIndex, token: seat.token, spectator: false };
  }

  disconnect(client: ClientLike): void {
    for (const room of this.rooms.values()) {
      let touched = false;
      for (const seat of room.seats) {
        if (seat.client === client) {
          seat.client = null;
          seat.disconnectedAt = this.now();
          touched = true;
        }
      }
      if (room.spectators.delete(client)) touched = true;
      if (touched) {
        this.changed(room);
        this.broadcastRoom(room);
      }
    }
  }

  leave(client: ClientLike): void {
    // 主动离开：释放座位（保留 token 以便“快速回座”仅在掉线时允许）
    for (const room of this.rooms.values()) {
      let touched = false;
      for (const seat of room.seats) {
        if (seat.client === client) {
          seat.client = null;
          seat.disconnectedAt = this.now();
          touched = true;
        }
      }
      if (room.spectators.delete(client)) touched = true;
      if (touched) {
        this.changed(room);
        this.broadcastRoom(room);
      }
    }
  }

  // ---------------- 大厅操作 ----------------

  setSeat(client: ClientLike, room: Room, seatIndex: number, kind: 'open' | 'ai', aiLevel: AiLevel = 'normal'): void {
    this.requireHost(room, client);
    if (room.started) throw new Error('E_STARTED_SEATS');
    const seat = room.seats[seatIndex];
    if (!seat) throw new Error('E_BAD_SEAT');
    if (kind === 'ai') {
      if (seat.client) throw new Error('E_SEAT_TAKEN');
      seat.kind = 'ai';
      seat.aiLevel = aiLevel;
      if (!seat.name || /^玩家\d+$/.test(seat.name)) seat.name = `电脑(${aiLevel})`;
    } else {
      if (seat.client) throw new Error('E_SEAT_TAKEN');
      seat.kind = 'human';
      seat.token = null;
    }
    this.changed(room);
    this.broadcastRoom(room);
  }

  start(client: ClientLike, room: Room): void {
    this.requireHost(room, client);
    if (room.started) throw new Error('E_STARTED');
    const openNames = room.seats
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === 'human' && !s.client)
      .map(({ i }) => `座位 ${i + 1}`);
    if (openNames.length > 0) throw new Error(`E_OPEN_SEATS:${openNames.map((n) => n.replace('座位 ', '')).join(',')}`);
    const players: PlayerConfig[] = room.seats.map((s) => ({
      name: s.name,
      kind: s.kind === 'ai' ? 'ai' : 'human',
      aiLevel: s.aiLevel,
    }));
    const game = setupGame(players, {});
    room.game = game;
    room.started = true;
    room.turnStartedAt = this.now();
    this.changed(room);
    this.broadcastRoom(room);
    this.broadcastState(room, [{ type: 'turn-start', seat: game.current }]);
    this.scheduleAi(room);
  }

  private requireHost(room: Room, client: ClientLike): void {
    if (room.seats[room.hostSeat]?.client !== client) throw new Error('E_HOST_ONLY');
  }

  // ---------------- 对局操作 ----------------

  move(client: ClientLike, room: Room, move: Move): void {
    if (!room.game || !room.started) throw new Error('E_NOT_STARTED');
    const seatIndex = room.seats.findIndex((s) => s.client === client);
    if (seatIndex < 0) throw new Error('E_SPECTATOR');
    if (room.game.current !== seatIndex) throw new Error('E_NOT_YOUR_TURN');
    const seat = room.seats[seatIndex]!;
    if (seat.autoPlay) throw new Error('E_AUTOPLAY');
    this.pushHistory(room, seatIndex);
    const res = applyMove(room.game, move);
    if (res.error) {
      room.history.pop();
      throw new Error(res.error);
    }
    this.markTurnStarted(room);
    room.game = res.state;
    this.changed(room);
    this.broadcastState(room, res.events, move);
    this.scheduleAi(room);
  }

  /** 落子前压入悔棋快照（仅保留最近 30 条） */
  private pushHistory(room: Room, seat: number): void {
    if (!room.game) return;
    room.history.push({ state: room.game, seat, turn: room.game.turn });
    if (room.history.length > 30) room.history.shift();
  }

  /** 悔棋：请求（需要其他真人同意；AI / 掉线托管座位视为同意） */
  undoRequest(client: ClientLike, room: Room): void {
    if (!room.game || !room.started) throw new Error('E_NOT_STARTED');
    const seat = room.seats.findIndex((s) => s.client === client);
    if (seat < 0) throw new Error('E_SPECTATOR');
    if (room.game.phase === 'ended') throw new Error('E_GAME_ENDED');
    if (room.undo) throw new Error('E_UNDO_PENDING');
    const idx = room.history.map((h) => h.seat).lastIndexOf(seat);
    if (idx < 0) throw new Error('E_UNDO_NO_TARGET');

    const voters = room.seats
      .map((_, i) => i)
      .filter((i) => i !== seat && room.seats[i]!.kind === 'human' && room.seats[i]!.client != null && !room.seats[i]!.autoPlay);
    const pending = new Set<number>(voters);
    room.undo = { requester: seat, pending, timer: null };
    this.broadcastMsg(room, { t: 'undo:ask', seat, name: room.seats[seat]!.name, voters });
    this.broadcastRoom(room);
    if (pending.size === 0) {
      this.applyUndo(room, idx);
      return;
    }
    // 45 秒无响应视为同意（家庭场景：不想让弹窗卡住别人）
    room.undo.timer = setTimeout(() => {
      if (room.undo && room.undo.requester === seat) this.applyUndo(room, idx);
    }, 45000);
    room.undo.timer.unref?.();
  }

  /** 悔棋：投票 */
  undoRespond(client: ClientLike, room: Room, accept: boolean): void {
    if (!room.undo) return;
    const seat = room.seats.findIndex((s) => s.client === client);
    if (seat < 0) throw new Error('E_SPECTATOR');
    if (!room.undo.pending.has(seat)) return;
    room.undo.pending.delete(seat);
    if (!accept) {
      const req = room.undo.requester;
      this.clearUndo(room);
      this.broadcastMsg(room, { t: 'undo:result', ok: false, seat: req });
      return;
    }
    if (room.undo.pending.size === 0) {
      const idx = room.history.map((h) => h.seat).lastIndexOf(room.undo.requester);
      this.applyUndo(room, idx);
    }
  }

  /** 悔棋：请求者取消 */
  undoCancel(client: ClientLike, room: Room): void {
    if (!room.undo) return;
    const seat = room.seats.findIndex((s) => s.client === client);
    if (seat !== room.undo.requester) return;
    const req = room.undo.requester;
    this.clearUndo(room);
    this.broadcastMsg(room, { t: 'undo:result', ok: false, seat: req });
  }

  private clearUndo(room: Room): void {
    if (room.undo?.timer) clearTimeout(room.undo.timer);
    room.undo = null;
  }

  private applyUndo(room: Room, idx: number): void {
    const entry = room.history[idx];
    if (!room.game || !entry) {
      this.clearUndo(room);
      return;
    }
    const requester = room.undo?.requester ?? entry.seat;
    this.clearUndo(room);
    room.game = entry.state;
    room.history = room.history.slice(0, idx);
    room.turnStartedAt = this.now();
    this.changed(room);
    this.broadcastMsg(room, { t: 'undo:result', ok: true, seat: requester });
    this.broadcastState(room, [{ type: 'turn-start', seat: room.game.current }]);
    this.scheduleAi(room);
  }

  /** 回合推进：重置读秒基准（纯提示计时） */
  private markTurnStarted(room: Room): void {
    room.turnStartedAt = this.now();
  }

  // ---------------- AI 与托管 ----------------

  private scheduleAi(room: Room): void {
    if (!room.game || room.game.phase === 'ended') return;
    const seat = room.seats[room.game.current];
    if (!seat) return;
    const isBot = seat.kind === 'ai' || seat.autoPlay;
    if (!isBot) return;
    if (this.timers.has(room.code)) return;
    const timer = setTimeout(() => {
      this.timers.delete(room.code);
      this.stepAi(room);
    }, this.aiDelayMs);
    this.timers.set(room.code, timer);
  }

  private stepAi(room: Room): void {
    const game = room.game;
    if (!game || game.phase === 'ended') return;
    const seat = room.seats[game.current];
    if (!seat) return;
    if (!(seat.kind === 'ai' || seat.autoPlay)) return;
    const level: AiLevel = seat.kind === 'ai' ? seat.aiLevel : 'normal';
    const move = chooseMove(game, level);
    const res = applyMove(game, move);
    if (res.error) {
      // 理论上不应发生；兜底跳过，避免死锁
      const pass = applyMove(game, { type: 'pass' });
      if (pass.error) return;
      this.markTurnStarted(room);
      room.game = pass.state;
      this.changed(room);
      this.broadcastState(room, pass.events, { type: 'pass' });
    } else {
      this.markTurnStarted(room);
      room.game = res.state;
      this.changed(room);
      this.broadcastState(room, res.events, move);
    }
    this.scheduleAi(room);
  }

  /** 掉线托管看门狗（index.ts 每 2 秒调用一次） */
  watchdog(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (!room.game || !room.started) continue;
      const seat = room.seats[room.game.current];
      if (!seat || seat.kind !== 'human') continue;
      if (seat.client) {
        if (seat.autoPlay) {
          seat.autoPlay = false;
          this.changed(room);
          this.broadcastRoom(room);
        }
        continue;
      }
      if (seat.disconnectedAt != null && now - seat.disconnectedAt >= this.autoplayAfterMs && !seat.autoPlay) {
        seat.autoPlay = true;
        this.changed(room);
        this.broadcastRoom(room);
        this.scheduleAi(room);
      }
    }
    // 清理过期房间
    for (const [code, room] of this.rooms) {
      const hasClients = room.seats.some((s) => s.client) || room.spectators.size > 0;
      if (!hasClients && now - room.updatedAt > this.roomTtlMs) {
        this.clearUndo(room);
        this.rooms.delete(code);
        const t = this.timers.get(code);
        if (t) clearTimeout(t);
        this.timers.delete(code);
        this.changed();
      }
    }
  }

  startWatchdog(): void {
    if (this.autoplayTimer) return;
    this.autoplayTimer = setInterval(() => this.watchdog(), 2000);
    this.autoplayTimer.unref?.();
    if (!this.clockTimer) {
      this.clockTimer = setInterval(() => this.clockTick(), 1000);
      this.clockTimer.unref?.();
    }
  }

  stopWatchdog(): void {
    if (this.autoplayTimer) clearInterval(this.autoplayTimer);
    this.autoplayTimer = null;
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const room of this.rooms.values()) this.clearUndo(room);
  }

  /**
   * 回合读秒：服务器权威，每秒向房间广播一次剩余秒数（纯提示，超时不强制任何动作）。
   * 仅对"人类座位 + 有时限 + 对局进行中 + 房间里有活人"的回合计时。
   */
  clockTick(): void {
    for (const room of this.rooms.values()) {
      if (!room.game || !room.started || room.game.phase === 'ended') continue;
      if (room.turnSeconds <= 0) continue;
      const seat = room.seats[room.game.current];
      if (!seat || seat.kind !== 'human') continue;
      const hasClients = seat.client != null || room.seats.some((s) => s.client) || room.spectators.size > 0;
      if (!hasClients) continue;
      const elapsedSec = Math.floor((this.now() - room.turnStartedAt) / 1000);
      const left = room.turnSeconds - elapsedSec;
      const msg: ServerMsg = {
        t: 'clock',
        seat: room.game.current,
        remaining: Math.max(0, left),
        over: Math.max(0, -left),
      };
      this.broadcastMsg(room, msg);
    }
  }

  /** 向房间内所有客户端（含观战）发送一条消息 */
  broadcastMsg(room: Room, msg: ServerMsg): void {
    const seen = new Set<ClientLike>();
    for (const seat of room.seats) {
      if (seat.client && !seen.has(seat.client)) {
        seen.add(seat.client);
        seat.client.send(msg);
      }
    }
    for (const sp of room.spectators) {
      if (!seen.has(sp)) {
        seen.add(sp);
        sp.send(msg);
      }
    }
  }

  // ---------------- 广播 ----------------

  seatInfo(room: Room): SeatInfo[] {
    return room.seats.map((s, i) => {
      const info: SeatInfo = {
        seat: i,
        kind: seatKindForInfo(s),
        name: s.name,
        connected: !!s.client,
        aiLevel: s.aiLevel,
      };
      if (s.autoPlay) info.autoPlaying = true;
      return info;
    });
  }

  private msgRoom(room: Room, forClient: ClientLike): ServerMsg {
    const seat = room.seats.findIndex((s) => s.client === forClient);
    const spectator = seat < 0;
    return {
      t: 'room',
      code: room.code,
      you: { seat: seat >= 0 ? seat : null, token: seat >= 0 ? (room.seats[seat]!.token ?? null) : null, spectator },
      hostSeat: room.hostSeat,
      seats: this.seatInfo(room),
      started: room.started,
      turnSeconds: room.turnSeconds,
    };
  }

  private sendRoom(room: Room, client: ClientLike): void {
    client.send(this.msgRoom(room, client));
  }

  broadcastRoom(room: Room): void {
    const seen = new Set<ClientLike>();
    for (const seat of room.seats) {
      if (seat.client && !seen.has(seat.client)) {
        seen.add(seat.client);
        this.sendRoom(room, seat.client);
      }
    }
    for (const sp of room.spectators) {
      if (!seen.has(sp)) {
        seen.add(sp);
        this.sendRoom(room, sp);
      }
    }
  }

  /** 事件按座位脱敏：他人盲抽预定不泄露卡牌 id */
  sanitizeEvents(events: GameEvent[], forSeat: number | null): GameEvent[] {
    return events.map((e) => {
      if (e.type === 'card-reserved' && e.fromDeck && e.seat !== forSeat) {
        return { ...e, cardId: -1 };
      }
      return e;
    });
  }

  private sendState(room: Room, client: ClientLike, events: GameEvent[], move?: Move): void {
    if (!room.game) return;
    const seatIndex = room.seats.findIndex((s) => s.client === client);
    const view: ClientState = viewFor(room.game, seatIndex >= 0 ? seatIndex : null, { hideReserved: true });
    const msg: ServerMsg = {
      t: 'state',
      view,
      events: this.sanitizeEvents(events, seatIndex >= 0 ? seatIndex : null),
      moveCount: room.game.moves.length,
    };
    // 复盘用：带上本步走法；对局结束时才下发种子（中途下发会泄露牌堆顺序）
    if (move) msg.move = move;
    if (room.game.phase === 'ended') msg.seed = room.game.seed;
    client.send(msg);
  }

  broadcastState(room: Room, events: GameEvent[], move?: Move): void {
    const seen = new Set<ClientLike>();
    for (let i = 0; i < room.seats.length; i++) {
      const client = room.seats[i]!.client;
      if (!client || seen.has(client)) continue;
      seen.add(client);
      this.sendState(room, client, events, move);
    }
    for (const sp of room.spectators) {
      if (!seen.has(sp)) {
        seen.add(sp);
        this.sendState(room, sp, events, move);
      }
    }
  }

  // ---------------- 持久化 ----------------

  toSnapshot(): unknown {
    return {
      savedAt: new Date().toISOString(),
      rooms: [...this.rooms.values()].map((room) => ({
        code: room.code,
        hostSeat: room.hostSeat,
        started: room.started,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        turnSeconds: room.turnSeconds,
        turnStartedAt: room.turnStartedAt,
        seats: room.seats.map((s) => ({
          kind: s.kind,
          aiLevel: s.aiLevel,
          name: s.name,
          token: s.token,
          disconnectedAt: s.disconnectedAt,
        })),
        game: room.game,
      })),
    };
  }

  fromSnapshot(snap: unknown): number {
    const doc = snap as {
      rooms?: Array<{
        code: string;
        hostSeat: number;
        started: boolean;
        createdAt: number;
        updatedAt: number;
        seats: Array<{ kind: 'human' | 'ai'; aiLevel: AiLevel; name: string; token: string | null; disconnectedAt: number | null }>;
        game: GameState | null;
        turnSeconds?: number;
        turnStartedAt?: number;
      }>;
    };
    if (!doc || !Array.isArray(doc.rooms)) return 0;
    let loaded = 0;
    for (const r of doc.rooms) {
      if (!r?.code || !Array.isArray(r.seats)) continue;
      const room: Room = {
        code: r.code,
        hostSeat: r.hostSeat ?? 0,
        seats: r.seats.map((s) => ({
          kind: s.kind === 'ai' ? 'ai' : 'human',
          aiLevel: s.aiLevel ?? 'normal',
          name: s.name ?? '玩家',
          client: null,
          token: s.token ?? null,
          disconnectedAt: s.disconnectedAt ?? Date.now(),
          autoPlay: false,
        })),
        spectators: new Set(),
        game: r.game ?? null,
        started: !!r.started,
        createdAt: r.createdAt ?? Date.now(),
        updatedAt: r.updatedAt ?? Date.now(),
        turnSeconds: TURN_LIMIT_CHOICES.includes(r.turnSeconds ?? 60) ? (r.turnSeconds ?? 60) : 60,
        turnStartedAt: r.turnStartedAt ?? Date.now(),
        history: [],
        undo: null,
      };
      this.rooms.set(room.code, room);
      loaded++;
    }
    return loaded;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
