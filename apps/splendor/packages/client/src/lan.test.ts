import { describe, expect, it } from 'vitest';
import { LanClient, type LanSocketLike } from './lan';

/** 可手工触发生命周期的假 WebSocket：真实 WebSocket 在 CONNECTING 阶段 send 会抛错 */
class FakeSocket implements LanSocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err?: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.();
  }
}

function makeClient(socket: FakeSocket): { client: LanClient; status: boolean[]; messages: unknown[] } {
  const status: boolean[] = [];
  const messages: unknown[] = [];
  const client = new LanClient({
    factory: () => socket,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => status.push(s),
    reconnectDelayMs: 60_000,
  });
  return { client, status, messages };
}

describe('LanClient 连接期消息队列', () => {
  it('连接建立前发送的消息在 onopen 后按序补发（不会抛错丢消息）', () => {
    const socket = new FakeSocket();
    const { client } = makeClient(socket);
    client.connect('ws://localhost:8080/ws');
    client.send({ t: 'createRoom', name: '爸爸', count: 2 });
    client.send({ t: 'chat', text: 'hi' });
    expect(socket.sent).toEqual([]); // 连接中：不能直接 send
    socket.open();
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ t: 'createRoom' });
    expect(JSON.parse(socket.sent[1]!)).toMatchObject({ t: 'chat' });
  });

  it('连接建立后直接发送；断线后消息重新入队等待重连', () => {
    const socket = new FakeSocket();
    const { client, status } = makeClient(socket);
    client.connect('ws://localhost:8080/ws');
    socket.open();
    client.send({ t: 'ready' });
    expect(socket.sent).toHaveLength(1);
    socket.onclose?.(); // 掉线
    client.send({ t: 'ready' });
    expect(socket.sent).toHaveLength(1); // 旧连接不再收到（重连成功后才补发）
    expect(status).toEqual([true, false]);
    client.disconnect();
  });
});
