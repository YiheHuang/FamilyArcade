/**
 * Shared LAN helpers for Family Arcade.
 *
 * Wire protocol:
 *   client -> server: { t:"join", room, code?, name, token?, host? }
 *   server -> client: { t:"welcome", id, host }
 *   server -> room:   { t:"peer-join", id, name, token, code, host }
 *   server -> room:   { t:"peer-leave", id }
 *   any -> any:       { t, from?, to?, ...payload }
 *
 * The server assigns the first `host:true` client as host. Host messages go to
 * everyone (or to a particular `to` id). Guest messages go only to the host.
 * That keeps intents private and makes a spoofed guest harmless.
 */

export type LanStatus = 'connecting' | 'open' | 'closed';

export interface LanPeer {
  seat: number;
  name: string;
  token: string;
  clientId: number | null;
  connected: boolean;
  host: boolean;
}

export interface LanPublicPeer {
  seat: number;
  name: string;
  connected: boolean;
  host: boolean;
}

export interface LanHostOptions {
  wsUrl: string;
  room: string;
  code?: string;
  name?: string;
  maxPlayers: number;
}

export interface LanGuestOptions {
  wsUrl: string;
  room: string;
  code?: string;
  name: string;
}

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

function makeSocket(url: string): SocketLike {
  if (typeof WebSocket === 'undefined') {
    throw new Error('LAN needs a browser with WebSocket support');
  }
  return new WebSocket(url) as unknown as SocketLike;
}

function clientToken(): string {
  const key = 'familyarcade.client.id';
  try {
    let token = localStorage.getItem(key);
    if (!token) {
      token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, token);
    }
    return token;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function randomRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Wait until the socket is open (or reject with a useful message). */
function opened(socket: SocketLike, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('LAN connection timed out'));
      }
    }, timeoutMs);
    socket.onopen = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('LAN connection failed'));
    };
  });
}

