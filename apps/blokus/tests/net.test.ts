import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import type { GameConfig } from '../src/game/types';
import { initI18n } from '../src/i18n';
import { NetConnection } from '../src/net/connection';
import { LanRoom } from '../src/net/lan';
import { Session } from '../src/session/session';
import type { SeatInfo } from '../src/ui/gameScreen';
import { place } from './helpers';
import { FakeRelay } from './fakeRelay';

/** wait until a condition holds (message hops are asynchronous) */
async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor 超时');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

beforeAll(() => {
  const storage = new MemStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  // pin the language so assertions are deterministic
  storage.setItem('blokus.lang', 'zh');
  initI18n();
});

const relays: FakeRelay[] = [];
const rooms: LanRoom[] = [];

function newRelay(): FakeRelay {
  const relay = new FakeRelay();
  relays.push(relay);
  return relay;
}

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.events = {};
    room.leave();
  }
  relays.splice(0);
  NetConnection.socketFactory = () => {
    throw new Error('测试中不应再创建连接');
  };
});

function track(room: LanRoom): LanRoom {
  rooms.push(room);
  return room;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function openPair(config: GameConfig): Promise<{ host: LanRoom; guest: LanRoom }> {
  const relay = newRelay();
  NetConnection.socketFactory = () => relay.open();
  const host = track(
    await LanRoom.openHost(
      { port: 7667, token: relay.hostToken, code: relay.roomCode, addresses: ['127.0.0.1'] },
      { room: '测试房', config },
    ),
  );
  const guest = track(await LanRoom.openGuest('127.0.0.1', 7667, '小蓝', relay.roomCode));
  await waitFor(() => host.players.length === 2);
  return { host, guest };
}

function seatsFor(names: string[], mySlot: number): SeatInfo[] {
  return names.map((name, i) => ({
    name,
    kind: i === mySlot ? 'human' : 'remote',
    connected: true,
  }));
}

describe('局域网（基于模拟中继）', () => {
  it('建房、加入、开局广播', async () => {
    const { host, guest } = await openPair({ variant: 'duo', players: 2 });
    expect(host.slot).toBe(0);
    expect(guest.slot).toBe(1);

    let started: [GameConfig, string[]] | null = null;
    guest.events.onStart = (config, seats) => {
      started = [config, seats];
    };
    host.startGame();
    await waitFor(() => started !== null);
    expect(started![1]).toEqual(['房主', '小蓝']);
    expect(started![0].players).toBe(2);
  });

  it('走子端到端同步：双方棋盘保持一致', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host, guest } = await openPair(config);

    const hostSession = new Session({
      config,
      seats: seatsFor(['房主', '小蓝'], 0),
      localSeats: [0],
      allowHint: false,
      allowUndo: false,
      net: host.bridge(),
      onExit: () => {},
    });
    const guestSession = new Session({
      config,
      seats: seatsFor(['房主', '小蓝'], 1),
      localSeats: [1],
      allowHint: false,
      allowUndo: false,
      net: guest.bridge(),
      onExit: () => {},
    });
    host.events.onGameMessage = (from, msg) => {
      if (msg.g === 'request') hostSession.netIngest(from, msg.a, msg.v);
    };
    guest.events.onGameMessage = (from, msg) => {
      if (msg.g === 'applied') guestSession.netIngest(from, msg.a, msg.v);
    };
    hostSession.bind(() => {});
    guestSession.bind(() => {});

    host.startGame();
    hostSession.start();
    await sleep(10);

    // host (seat 0) opens
    const mv0 = hostSession.game.legalMoves(0)[0];
    expect(hostSession.handlePlace(mv0)).toBe(true);
    await waitFor(() => guestSession.game.history.length === 1);
    expect([...guestSession.game.board]).toEqual([...hostSession.game.board]);
    expect(guestSession.game.turn).toBe(1);

    // guest (seat 1) replies
    const mv1 = guestSession.game.legalMoves(1)[0];
    expect(guestSession.handlePlace(mv1)).toBe(true);
    await waitFor(() => hostSession.game.history.length === 2);
    await waitFor(() => guestSession.game.history.length === 2);
    expect([...hostSession.game.board]).toEqual([...guestSession.game.board]);
    expect(hostSession.game.turn).toBe(0);

    // guest tries an illegal action — rejected locally, nothing broadcast
    expect(guestSession.handlePlace(place(1, 'I1', [[0, 0]], 5, 5))).toBe(false);
    await sleep(20);
    expect(hostSession.game.history.length).toBe(2);
  });

  it('断线重连：座位保留并自动补齐状态', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host, guest } = await openPair(config);

    const hostSession = new Session({
      config,
      seats: seatsFor(['房主', '小蓝'], 0),
      localSeats: [0],
      allowHint: false,
      allowUndo: false,
      net: host.bridge(),
      onExit: () => {},
    });
    hostSession.bind(() => {});
    host.gameRef = {
      serialize: () => hostSession.game.serialize(),
      seatNames: () => ['房主', '小蓝'],
    };

    host.startGame();
    hostSession.start();
    await sleep(10);
    const mv0 = hostSession.game.legalMoves(0)[0];
    expect(hostSession.handlePlace(mv0)).toBe(true);

    // guest drops — seat is kept
    guest.leave();
    await waitFor(() => host.players.find((p) => p.slot === 1)?.connected === false);

    // reconnect and receive a sync (FakeRelay's default room code)
    const guest2 = track(await LanRoom.openGuest('127.0.0.1', 7667, '小蓝', '4321'));
    expect(guest2.slot).toBe(1);
    let snapshot: ReturnType<Game['serialize']> | null = null;
    guest2.events.onSync = (s) => {
      snapshot = s;
    };
    await waitFor(() => snapshot !== null);
    expect(snapshot!.history.length).toBe(1);

    // the sync snapshot reconstructs the authoritative state exactly
    const rebuilt = Game.deserialize(snapshot!);
    expect([...rebuilt.board]).toEqual([...hostSession.game.board]);
    expect(rebuilt.turn).toBe(hostSession.game.turn);
  });

  it('对局进行中拒绝新玩家加入', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host } = await openPair(config);
    host.startGame();
    await sleep(10);

    // brand-new device (different client token) cannot join mid-game
    (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage?.setItem(
      'blokus.client.id',
      'other-device-token',
    );
    await expect(LanRoom.openGuest('127.0.0.1', 7667, '第三人', '4321')).rejects.toThrow(
      /对局进行中|房间已满/,
    );
  });

  it('再来一局广播让双方重置', async () => {
    const { host, guest } = await openPair({ variant: 'duo', players: 2 });
    let rematch = false;
    guest.events.onRematch = () => {
      rematch = true;
    };
    host.bridge().onRematch();
    await waitFor(() => rematch);
    expect(rematch).toBe(true);
  });

  it('resync 请求会拿到最新快照', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host, guest } = await openPair(config);
    const reference = new Game(config);
    reference.tryApply(reference.legalMoves(0)[0]);
    host.gameRef = {
      serialize: () => reference.serialize(),
      seatNames: () => ['房主', '小蓝'],
    };
    let snapshot: ReturnType<Game['serialize']> | null = null;
    guest.events.onSync = (s) => {
      snapshot = s;
    };
    guest.bridge().requestSync();
    await waitFor(() => snapshot !== null);
    expect(snapshot!.history.length).toBe(1);
  });

  it('房间码错误时无法加入', async () => {
    const relay = newRelay();
    NetConnection.socketFactory = () => relay.open();
    track(
      await LanRoom.openHost(
        { port: 7667, token: relay.hostToken, code: relay.roomCode, addresses: ['127.0.0.1'] },
        { room: '测试房', config: { variant: 'duo', players: 2 } },
      ),
    );
    await expect(LanRoom.openGuest('127.0.0.1', 7667, '路人', '0000')).rejects.toThrow(/房间码/);
  });

  it('状态版本不符的请求被拒绝，房主回发快照且棋盘不变', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host, guest } = await openPair(config);
    const hostSession = new Session({
      config,
      seats: seatsFor(['房主', '小蓝'], 0),
      localSeats: [0],
      allowHint: false,
      allowUndo: false,
      net: host.bridge(),
      onExit: () => {},
    });
    hostSession.bind(() => {});
    host.gameRef = {
      serialize: () => hostSession.game.serialize(),
      seatNames: () => ['房主', '小蓝'],
    };
    host.startGame();
    hostSession.start();
    await sleep(10);
    expect(hostSession.handlePlace(hostSession.game.legalMoves(0)[0])).toBe(true);

    let synced: ReturnType<Game['serialize']> | null = null;
    guest.events.onSync = (s) => {
      synced = s;
    };
    // seat 1 sends a move that was based on an older state (v = 0)
    const stale = hostSession.game.legalMoves(1)[0];
    hostSession.netIngest(1, stale, 0);
    await waitFor(() => synced !== null);
    expect(hostSession.game.history.length).toBe(1); // stale move not applied
    expect(synced!.history.length).toBe(1);
  });

  it('客机漏掉广播（版本跳号）时自动请求全量同步', async () => {
    const config: GameConfig = { variant: 'duo', players: 2 };
    const { host, guest } = await openPair(config);
    const reference = new Game(config);
    const mv = reference.legalMoves(0)[0];
    reference.tryApply(mv);
    host.gameRef = {
      serialize: () => reference.serialize(),
      seatNames: () => ['房主', '小蓝'],
    };
    const guestSession = new Session({
      config,
      seats: seatsFor(['房主', '小蓝'], 1),
      localSeats: [1],
      allowHint: false,
      allowUndo: false,
      net: guest.bridge(),
      onExit: () => {},
    });
    guestSession.bind(() => {});
    let synced: ReturnType<Game['serialize']> | null = null;
    guest.events.onSync = (s) => {
      synced = s;
    };
    guestSession.netIngest(0, mv, 7); // v=7 while we are at 0 → gap
    await waitFor(() => synced !== null);
    expect(synced!.history.length).toBe(1);
    // the app applies the fresh snapshot via netSync (as main.ts wires it)
    guestSession.netSync(synced!);
    expect(guestSession.game.history.length).toBe(1);
  });
});

describe('协议与快照', () => {
  it('序列化快照可以重建完全一致的状态', () => {
    const g = new Game({ variant: 'standard', players: 4 });
    g.tryApply(g.legalMoves(0)[0]);
    const snapshot = g.serialize();
    const rebuilt = Game.deserialize(JSON.parse(JSON.stringify(snapshot)));
    expect([...rebuilt.board]).toEqual([...g.board]);
    expect(rebuilt.scores()).toEqual(g.scores());
  });
});
