// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RoomManager } from '../../server/src/rooms';
import { Session } from '../../server/src/session';
import type { ServerMsg } from '../../server/src/protocol';
import { LanClient, type LanSocketLike } from '../src/lan';
import { setLanClientForTest, useGame } from '../src/store';

const sleep = (ms = 8) => new Promise((resolve) => setTimeout(resolve, ms));

/** 用内存桥接模拟真实网络：客户端 LanClient <-> 服务端 Session（共享 RoomManager） */
function makeBridge(manager: RoomManager) {
  const sockets: LanSocketLike[] = [];
  const sessions: Session[] = [];
  const factory = (_url: string): LanSocketLike => {
    const socket: LanSocketLike = {
      send: (data) => session.handle(data),
      close: () => socket.onclose?.(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    const session = new Session({ manager, urls: ['http://10.0.0.5:8080'], log: () => {} }, (msg: ServerMsg) => {
      queueMicrotask(() => socket.onmessage?.(JSON.stringify(msg)));
    });
    sockets.push(socket);
    sessions.push(session);
    queueMicrotask(() => socket.onopen?.());
    return socket;
  };
  return { factory, sockets, sessions };
}

function attachStoreClient(manager: RoomManager) {
  const bridge = makeBridge(manager);
  const client = new LanClient({
    factory: bridge.factory,
    onMessage: (m) => useGame.getState().handleServerMsg(m),
    onStatus: (c) => useGame.getState().setLanConnected(c),
    onReconnected: () => {
      const lan = useGame.getState().lan;
      if (!lan) return;
      const raw = localStorage.getItem('splendor.lan.rejoin.v1');
      if (!raw) return;
      const saved = JSON.parse(raw) as { code: string; token: string };
      client.send({ t: 'rejoin', code: saved.code, token: saved.token });
    },
    reconnectDelayMs: 5,
  });
  setLanClientForTest(client);
  return { client, ...bridge };
}

/** 第二个玩家：直接使用服务端 Session（不带界面） */
function makeRawPlayer(manager: RoomManager) {
  const received: ServerMsg[] = [];
  const session = new Session({ manager, urls: [], log: () => {} }, (msg) => received.push(msg));
  session.greet();
  return { session, received };
}

describe('局域网端到端（客户端 store ↔ 服务器房间）', () => {
  it('创建 → 加入 → 开局 → 双方出牌 → 状态同步', async () => {
    localStorage.clear();
    const manager = new RoomManager({ aiDelayMs: 5 });
    attachStoreClient(manager);
    const store = () => useGame.getState();

    // 创建房间
    store().lanCreate('爸爸', 2);
    await sleep();
    const lan = store().lan!;
    expect(lan.code).toHaveLength(4);
    expect(lan.you).toBe(0);
    expect(store().lanConnected).toBe(true);
    expect(store().screen).toBe('lobby');

    // 第二位玩家加入
    const guest = makeRawPlayer(manager);
    guest.session.handle(JSON.stringify({ t: 'join', code: lan.code, name: '孩子' }));
    await sleep();
    expect(useGame.getState().lan!.seats[1]!.kind).toBe('human');

    // 房主开局
    store().lanStart();
    await sleep();
    expect(store().mode).toBe('lan');
    expect(store().screen).toBe('game');
    expect(store().view!.phase).toBe('playing');

    // 房主拿 3 枚
    store().toggleToken('white');
    store().toggleToken('blue');
    store().toggleToken('green');
    store().confirmTake();
    await sleep();
    expect(store().view!.players[0]!.tokens.white).toBe(1);
    expect(store().view!.current).toBe(1);

    // 对手拿 1 枚
    guest.session.handle(JSON.stringify({ t: 'move', move: { type: 'take', colors: ['white'] } }));
    await sleep();
    expect(store().view!.current).toBe(0);
    expect(store().view!.players[1]!.tokens.white).toBe(1);
  });

  it('事件脱敏：对手盲抽预定不泄露卡牌 id', async () => {
    localStorage.clear();
    const manager = new RoomManager({ aiDelayMs: 5 });
    attachStoreClient(manager);
    const guest = makeRawPlayer(manager);
    const store = () => useGame.getState();
    store().lanCreate('爸爸', 2);
    await sleep();
    const code = store().lan!.code;
    guest.session.handle(JSON.stringify({ t: 'join', code, name: '孩子' }));
    store().lanStart();
    await sleep();

    // 房主先拿 3 枚 -> 轮到对手
    store().toggleToken('white');
    store().toggleToken('blue');
    store().toggleToken('green');
    store().confirmTake();
    await sleep();

    // 对手盲抽预定：对手自己应看到真实卡牌 id，房主视角应被脱敏为 -1
    guest.session.handle(JSON.stringify({ t: 'move', move: { type: 'reserve', target: { kind: 'deck', tier: 1 } } }));
    await sleep();

    const hostEvents = store().events.filter((e) => e.type === 'card-reserved');
    expect(hostEvents.length).toBeGreaterThan(0);
    for (const e of hostEvents) expect((e as { cardId: number }).cardId).toBe(-1);

    const guestState = [...guest.received].reverse().find((m) => m.t === 'state');
    expect(guestState).toBeTruthy();
    const guestReserved = (guestState as Extract<ServerMsg, { t: 'state' }>).events.filter((e) => e.type === 'card-reserved');
    expect(guestReserved.length).toBeGreaterThan(0);
    expect((guestReserved[0] as { cardId: number }).cardId).toBeGreaterThanOrEqual(0);
  });

  it('断线自动重连并用凭证回到座位', async () => {
    localStorage.clear();
    const manager = new RoomManager({ aiDelayMs: 5 });
    const bridge = attachStoreClient(manager);
    const store = () => useGame.getState();
    store().lanCreate('爸爸', 2);
    await sleep();
    const guest = makeRawPlayer(manager);
    guest.session.handle(JSON.stringify({ t: 'join', code: store().lan!.code, name: '孩子' }));
    store().lanStart();
    await sleep();
    expect(store().view!.phase).toBe('playing');

    // 模拟断线：关闭当前 socket -> LanClient 自动重连 -> rejoin
    bridge.sockets[bridge.sockets.length - 1]!.onclose?.();
    await sleep(60);
    expect(store().lanConnected).toBe(true);
    expect(store().view!.phase).toBe('playing');
    expect(store().lan!.you).toBe(0);

    // 重连后仍可行动
    store().toggleToken('white');
    store().confirmTake();
    await sleep();
    expect(store().view!.players[0]!.tokens.white).toBe(1);
  });
});
