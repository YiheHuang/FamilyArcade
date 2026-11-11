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
  count(t: ServerMsg['t']): number {
    return this.sent.filter((m) => m.t === t).length;
  }
}

const TAKE3: Move = { type: 'take', colors: ['white', 'blue', 'green'] };
const TAKE1: Move = { type: 'take', colors: ['white'] };

function setup(humanSeats = 2, aiSeats = 0) {
  const manager = new RoomManager({ aiDelayMs: 1 });
  const host = new FakeClient();
  const room = manager.createRoom(host, '爸爸', humanSeats + aiSeats);
  const guests: FakeClient[] = [];
  for (let i = 1; i < humanSeats; i++) {
    const c = new FakeClient();
    guests.push(c);
    manager.join(c, room.code, `玩家${i + 1}`);
  }
  for (let i = humanSeats; i < humanSeats + aiSeats; i++) {
    manager.setSeat(host, room, i, 'ai');
  }
  manager.start(host, room);
  return { manager, room, host, guests };
}

describe('联机请求悔棋', () => {
  it('其他真人同意后回滚到请求者上一轮之前', () => {
    const { manager, room, host, guests } = setup(2);
    const guest = guests[0]!;
    manager.move(host, room, TAKE3);
    manager.move(guest, room, TAKE1);
    const beforeMoves = room.game!.moves.length;
    expect(beforeMoves).toBe(2);

    manager.undoRequest(host, room);
    // 另一位真人收到询问，需要表态
    const ask = guest.last('undo:ask');
    expect(ask?.seat).toBe(0);
    expect(ask?.voters).toEqual([1]);
    // 尚未表态前不回滚
    expect(room.game!.moves.length).toBe(beforeMoves);

    manager.undoRespond(guest, room, true);
    expect(room.game!.moves.length).toBe(0); // 回滚到请求者落子之前（其后的对手操作一并撤回）
    expect(host.last('undo:result')?.ok).toBe(true);
    expect(guest.last('undo:result')?.ok).toBe(true);
    // 回合回到请求者
    expect(room.game!.current).toBe(0);
    expect(room.undo).toBeNull();
  });

  it('任意一人拒绝则不回滚', () => {
    const { manager, room, host, guests } = setup(3);
    manager.move(host, room, TAKE3);
    manager.undoRequest(host, room);
    manager.undoRespond(guests[0]!, room, true);
    expect(room.undo).not.toBeNull(); // 还有一人未表态
    manager.undoRespond(guests[1]!, room, false);
    expect(room.game!.moves.length).toBe(1); // 没有回滚
    expect(host.last('undo:result')?.ok).toBe(false);
    expect(room.undo).toBeNull();
  });

  it('只有 AI 对手时立即同意；没有可撤回的操作时报错', () => {
    const { manager, room, host } = setup(1, 1);
    expect(() => manager.undoRequest(host, room)).toThrow(/E_UNDO_NO_TARGET/);
    manager.move(host, room, TAKE3);
    manager.undoRequest(host, room);
    expect(room.game!.moves.length).toBe(0); // AI 座位视为同意，直接回滚
    expect(host.last('undo:result')?.ok).toBe(true);
  });

  it('由后手请求悔棋：只回滚到该玩家上一轮之前（保留此前对手的走法）', () => {
    const { manager, room, host, guests } = setup(2);
    const guest = guests[0]!;
    manager.move(host, room, TAKE3);
    manager.move(guest, room, TAKE1);
    expect(room.game!.moves.length).toBe(2);
    manager.undoRequest(guest, room);
    manager.undoRespond(host, room, true);
    // 回滚到 guest 落子之前：host 的第一手保留
    expect(room.game!.moves.length).toBe(1);
    expect(room.game!.moves[0]).toEqual(TAKE3);
    expect(room.game!.current).toBe(1);
  });

  it('请求者可取消；重复请求被拒绝', () => {
    const { manager, room, host, guests } = setup(2);
    manager.move(host, room, TAKE3);
    manager.undoRequest(host, room);
    expect(() => manager.undoRequest(host, room)).toThrow(/E_UNDO_PENDING/);
    const before = guests[0]!.count('undo:result');
    manager.undoCancel(host, room);
    expect(guests[0]!.count('undo:result')).toBe(before + 1);
    expect(guests[0]!.last('undo:result')?.ok).toBe(false);
    expect(room.undo).toBeNull();
  });
});
