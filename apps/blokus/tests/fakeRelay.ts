import type { ClientMsg, RoomPlayer, ServerMsg } from '../src/net/protocol';
import type { WebSocketLike } from '../src/net/connection';

/**
 * Fake WebSocket relay mirroring the semantics of src-tauri/src/net.rs:
 * slot assignment, host token, client token reclaim, phase gating,
 * host↔guest message routing.
 */

export class FakeWs implements WebSocketLike {
  readyState = 1;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  constructor(
    private relay: FakeRelay,
    readonly id: number,
  ) {}

  send(data: string): void {
    this.relay.incoming(this, JSON.parse(data) as ClientMsg);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setTimeout(() => {
      this.onclose?.({});
      this.relay.disconnect(this);
    }, 0);
  }

  deliver(m: ServerMsg): void {
    setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }), 0);
  }
}

export class FakeRelay {
  phase: 'lobby' | 'playing' = 'lobby';
  hostToken = 'host-secret';
  roomCode = '4321';
  slots: Array<{ name: string; token: string; ws: FakeWs | null } | null> = [];
  private nextId = 1;

  open(): FakeWs {
    const ws = new FakeWs(this, this.nextId++);
    setTimeout(() => ws.onopen?.({}), 0);
    return ws;
  }

  private players(): RoomPlayer[] {
    const out: RoomPlayer[] = [];
    this.slots.forEach((p, slot) => {
      if (p) out.push({ slot, name: p.name, connected: p.ws !== null });
    });
    return out;
  }

  private broadcastRoom(): void {
    const msg: ServerMsg = { t: 'room', hostSlot: 0, players: this.players() };
    for (const p of this.slots) p?.ws?.deliver(msg);
  }

  private slotOf(ws: FakeWs): number {
    return this.slots.findIndex((p) => p?.ws === ws);
  }

  private ensure(len: number): void {
    while (this.slots.length < len) this.slots.push(null);
  }

  incoming(ws: FakeWs, msg: ClientMsg): void {
    if (msg.t === 'ping') {
      ws.deliver({ t: 'pong' });
      return;
    }
    if (msg.t === 'meta') {
      this.phase = msg.phase;
      return;
    }
    if (msg.t === 'join') {
      if (msg.host && msg.hostToken !== this.hostToken) {
        ws.deliver({ t: 'error', code: 'bad-token', msg: '房主凭据无效' });
        return;
      }
      if (!msg.host && msg.code !== this.roomCode) {
        ws.deliver({ t: 'error', code: 'bad-code', msg: '房间码不正确' });
        return;
      }
      const token = msg.token ?? '';
      let slot: number | undefined;
      if (msg.host) {
        if (this.slots[0]?.ws) {
          ws.deliver({ t: 'error', code: 'host-taken', msg: '房主已在房间中' });
          return;
        }
        slot = 0;
      } else {
        const reclaim = token === '' ? -1 : this.slots.findIndex((p) => p && p.token === token);
        if (reclaim >= 0) {
          slot = reclaim;
        } else if (this.phase === 'playing') {
          ws.deliver({ t: 'error', code: 'in-game', msg: '对局进行中，无法加入' });
          return;
        } else {
          const free = this.slots.findIndex((p) => p === null);
          slot = free >= 0 ? free : this.slots.length < 4 ? this.slots.length : undefined;
          if (slot === undefined) {
            ws.deliver({ t: 'error', code: 'full', msg: '房间已满' });
            return;
          }
        }
      }
      this.ensure(slot + 1);
      this.slots[slot] = { name: msg.name, token, ws };
      ws.deliver({
        t: 'welcome',
        slot,
        hostSlot: 0,
        room: '测试房',
        version: 1,
        players: this.players(),
      });
      this.broadcastRoom();
      return;
    }
    // msg
    const slot = this.slotOf(ws);
    if (slot < 0) return;
    if (slot === 0) {
      if (msg.to !== undefined) {
        this.slots[msg.to]?.ws?.deliver({ t: 'msg', from: 0, payload: msg.payload });
      } else {
        for (let i = 0; i < this.slots.length; i++) {
          if (i !== 0) this.slots[i]?.ws?.deliver({ t: 'msg', from: 0, payload: msg.payload });
        }
      }
    } else {
      this.slots[0]?.ws?.deliver({ t: 'msg', from: slot, payload: msg.payload });
    }
  }

  disconnect(ws: FakeWs): void {
    const slot = this.slotOf(ws);
    if (slot < 0) return;
    if (slot === 0) {
      for (const p of this.slots) p?.ws?.deliver({ t: 'error', code: 'host-left', msg: '房主已离开' });
      return;
    }
    if (this.phase === 'playing') {
      const p = this.slots[slot];
      if (p) p.ws = null;
    } else {
      this.slots[slot] = null;
    }
    this.broadcastRoom();
  }
}