export class LanHost {
  readonly room: string;
  readonly code: string;
  readonly roomId = randomRoomCode();
  players: LanPeer[] = [];
  status: LanStatus = 'connecting';
  started = false;
  hostToken = '';
  private socket: SocketLike | null = null;
  private messageHandlers = new Set<(msg: Record<string, unknown>) => void>();
  private playerHandlers = new Set<(players: LanPublicPeer[]) => void>();
  private intentHandler: ((seat: number, intent: unknown) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  private constructor(room: string, code: string, name: string, maxPlayers: number) {
    this.room = room;
    this.code = code;
    this.players = [
      { seat: 0, name, token: 'host', clientId: null, connected: true, host: true },
    ];
    for (let seat = 1; seat < maxPlayers; seat++) {
      this.players.push({
        seat,
        name: `Player ${seat + 1}`,
        token: `open-${seat}`,
        clientId: null,
        connected: false,
        host: false,
      });
    }
  }

  static async create(options: LanHostOptions): Promise<LanHost> {
    const host = new LanHost(
      options.room,
      options.code ?? randomRoomCode(),
      options.name ?? 'Host',
      Math.max(2, options.maxPlayers),
    );
    await host.connect(options.wsUrl);
    return host;
  }

  private async connect(wsUrl: string): Promise<void> {
    const socket = makeSocket(wsUrl);
    this.socket = socket;
    const welcome = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LAN host handshake timed out')), 8000);
      socket.onmessage = (event) => {
        const msg = safeParse(event.data);
        if (!msg) return;
        if (msg.t === 'welcome') {
          this.hostToken = String(msg.id);
          clearTimeout(timer);
          resolve();
          return;
        }
        this.dispatch(msg);
      };
      socket.onclose = () => {
        this.status = 'closed';
        clearTimeout(timer);
        this.closeHandler?.();
        reject(new Error('LAN host connection closed'));
      };
    });
    await opened(socket);
    socket.send(
      JSON.stringify({
        t: 'join',
        room: this.room,
        code: this.code,
        name: this.players[0].name,
        host: true,
        token: 'host',
      }),
    );
    await welcome;
    this.status = 'open';
  }

  onChange(fn: (players: LanPublicPeer[]) => void): () => void {
    this.playerHandlers.add(fn);
    fn(this.publicPlayers());
    return () => this.playerHandlers.delete(fn);
  }

  onMessage(fn: (msg: Record<string, unknown>) => void): () => void {
    this.messageHandlers.add(fn);
    return () => this.messageHandlers.delete(fn);
  }

  onIntent(fn: (seat: number, intent: unknown) => void): void {
    this.intentHandler = fn;
  }

  onClose(fn: () => void): void {
    this.closeHandler = fn;
  }

  publicPlayers(): LanPublicPeer[] {
    return this.players.map(({ seat, name, connected, host }) => ({
      seat,
      name,
      connected,
      host,
    }));
  }

  private seatOf(clientId: number): number {
    return this.players.find((player) => player.clientId === clientId)?.seat ?? -1;
  }

  private dispatch(msg: Record<string, unknown>): void {
    const kind = String(msg.t ?? '');
    const id =
      typeof msg.id === 'number' ? msg.id : typeof msg.from === 'number' ? msg.from : -1;
    if (kind === 'peer-join' && id !== Number(this.hostToken)) {
      const token = String(msg.token ?? '');
      const code = String(msg.code ?? '');
      if (this.code && code && code !== this.code) {
        this.sendTo(id, { t: 'rejected', reason: 'wrong-code' });
        return;
      }
      let player = this.players.find((item) => !item.host && item.token === token && token);
      if (!player) {
        player = this.players.find((item) => !item.host && !item.connected && item.token.startsWith('open-'));
      }
      if (!player) {
        this.sendTo(id, { t: 'rejected', reason: 'room-full' });
        return;
      }
      player.clientId = id;
      player.connected = true;
      if (typeof msg.name === 'string' && msg.name.trim()) player.name = msg.name.trim().slice(0, 18);
      player.token = token || player.token;
      this.sendTo(id, { t: 'seat', seat: player.seat, code: this.code, room: this.roomId });
      this.emitPlayers();
      return;
    }
    if (kind === 'peer-leave') {
      const player = this.players.find((item) => item.clientId === id);
      if (player) {
        player.connected = false;
        player.clientId = null;
        this.emitPlayers();
      }
      return;
    }
    if (kind === 'intent') {
      const seat = this.seatOf(id);
      if (seat >= 0 && this.started) this.intentHandler?.(seat, msg.intent);
      return;
    }
    for (const handler of this.messageHandlers) handler(msg);
  }

  private emitPlayers(): void {
    const publicPlayers = this.publicPlayers();
    for (const handler of this.playerHandlers) handler(publicPlayers);
  }

  private sendTo(clientId: number, message: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify({ ...message, to: clientId }));
  }

  broadcast(message: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify(message));
  }

  start(extra: Record<string, unknown> = {}): void {
    this.started = true;
    this.broadcast({ t: 'start', players: this.publicPlayers(), code: this.code, room: this.roomId, ...extra });
  }

  sendView(seat: number, view: unknown): void {
    const player = this.players.find((item) => item.seat === seat);
    if (!player?.clientId) return;
    this.sendTo(player.clientId, { t: 'view', seat, view });
  }

  sendAll(view: unknown): void {
    this.broadcast({ t: 'view', view });
  }

  sendResult(result: unknown): void {
    this.broadcast({ t: 'result', result });
  }

  sendLobby(extra: Record<string, unknown> = {}): void {
    this.broadcast({ t: 'lobby', players: this.publicPlayers(), code: this.code, room: this.roomId, ...extra });
  }

  close(): void {
    this.status = 'closed';
    this.socket?.close();
  }
}

export class LanGuest {
  readonly room: string;
  status: LanStatus = 'connecting';
  seat = -1;
  players: LanPublicPeer[] = [];
  started = false;
  clientId = 0;
  code = '';
  roomId = '';
  error: string | null = null;
  private socket: SocketLike | null = null;
  private viewHandler: ((view: unknown, seat: number) => void) | null = null;
  private resultHandler: ((result: unknown) => void) | null = null;
  private startHandler: ((players: LanPublicPeer[]) => void) | null = null;
  private playersHandler: ((players: LanPublicPeer[]) => void) | null = null;
  private errorHandler: ((reason: string) => void) | null = null;

