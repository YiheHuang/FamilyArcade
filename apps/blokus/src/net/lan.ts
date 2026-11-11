import type { GameConfig, PlayerCount, SerializedGame } from '../game/types';
import { t, type MessageKey } from '../i18n';
import type { LanBridge } from '../session/session';
import { NetConnection } from './connection';
import { PROTOCOL_VERSION, type GameMsg, type HostInfo, type RoomPlayer, type ServerMsg } from './protocol';

export interface LanSeat {
  name: string;
  kind: 'human' | 'remote';
  connected: boolean;
}

export interface LanRoomEvents {
  onRoom?: () => void;
  onStart?: (config: GameConfig, seatNames: string[]) => void;
  onSync?: (snapshot: SerializedGame, config: GameConfig, seatNames: string[]) => void;
  onGameMessage?: (from: number, msg: GameMsg) => void;
  onRematch?: () => void;
  onClosed?: (reason: string) => void;
  /** someone asks to undo their last move (host only) */
  onUndoAsk?: (from: number) => void;
  /** undo votes / resolutions / pause / nudge */
  onSocial?: (from: number, msg: GameMsg) => void;
}

/** what the room needs to know about the running game (host rescues/syncs) */
export interface LanGameRef {
  serialize(): SerializedGame;
  seatNames(): string[];
}

function clientToken(): string {
  const key = 'blokus.client.id';
  try {
    let tkn = localStorage.getItem(key);
    if (!tkn) {
      tkn = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, tkn);
    }
    return tkn;
  } catch {
    return 'anon';
  }
}

/** localize a server error (falls back to the server's own message) */
function localErrorText(m: ServerMsg & { t: 'error' }): string {
  const key = `net.error.${m.code}` as MessageKey;
  const text = t(key, { server: m.server ?? '?', client: m.client ?? '?' });
  return text === key ? m.msg : text;
}

export class LanRoom {
  readonly role: 'host' | 'guest';
  slot = -1;
  hostSlot = 0;
  players: RoomPlayer[] = [];
  config: GameConfig;
  roomName: string;
  /** candidate addresses, best first (host side); just the host ip for guests */
  addresses: string[];
  port: number;
  /** 4-digit room code required for joining */
  code: string;
  phase: 'lobby' | 'playing' = 'lobby';
  /** joined as a watcher: no seat, read-only */
  spectating = false;
  events: LanRoomEvents = {};
  gameRef: LanGameRef | null = null;

  private conn: NetConnection;
  private prevConnected = new Map<number, boolean>();
  private closed = false;

  private constructor(
    role: 'host' | 'guest',
    conn: NetConnection,
    config: GameConfig,
    roomName: string,
    addresses: string[],
    port: number,
    code: string,
  ) {
    this.role = role;
    this.conn = conn;
    this.config = config;
    this.roomName = roomName;
    this.addresses = addresses.length > 0 ? addresses : ['127.0.0.1'];
    this.port = port;
    this.code = code;
    conn.onMsg = (m) => this.onServer(m);
    conn.onClose = () => this.handleClose(t('lan.disconnected'));
  }

  // ------------------------------------------------------------------ setup

  static async openHost(info: HostInfo, opts: { room: string; config: GameConfig }): Promise<LanRoom> {
    const conn = await NetConnection.open(`ws://127.0.0.1:${info.port}/ws`);
    const room = new LanRoom('host', conn, opts.config, opts.room, info.addresses, info.port, info.code);
    const welcome = await room.join({
      name: t('lan.host'),
      host: true,
      hostToken: info.token,
      code: info.code,
    });
    room.applyWelcome(welcome);
    return room;
  }

  static async openGuest(ip: string, port: number, name: string, code: string): Promise<LanRoom> {
    const conn = await NetConnection.open(`ws://${ip}:${port}/ws`);
    const room = new LanRoom('guest', conn, { variant: 'duo', players: 2 }, 'Blokus', [ip], port, code);
    const welcome = await room.join({ name, token: clientToken(), code: code || undefined });
    room.applyWelcome(welcome);
    return room;
  }

