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
  clocks(): Array<Extract<ServerMsg, { t: 'clock' }>> {
    return this.sent.filter((m): m is Extract<ServerMsg, { t: 'clock' }> => m.t === 'clock');
  }
}

const TAKE3: Move = { type: 'take', colors: ['white', 'blue', 'green'] };

function makeManager(turnSeconds: number, startAt = 1000): { manager: RoomManager; host: FakeClient; guest: FakeClient; code: string; at: () => number; setAt: (v: number) => void } {
  let now = startAt;
  const manager = new RoomManager({ now: () => now, aiDelayMs: 1 });
  const host = new FakeClient();
  const guest = new FakeClient();
  const room = manager.createRoom(host, '爸爸', 2, turnSeconds);
  manager.join(guest, room.code, '孩子');
  manager.start(host, room);
  return { manager, host, guest, code: room.code, at: () => now, setAt: (v) => (now = v) };
}

describe('回合读秒（服务器权威，纯提示）', () => {
  it('建房携带思考时间并写入房间消息', () => {
    const manager = new RoomManager();
    const host = new FakeClient();
    const room = manager.createRoom(host, '爸爸', 2, 45);
    expect(room.turnSeconds).toBe(45);
    expect(host.last('room')?.turnSeconds).toBe(45);

    // 非法档位回落到默认 60
    const room2 = manager.createRoom(new FakeClient(), 'B', 2, 33);
    expect(room2.turnSeconds).toBe(60);
  });

  it('每秒广播剩余秒数，超时后给出超时秒数（不强制任何动作）', () => {
    const { manager, host, guest, at, setAt } = makeManager(30, 10_000);
    setAt(at() + 0);
    manager.clockTick();
    expect(host.last('clock')?.remaining).toBe(30);
    expect(host.last('clock')?.seat).toBe(0);

    setAt(at() + 12_400);
    manager.clockTick();
    expect(host.last('clock')?.remaining).toBe(18);
    expect(host.last('clock')?.over).toBe(0);

    setAt(at() + 31_000); // 已超时 13 秒
    manager.clockTick();
    expect(host.last('clock')?.remaining).toBe(0);
    expect(host.last('clock')?.over).toBe(13);
    // 观战者/另一位玩家也收到同一帧
    expect(guest.clocks().length).toBeGreaterThan(0);

    // 对局仍在进行，且轮到原玩家——没有任何强制动作
    expect(host.last('state')?.view.current).toBe(0);
    expect(manager.get('AAAA')).toBeUndefined();
  });

  it('不限时（0）不广播读秒；回合推进后读秒重新计时', () => {
    const off = makeManager(0, 5_000);
    off.setAt(off.at() + 60_000);
    off.manager.clockTick();
    expect(off.host.clocks()).toHaveLength(0);

    const on = makeManager(30, 5_000);
    on.setAt(on.at() + 10_000);
    on.manager.clockTick();
    expect(on.host.last('clock')?.remaining).toBe(20);

    // 房主行动 → 换人后读秒从新回合重新计时（此刻已过 1 秒，故为 29）
    on.manager.move(on.host, on.manager.get(on.code)!, TAKE3);
    on.setAt(on.at() + 1_000);
    on.manager.clockTick();
    const last = on.host.last('clock');
    expect(last?.seat).toBe(1);
    expect(last?.remaining).toBe(29);
  });
});
