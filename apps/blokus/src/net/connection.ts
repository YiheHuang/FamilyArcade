import type { ClientMsg, ServerMsg } from './protocol';

/** minimal WebSocket surface, so tests can inject a fake */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
}

export class NetConnection {
  onMsg: ((m: ServerMsg) => void) | null = null;
  onClose: (() => void) | null = null;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private closedByUs = false;

  /** overridable for tests */
  static socketFactory: (url: string) => WebSocketLike = (url) =>
    new WebSocket(url) as unknown as WebSocketLike;

  static open(url: string, timeoutMs = 6000): Promise<NetConnection> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = NetConnection.socketFactory(url);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error('连接超时'));
      }, timeoutMs);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new NetConnection(ws));
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('无法连接'));
      };
    });
  }

  constructor(private ws: WebSocketLike) {
    ws.onmessage = (ev) => {
      let parsed: ServerMsg | null = null;
      try {
        parsed = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      this.onMsg?.(parsed);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (!this.closedByUs) this.onClose?.();
    };
    this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 25000);
  }

  send(m: ClientMsg): void {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(m));
    }
  }

  close(): void {
    this.closedByUs = true;
    clearInterval(this.pingTimer);
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