  private join(payload: {
    name: string;
    token?: string;
    host?: boolean;
    hostToken?: string;
    code?: string;
  }): Promise<ServerMsg & { t: 'welcome' }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(t('lan.joinTimeout')));
      }, 6000);
      const keep = this.conn.onMsg;
      this.conn.onMsg = (m) => {
        keep?.(m);
        if (m.t === 'welcome') {
          clearTimeout(timer);
          this.conn.onMsg = keep;
          resolve(m as ServerMsg & { t: 'welcome' });
        } else if (m.t === 'error') {
          clearTimeout(timer);
          this.conn.onMsg = keep;
          reject(new Error(localErrorText(m)));
          this.conn.close();
        }
      };
      this.conn.send({ t: 'join', version: PROTOCOL_VERSION, ...payload });
    });
  }

  private applyWelcome(m: ServerMsg & { t: 'welcome' }): void {
    this.slot = m.slot;
    this.hostSlot = m.hostSlot;
    this.players = m.players;
    this.spectating = m.spectator === true;
    this.trackConnected();
    this.events.onRoom?.();
  }

  // ------------------------------------------------------------------ state

  connectedPlayers(): RoomPlayer[] {
    return this.players.filter((p) => p.connected && !p.spectator);
  }

  /** seats in slot order for the current game */
  seatsFor(mySlot: number): LanSeat[] {
    return [...this.players]
      .filter((p) => !p.spectator)
      .sort((a, b) => a.slot - b.slot)
      .slice(0, this.config.players)
      .map((p) => ({
        name: p.name,
        kind: p.slot === mySlot ? 'human' : 'remote',
        connected: p.connected,
      }));
  }

  /** read-only seat list for spectators (nobody is local) */
  spectatorSeats(): LanSeat[] {
    return [...this.players]
      .filter((p) => !p.spectator)
      .sort((a, b) => a.slot - b.slot)
      .slice(0, this.config.players)
      .map((p) => ({ name: p.name, kind: 'remote' as const, connected: p.connected }));
  }

  primaryUrl(): string {
    return `http://${this.addresses[0]}:${this.port}/#c=${this.code}`;
  }

  backupUrls(): string[] {
    return this.addresses.slice(1).map((a) => `http://${a}:${this.port}/#c=${this.code}`);
  }

  status(): string {
    if (this.spectating) {
      return t('lan.spectating', { host: this.addresses[0], port: this.port });
    }
    const n = this.connectedPlayers().length;
    if (this.role === 'host') {
      return t('lan.status.hosting', { host: this.addresses[0], port: this.port, n });
    }
    return t('lan.status.connected', { host: this.addresses[0], port: this.port });
  }

  /** host: send a raw game-level message to everyone */
  broadcastMsg(msg: GameMsg): void {
    this.conn.send({ t: 'msg', payload: msg });
  }

  /** guest: ask the host for an undo of my last move */
  askUndo(): void {
    this.conn.send({ t: 'msg', payload: { g: 'undo-ask' } });
  }

  /** host: send a small notice to one guest */
  sendNotice(slot: number, code: 'vote-busy' | 'caretaker' | 'returned' | 'slow', about?: number): void {
    this.conn.send({ t: 'msg', payload: { g: 'notice', code, slot: about }, to: slot });
  }

  /** host: tell everyone about a table event (AI caretaker, slow turn) */
  broadcastNotice(code: 'caretaker' | 'returned' | 'slow', about: number): void {
    this.broadcastMsg({ g: 'notice', code, slot: about });
  }

  /** host: push a fresh snapshot to everybody */
  syncAll(): void {
    if (!this.gameRef) return;
    this.broadcastMsg({
      g: 'sync',
      snapshot: this.gameRef.serialize(),
      config: { ...this.config },
      seats: this.gameRef.seatNames(),
    });
  }

  bridge(): LanBridge {
    return {
      role: this.role,
      send: (a, version) => this.conn.send({ t: 'msg', payload: { g: 'request', a, v: version } }),
      broadcast: (a, version) => this.conn.send({ t: 'msg', payload: { g: 'applied', a, v: version } }),
      onRematch: () => {
        this.setPhase('playing');
        this.conn.send({ t: 'msg', payload: { g: 'rematch' } });
      },
      requestSync: () => this.conn.send({ t: 'msg', payload: { g: 'resync' } }),
      sendSyncTo: (slot) => this.sendSyncTo(slot),
      status: () => this.status(),
    };
  }

  setPhase(phase: 'lobby' | 'playing'): void {
    this.phase = phase;
    this.conn.send({ t: 'meta', phase });
  }

  /** host: begin the game with the currently connected players */
  startGame(): void {
    if (this.role !== 'host') return;
    const seats = this.connectedPlayers()
      .sort((a, b) => a.slot - b.slot)
      .map((p) => p.name);
    const config: GameConfig = { ...this.config, players: seats.length as PlayerCount };
    this.config = config;
    this.setPhase('playing');
    this.conn.send({ t: 'msg', payload: { g: 'start', config, seats } });
    this.events.onStart?.(config, seats);
  }

  leave(): void {
    this.closed = true;
    this.conn.close();
  }

  private handleClose(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.events.onClosed?.(reason);
  }

  // ------------------------------------------------------------- messaging

  private onServer(m: ServerMsg): void {
    switch (m.t) {
      case 'room': {
        this.players = m.players;
        this.hostSlot = m.hostSlot;
        this.handleConnChanges();
        this.events.onRoom?.();
        break;
      }
      case 'msg': {
        const g = m.payload;
        if (g.g === 'start') {
          this.events.onStart?.(g.config, g.seats);
        } else if (g.g === 'sync') {
          this.events.onSync?.(g.snapshot, g.config, g.seats);
        } else if (g.g === 'request' && this.role === 'host') {
          this.events.onGameMessage?.(m.from, g);
        } else if (g.g === 'applied' && this.role === 'guest') {
          this.events.onGameMessage?.(m.from, g);
        } else if (g.g === 'resync' && this.role === 'host') {
          this.sendSyncTo(m.from);
        } else if (g.g === 'undo-ask' && this.role === 'host') {
          this.events.onUndoAsk?.(m.from);
        } else if (
          g.g === 'undo-request' ||
          g.g === 'undo-vote' ||
          g.g === 'undo-cancel' ||
          g.g === 'undo-resolved' ||
          g.g === 'notice' ||
          g.g === 'pause' ||
          g.g === 'nudge'
        ) {
          this.events.onSocial?.(m.from, g);
        } else if (g.g === 'rematch') {
          this.setPhase('playing');
          this.events.onRematch?.();
        }
        break;
      }
      case 'error': {
        if (this.phase === 'lobby' || m.code === 'host-left') {
          this.handleClose(localErrorText(m));
        }
        break;
      }
      default:
        break;
    }
  }

  private trackConnected(): void {
    this.prevConnected.clear();
    for (const p of this.players) this.prevConnected.set(p.slot, p.connected);
  }

  /** host: push a full sync to guests that just (re)connected mid-game */
  private handleConnChanges(): void {
    if (this.role !== 'host' || this.phase !== 'playing' || !this.gameRef) {
      this.trackConnected();
      return;
    }
    for (const p of this.players) {
      const was = this.prevConnected.get(p.slot) ?? false;
      const isSeat = p.slot < this.config.players;
      if (p.connected && !was && (isSeat || p.spectator)) {
        this.sendSyncTo(p.slot);
      }
    }
    this.trackConnected();
  }

  private sendSyncTo(slot: number): void {
    if (!this.gameRef) return;
    const payload: GameMsg = {
      g: 'sync',
      snapshot: this.gameRef.serialize(),
      config: { ...this.config },
      seats: this.gameRef.seatNames(),
    };
    this.conn.send({ t: 'msg', payload, to: slot });
  }
}