  private constructor(room: string) {
    this.room = room;
  }

  static async join(options: LanGuestOptions): Promise<LanGuest> {
    const guest = new LanGuest(options.room);
    await guest.connect(options);
    return guest;
  }

  private async connect(options: LanGuestOptions): Promise<void> {
    const socket = makeSocket(options.wsUrl);
    this.socket = socket;
    const seat = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LAN room did not answer')), 10000);
      socket.onmessage = (event) => {
        const msg = safeParse(event.data);
        if (!msg) return;
        if (msg.t === 'welcome') {
          this.clientId = Number(msg.id ?? 0);
          return;
        }
        if (msg.t === 'seat') {
          this.seat = Number(msg.seat ?? -1);
          this.code = String(msg.code ?? '');
          this.roomId = String(msg.room ?? '');
          clearTimeout(timer);
          resolve();
          return;
        }
        if (msg.t === 'rejected') {
          this.error = String(msg.reason ?? 'rejected');
          clearTimeout(timer);
          reject(new Error(this.error));
          return;
        }
        this.dispatch(msg);
      };
      socket.onclose = () => {
        this.status = 'closed';
        clearTimeout(timer);
        reject(new Error('LAN room closed'));
      };
    });
    await opened(socket);
    socket.send(
      JSON.stringify({
        t: 'join',
        room: options.room,
        code: options.code ?? '',
        name: options.name,
        token: clientToken(),
      }),
    );
    await seat;
    this.status = 'open';
  }

  private dispatch(msg: Record<string, unknown>): void {
    const kind = String(msg.t ?? '');
    if (kind === 'peer-join' || kind === 'peer-leave') {
      return;
    }
    if (kind === 'lobby') {
      if (Array.isArray(msg.players)) {
        this.players = msg.players as LanPublicPeer[];
        this.playersHandler?.(this.players);
      }
      return;
    }
    if (kind === 'start') {
      this.started = true;
      if (Array.isArray(msg.players)) this.players = msg.players as LanPublicPeer[];
      this.startHandler?.(this.players);
      return;
    }
    if (kind === 'view') {
      this.viewHandler?.(msg.view, Number(msg.seat ?? this.seat));
      return;
    }
    if (kind === 'result') {
      this.resultHandler?.(msg.result);
      return;
    }
    if (kind === 'rejected') {
      this.error = String(msg.reason ?? 'rejected');
      this.errorHandler?.(this.error);
    }
  }

  onView(fn: (view: unknown, seat: number) => void): void {
    this.viewHandler = fn;
  }

  onStart(fn: (players: LanPublicPeer[]) => void): void {
    this.startHandler = fn;
  }

  onPlayers(fn: (players: LanPublicPeer[]) => void): void {
    this.playersHandler = fn;
    fn(this.players);
  }

  onResult(fn: (result: unknown) => void): void {
    this.resultHandler = fn;
  }

  onError(fn: (reason: string) => void): void {
    this.errorHandler = fn;
  }

  sendIntent(intent: unknown): void {
    this.socket?.send(JSON.stringify({ t: 'intent', intent }));
  }

  sendChat(text: string): void {
    this.socket?.send(JSON.stringify({ t: 'chat', text }));
  }

  close(): void {
    this.status = 'closed';
    this.socket?.close();
  }
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Read ?lan=ROOM&code=1234&name=... from the guest URL. */
export function guestParams(): { room: string; code: string; name: string } | null {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const room = params.get('lan');
  if (!room) return null;
  return {
    room,
    code: params.get('code') ?? '',
    name: params.get('name') ?? 'Guest',
  };
}

/** Best WebSocket URL for the current page (guests use the server that served it). */
export function sameOriginWs(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

/** Generate a room code that is easy to say across a table. */
export function newRoomCode(): string {
  return randomRoomCode();
}
