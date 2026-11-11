import type { ServerMsg } from '../../server/src/protocol.js';

/** 与 WebSocket 兼容的最小接口（便于测试注入） */
export interface LanSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: ((err?: unknown) => void) | null;
}

export type LanFactory = (url: string) => LanSocketLike;

export const defaultLanFactory: LanFactory = (url) => {
  const ws = new WebSocket(url);
  const socket: LanSocketLike = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (ev) => socket.onmessage?.(typeof ev.data === 'string' ? ev.data : String(ev.data));
  ws.onclose = () => socket.onclose?.();
  ws.onerror = (err) => socket.onerror?.(err);
  return socket;
};

/** 桌面壳（Electron 预加载脚本注入的服务器信息） */
declare global {
  interface Window {
    splendorDesktop?: { serverPort?: number; serverUrls?: string[]; appVersion?: string };
  }
}

/** 桌面壳内的应用版本（浏览器打开时返回 null） */
export function desktopAppVersion(): string | null {
  const v = window.splendorDesktop?.appVersion;
  return v && /^\d/.test(v) ? v : null;
}

/** 默认服务器地址：dev/preview 连本机 8080；桌面壳用内嵌服务器端口；生产（服务器托管页面）用同源 */
export function defaultLanUrl(): string {
  const loc = window.location;
  const desk = window.splendorDesktop;
  if (desk?.serverPort) {
    return `ws://localhost:${desk.serverPort}/ws`;
  }
  if (loc.port === '5173' || loc.port === '4173') {
    return `ws://${loc.hostname}:8080/ws`;
  }
  if (loc.protocol === 'file:' || loc.hostname.endsWith('tauri.localhost') || loc.protocol === 'tauri:' || loc.protocol === 'https:') {
    return 'ws://localhost:8080/ws';
  }
  return `ws://${loc.host}/ws`;
}

export interface LanClientOptions {
  factory?: LanFactory;
  onMessage: (msg: ServerMsg) => void;
  onStatus: (connected: boolean) => void;
  /** 断线后重连成功（非首次连接）时触发，用于自动回到原座位 */
  onReconnected?: () => void;
  reconnectDelayMs?: number;
}

export class LanClient {
  private socket: LanSocketLike | null = null;
  private url: string | null = null;
  private readonly queue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private readonly factory: LanFactory;
  private hadConnection = false;
  private open = false;

  constructor(private readonly opts: LanClientOptions) {
    this.factory = opts.factory ?? defaultLanFactory;
    this.reconnectDelay = opts.reconnectDelayMs ?? 1200;
  }

  get connected(): boolean {
    return !!this.socket;
  }

  connect(url: string): void {
    this.url = url;
    if (this.socket) return;
    const socket = this.factory(url);
    socket.onopen = () => {
      this.socket = socket;
      this.open = true;
      this.reconnectDelay = this.opts.reconnectDelayMs ?? 1200;
      this.opts.onStatus(true);
      for (const data of this.queue.splice(0)) socket.send(data);
      if (this.hadConnection) this.opts.onReconnected?.();
      this.hadConnection = true;
    };
    socket.onmessage = (data) => {
      try {
        this.opts.onMessage(JSON.parse(data) as ServerMsg);
      } catch {
        /* 忽略坏消息 */
      }
    };
    socket.onclose = () => {
      this.socket = null;
      this.open = false;
      this.opts.onStatus(false);
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      /* onclose 会随后触发 */
    };
    this.socket = socket; // 视为已连接，消息先入队
  }

  private scheduleReconnect(): void {
    if (!this.url || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.url) this.connect(this.url);
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 8000);
  }

  send(msg: unknown): void {
    const data = JSON.stringify(msg);
    // 仅在连接真正建立后直接发送；连接中（CONNECTING）直接 send 会抛 InvalidStateError 且消息丢失 → 一律入队
    if (this.socket && this.open) this.socket.send(data);
    else if (this.queue.length < 50) this.queue.push(data);
  }

  disconnect(): void {
    this.url = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const s = this.socket;
    this.socket = null;
    this.open = false;
    s?.close();
    this.opts.onStatus(false);
  }
}
