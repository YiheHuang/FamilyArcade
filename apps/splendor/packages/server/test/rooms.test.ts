import type { Move } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import type { ClientLike, ServerMsg } from '../src/protocol.js';
import { RoomManager } from '../src/rooms.js';

class FakeClient implements ClientLike {
  sent: ServerMsg[] = [];
  send(msg: ServerMsg): void {
    this.sent.push(msg);
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.t === t) return m as Extract<ServerMsg, { t: T }>;
    }
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TAKE3: Move = { type: 'take', colors: ['white', 'blue', 'green'] };
const TAKE1: Move = { type: 'take', colors: ['white'] };

describe('局域网房间管理', () => {
  it('创建 / 加入 / 房主开局 / 行动权限', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, '爸爸', 2);
    expect(room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(host.last('room')?.seats.map((s) => s.kind)).toEqual(['human', 'open']);

    const joined = manager.join(guest, room.code, '孩子');
    expect(joined.seat).toBe(1);
    expect(host.last('room')?.seats[1]!.kind).toBe('human');

    // 非房主不能开局
    expect(() => manager.start(guest, room)).toThrow(/E_HOST_ONLY/);

    // 有未加入座位时不能开局（先造一个 3 人房验证）
    const room3 = manager.createRoom(new FakeClient(), 'A', 3);
    expect(() => manager.start(room3.seats[0]!.client!, room3)).toThrow(/E_OPEN_SEATS/);

    manager.start(host, room);
    expect(room.started).toBe(true);
    expect(host.last('state')?.view.phase).toBe('playing');

    // 不是自己的回合不能动
    expect(() => manager.move(guest, room, TAKE3)).toThrow(/E_NOT_YOUR_TURN/);

    manager.move(host, room, TAKE3);
    expect(room.game!.moves).toHaveLength(1);
    manager.move(guest, room, TAKE1);
    expect(room.game!.moves).toHaveLength(2);
    expect(room.game!.current).toBe(0);
  });

  it('断线重连（token）与同名快速回座', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, '爸爸', 2);
    manager.join(guest, room.code, '孩子');
    const token = room.seats[1]!.token!;
    expect(token).toBeTruthy();

    manager.disconnect(guest);
    expect(room.seats[1]!.client).toBeNull();
    expect(host.last('room')?.seats[1]!.connected).toBe(false);

    const guest2 = new FakeClient();
    const r2 = manager.join(guest2, room.code, '孩子', token);
    expect(r2.seat).toBe(1);

    // 再次断开后用同名回座（无需 token）
    manager.disconnect(guest2);
    const guest3 = new FakeClient();
    const r3 = manager.join(guest3, room.code, '孩子');
    expect(r3.seat).toBe(1);

    // token 无效时报错
    expect(() => manager.join(new FakeClient(), room.code, '', 'wrong-token')).toThrow(/E_BAD_TOKEN/);
  });

  it('观战者可以看、不能动', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, 'A', 2);
    manager.join(guest, room.code, 'B');
    manager.start(host, room);
    const sp = new FakeClient();
    const spRoom = manager.spectate(sp, room.code);
    expect(spRoom.code).toBe(room.code);
    expect(sp.last('room')?.you.spectator).toBe(true);
    expect(sp.last('state')).toBeTruthy();
    expect(() => manager.move(sp, room, TAKE3)).toThrow(/E_SPECTATOR/);
  });

  it('AI 座位自动行动', async () => {
    const manager = new RoomManager({ aiDelayMs: 10 });
    const host = new FakeClient();
    const room = manager.createRoom(host, 'Papa', 2);
    manager.setSeat(host, room, 1, 'ai', 'easy');
    manager.start(host, room);
    expect(room.game!.current).toBe(0);
    manager.move(host, room, TAKE3);
    expect(room.game!.current).toBe(1);
    await sleep(120);
    expect(room.game!.moves.length).toBeGreaterThanOrEqual(2);
    expect(room.game!.current).toBe(0);
    manager.stopWatchdog();
  });

  it('掉线超时后服务器托管', async () => {
    const manager = new RoomManager({ aiDelayMs: 10, autoplayAfterMs: 0 });
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, 'A', 2);
    manager.join(guest, room.code, 'B');
    manager.start(host, room);
    manager.move(host, room, TAKE3); // 轮到 guest
    manager.disconnect(guest);
    manager.watchdog();
    expect(room.seats[1]!.autoPlay).toBe(true);
    await sleep(150);
    expect(room.game!.moves.length).toBeGreaterThanOrEqual(2);
    expect(room.game!.current).toBe(0);

    // 重连后解除托管
    const guest2 = new FakeClient();
    manager.join(guest2, room.code, 'B', room.seats[1]!.token!);
    manager.watchdog();
    expect(room.seats[1]!.autoPlay).toBe(false);
    manager.stopWatchdog();
  });

  it('事件脱敏：他人盲抽预定不泄露卡牌', () => {
    const manager = new RoomManager();
    const events = [
      { type: 'card-reserved', seat: 1, cardId: 42, fromDeck: true, goldTaken: true, tier: 2 } as const,
      { type: 'card-reserved', seat: 1, cardId: 43, fromDeck: false, goldTaken: true, tier: 1 } as const,
      { type: 'tokens-taken', seat: 0, tokens: { white: 1, blue: 0, green: 0, red: 0, black: 0, gold: 0 } } as const,
    ];
    const forOpponent = manager.sanitizeEvents(events, 0);
    expect(forOpponent[0]).toMatchObject({ cardId: -1 });
    expect(forOpponent[1]).toMatchObject({ cardId: 43 });
    const forOwner = manager.sanitizeEvents(events, 1);
    expect(forOwner[0]).toMatchObject({ cardId: 42 });
  });

  it('快照与恢复（服务端存档续局）', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, 'A', 3);
    manager.join(guest, room.code, 'B');
    manager.setSeat(host, room, 2, 'ai', 'normal');
    // 第三个座位还是 human 空座 -> 直接改 AI 后开局
    manager.start(host, room);
    manager.move(host, room, TAKE3);

    const snap = JSON.parse(JSON.stringify(manager.toSnapshot()));
    const manager2 = new RoomManager();
    const loaded = manager2.fromSnapshot(snap);
    expect(loaded).toBe(1);
    const room2 = manager2.get(room.code)!;
    expect(room2).toBeTruthy();
    expect(room2.game!.moves).toHaveLength(1);
    expect(room2.seats[0]!.token).toBe(room.seats[0]!.token);
    expect(room2.seats[2]!.kind).toBe('ai');
    expect(room2.seats[0]!.client).toBeNull(); // 恢复后等待重连
    // 用原 token 重连
    const host2 = new FakeClient();
    const r = manager2.join(host2, room.code, 'A', room.seats[0]!.token!);
    expect(r.seat).toBe(0);
  });

  it('修改座位规则：已加入的座位不能改为 AI', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const guest = new FakeClient();
    const room = manager.createRoom(host, 'A', 2);
    manager.join(guest, room.code, 'B');
    expect(() => manager.setSeat(host, room, 1, 'ai')).toThrow(/E_SEAT_TAKEN/);
    expect(() => manager.setSeat(guest, room, 0, 'ai')).toThrow(/E_HOST_ONLY/);
  });
});
