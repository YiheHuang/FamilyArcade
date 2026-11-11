import type { ClientMsg, ClientLike, ServerMsg } from './protocol.js';
import { isClientMsg } from './protocol.js';
import { RoomManager, type Room } from './rooms.js';

export interface SessionHost {
  manager: RoomManager;
  urls: string[];
  /** 服务器版本（用于客户端版本握手提示） */
  appVersion?: string;
  /** 更新源信息（是否提供更新包 / 当前版本 / 是否允许上传） */
  updateInfo?: () => { updates: boolean; updatePublish: boolean; updateVersion?: string } | null;
  log?: (line: string) => void;
}

/**
 * 一个客户端会话：负责消息路由与广播写回。
 * 通过注入 sendRaw 与 RoomManager，可同时在真实 WS 与测试假连接中复用。
 */
export class Session implements ClientLike {
  room: Room | null = null;
  name = '';
  private readonly host: SessionHost;
  private readonly sendRaw: (msg: ServerMsg) => void;
  private closed = false;

  constructor(host: SessionHost, sendRaw: (msg: ServerMsg) => void) {
    this.host = host;
    this.sendRaw = sendRaw;
  }

  send(msg: ServerMsg): void {
    if (this.closed) return;
    this.sendRaw(msg);
  }

  greet(): void {
    const base = { t: 'welcome' as const, urls: this.host.urls };
    const extra: Partial<Extract<ServerMsg, { t: 'welcome' }>> = {};
    if (this.host.appVersion) extra.appVersion = this.host.appVersion;
    const update = this.host.updateInfo?.();
    if (update) {
      extra.updates = update.updates;
      extra.updatePublish = update.updatePublish;
      if (update.updateVersion) extra.updateVersion = update.updateVersion;
    }
    this.send({ ...base, ...extra });
  }

  /** 处理原始消息（字符串或对象） */
  handle(data: unknown): void {
    let parsed: unknown = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        this.send({ t: 'error', code: 'E_BAD_JSON' });
        return;
      }
    }
    if (!isClientMsg(parsed)) {
      this.send({ t: 'error', code: 'E_UNKNOWN_MSG' });
      return;
    }
    try {
      this.route(parsed);
    } catch (err) {
      this.send({ t: 'error', code: err instanceof Error ? err.message : 'E_UNKNOWN_MSG' });
    }
  }

  private log(line: string): void {
    this.host.log?.(line);
  }

  private requireRoom(): Room {
    if (!this.room) throw new Error('E_NOT_IN_ROOM');
    return this.room;
  }

  private route(msg: ClientMsg): void {
    const manager = this.host.manager;
    switch (msg.t) {
      case 'create': {
        const room = manager.createRoom(this, msg.name ?? '', msg.seatCount, msg.turnSeconds ?? 60);
        this.room = room;
        this.log(`room ${room.code} created (${room.seats.length} players, turn timer ${room.turnSeconds > 0 ? `${room.turnSeconds}s` : 'off'}, host ${room.seats[0]!.name})`);
        manager.broadcastRoom(room);
        break;
      }
      case 'join': {
        const { room, seat } = manager.join(this, msg.code, msg.name ?? '', msg.token);
        this.room = room;
        if (seat != null) this.log(`${this.name || msg.name} joined room ${room.code} (seat ${seat + 1})`);
        break;
      }
      case 'rejoin': {
        const { room } = manager.join(this, msg.code, '', msg.token);
        this.room = room;
        this.log(`player reconnected to room ${room.code}`);
        break;
      }
      case 'spectate': {
        this.room = manager.spectate(this, msg.code);
        break;
      }
      case 'setSeat': {
        manager.setSeat(this, this.requireRoom(), msg.seat, msg.kind, msg.aiLevel);
        break;
      }
      case 'start': {
        manager.start(this, this.requireRoom());
        this.log(`room ${this.requireRoom().code} started`);
        break;
      }
      case 'move': {
        manager.move(this, this.requireRoom(), msg.move);
        break;
      }
      case 'undo:request': {
        manager.undoRequest(this, this.requireRoom());
        break;
      }
      case 'undo:respond': {
        manager.undoRespond(this, this.requireRoom(), msg.accept);
        break;
      }
      case 'undo:cancel': {
        manager.undoCancel(this, this.requireRoom());
        break;
      }
      case 'leave': {
        manager.leave(this);
        this.room = null;
        this.send({ t: 'left' });
        break;
      }
      case 'ping': {
        this.send({ t: 'pong' });
        break;
      }
      default:
        throw new Error('E_UNKNOWN_MSG');
    }
  }

  disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    this.host.manager.disconnect(this);
  }
}
