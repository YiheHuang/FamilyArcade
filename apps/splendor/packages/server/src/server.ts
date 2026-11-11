import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { checkAsarPayload } from './asar-check.js';
import { RoomManager } from './rooms.js';
import type { SessionHost } from './session.js';
import { Session } from './session.js';
import { createStaticHandler } from './static.js';

export interface StartServerOptions {
  /** 监听端口（默认 8080；0 = 由系统分配空闲端口） */
  port?: number;
  /** 依次尝试的端口序列（端口被占用时自动顺延；优先于 port） */
  ports?: number[];
  /** 前端构建产物目录；缺省时只服务"未构建"说明页 */
  clientDir?: string;
  /** 房间存档路径（默认：进程工作目录下 data/lan-rooms.json） */
  saveFile?: string;
  /** 更新包目录（存在时对外提供 /updates/*，供桌面端自动更新） */
  updatesDir?: string;
  /** 是否允许局域网内其他电脑上传更新包（POST /updates/publish；默认关闭） */
  allowUpdatePublish?: boolean;
  /** 服务器版本（客户端据此提示版本不一致；默认读环境变量 SPLENDOR_VERSION） */
  appVersion?: string;
  /** 日志回调（默认输出到控制台） */
  onLog?: (line: string) => void;
}

export interface SplendorServerHandle {
  /** 实际监听端口 */
  port: number;
  /** 本机访问地址 */
  localUrl: string;
  /** 局域网可访问地址（其他设备用浏览器打开） */
  lanUrls: string[];
  /** 房间存档文件路径 */
  saveFile: string;
  /** 是否找到前端构建产物 */
  hasClient: boolean;
  /** 开/关"允许局域网内其他电脑上传更新包" */
  setAllowUpdatePublish: (allow: boolean) => void;
  /** 停止服务并落盘存档 */
  close: () => Promise<void>;
}

/** 虚拟网卡（WSL/Docker/VPN 等）名字特征：家庭场景下这些地址对其他设备不可用 */
const VIRTUAL_IFACE = /vethernet|virtual|vmware|virtualbox|hyper-v|wsl|docker|tailscale|zerotier|loopback|bluetooth|tun|tap/i;

export function ipScore(address: string, iface: string): number {
  let score = 0;
  if (/^192\.168\./.test(address)) score = 0;
  else if (/^10\./.test(address)) score = 1;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score = 2;
  else score = 3; // 公网/其他
  if (VIRTUAL_IFACE.test(iface)) score += 10;
  return score;
}

/** 枚举本机局域网 IPv4 地址（过滤链路本地与虚拟网卡，按"家人能用"排序） */
export function collectLanUrls(port: number): string[] {
  const found: Array<{ url: string; score: number }> = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (ni.address.startsWith('169.254.')) continue; // 链路本地地址对其他设备无意义
      found.push({ url: `http://${ni.address}:${port}`, score: ipScore(ni.address, iface) });
    }
  }
  found.sort((a, b) => a.score - b.score);
  return found.map((f) => f.url);
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onOk);
      reject(err);
    };
    const onOk = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port);
  });
}

/**
 * 启动 Splendor 局域网服务器（HTTP 静态资源 + /ws WebSocket 房间服务）。
 * 可被 Node CLI 与桌面壳（Electron 主进程）同时复用。
 */
export async function startSplendorServer(options: StartServerOptions = {}): Promise<SplendorServerHandle> {
  const log = options.onLog ?? ((line: string): void => console.log(`[splendor] ${line}`));
  const saveFile = options.saveFile ?? path.resolve(process.cwd(), 'data/lan-rooms.json');
  const candidates = options.ports && options.ports.length > 0 ? options.ports : [options.port ?? 8080];

  const manager = new RoomManager();

  // ---------------- 持久化（去抖写入） ----------------
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const writeSave = (): void => {
    try {
      fs.mkdirSync(path.dirname(saveFile), { recursive: true });
      fs.writeFileSync(saveFile, JSON.stringify(manager.toSnapshot(), null, 1), 'utf8');
    } catch (err) {
      log(`failed to write room save: ${String(err)}`);
    }
  };
  const flushSave = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeSave();
  };
  const scheduleSave = (): void => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeSave();
    }, 600);
  };
  manager.setPersistHook(scheduleSave);

  try {
    if (fs.existsSync(saveFile)) {
      const snap = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
      const n = manager.fromSnapshot(snap);
      if (n > 0) log(`restored ${n} room(s) from save (players can rejoin with the same code)`);
    }
  } catch (err) {
    log(`failed to read room save (ignored): ${String(err)}`);
  }
  manager.startWatchdog();

  // ---------------- HTTP + WebSocket ----------------
  const clientDist = options.clientDir ?? path.resolve(process.cwd(), '__no_client_dist__');
  const hasClient = fs.existsSync(path.join(clientDist, 'index.html'));
  const staticHandler = createStaticHandler(clientDist);
  const updatesRoot = options.updatesDir ? path.resolve(options.updatesDir) : null;
  /** 是否允许其他电脑上传更新包（桌面端设置页可开；默认关） */
  let allowPublish = options.allowUpdatePublish ?? process.env.SPLENDOR_ALLOW_PUBLISH === '1';

  /**
   * Electron 的 fs 会把 *.asar 当压缩包（读成"压缩包内路径"）→ 读写更新包时必须临时关掉。
   * 在纯 Node 里 process.noAsar 只是普通属性，赋值无副作用。
   */
  function withNoAsar<T>(fn: () => T): T {
    const p = process as unknown as { noAsar?: boolean | undefined };
    const prev = p.noAsar;
    p.noAsar = true;
    try {
      return fn();
    } finally {
      p.noAsar = prev;
    }
  }

  /** 更新源里的当前版本（读 update.json；3 秒缓存） */
  let updateInfoCache: { at: number; version: string | null } = { at: 0, version: null };
  const readUpdateVersion = (): string | null => {
    if (!updatesRoot) return null;
    const now = Date.now();
    if (now - updateInfoCache.at < 3000) return updateInfoCache.version;
    let version: string | null = null;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(updatesRoot, 'update.json'), 'utf8')) as { version?: string };
      version = typeof raw.version === 'string' && raw.version ? raw.version : null;
    } catch {
      version = null;
    }
    updateInfoCache = { at: now, version };
    return version;
  };

  /** 校验并落盘一个上传的更新包（先写临时文件，再原子改名） */
  const acceptPublish = (body: Buffer, version: string, sha256: string, remote: string): { ok: boolean; error?: string } => {
    if (!updatesRoot) return { ok: false, error: 'this server does not expose an updates folder' };
    if (!allowPublish) return { ok: false, error: 'update publish is disabled on this server' };
    if (!version || !/^[\w.\-+]{1,32}$/.test(version)) return { ok: false, error: 'invalid version' };
    if (!sha256 || !/^[0-9a-f]{64}$/i.test(sha256)) return { ok: false, error: 'invalid sha256' };
    const len = body.length;
    if (len < 16 * 1024) return { ok: false, error: 'payload too small' };
    if (len > 256 * 1024 * 1024) return { ok: false, error: 'payload too large' };
    const actual = crypto.createHash('sha256').update(body).digest('hex');
    if (actual !== sha256.toLowerCase()) return { ok: false, error: 'sha256 mismatch' };
    const bad = checkAsarPayload(body);
    if (bad) return { ok: false, error: bad };
    try {
      fs.mkdirSync(updatesRoot, { recursive: true });
      const tmp = path.join(updatesRoot, `app.asar.tmp-${process.pid}`);
      const target = path.join(updatesRoot, 'app.asar');
      const prevFile = path.join(updatesRoot, 'app.asar.prev');
      withNoAsar(() => {
        fs.writeFileSync(tmp, body);
        if (fs.existsSync(target)) fs.copyFileSync(target, prevFile);
        fs.renameSync(tmp, target);
      });
      const manifest = {
        version,
        asar: 'app.asar',
        sha256: actual,
        size: len,
        createdAt: new Date().toISOString(),
        notes: `published from ${remote}`,
      };
      fs.writeFileSync(path.join(updatesRoot, 'update.json'), JSON.stringify(manifest, null, 2), 'utf8');
      updateInfoCache = { at: 0, version: null };
      log(`update published by ${remote}: v${version} (${(len / 1024 / 1024).toFixed(2)} MB)`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `write failed: ${String(err)}` };
    }
  };

  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    // 更新包上传：POST /updates/publish（体积受限、校验 sha256 与 asar 结构）
    if (url.startsWith('/updates/publish')) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'use POST' }));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let aborted = false;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > 256 * 1024 * 1024) {
          aborted = true;
          res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (aborted) return;
        const header = (name: string): string => String(req.headers[name.toLowerCase()] ?? '');
        const remote = req.socket.remoteAddress ?? 'unknown';
        const result = acceptPublish(Buffer.concat(chunks), header('x-splendor-version'), header('x-splendor-sha256'), remote);
        res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      });
      return;
    }
    // 更新包：/updates/<file>（只读、无 SPA 回退、不做缓存）
    if (updatesRoot && url.startsWith('/updates/')) {
      const rel = decodeURIComponent(url.slice('/updates/'.length).split('?')[0] ?? '');
      const filePath = path.resolve(updatesRoot, rel);
      if (!filePath.startsWith(updatesRoot)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      // 同步读 + 关掉 asar 支持（Electron 里 app.asar 是真实文件而非压缩包）
      const data = withNoAsar(() => {
        try {
          return fs.readFileSync(filePath);
        } catch {
          return null;
        }
      });
      if (!data) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.json' ? 'application/json; charset=utf-8' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'content-length': data.length });
      res.end(data);
      return;
    }
    staticHandler(req, res);
  });

  const host: SessionHost = {
    manager,
    urls: [],
    appVersion: options.appVersion ?? process.env.SPLENDOR_VERSION ?? 'dev',
    updateInfo: () => {
      if (!updatesRoot) return null;
      const version = readUpdateVersion();
      const info: { updates: boolean; updatePublish: boolean; updateVersion?: string } = {
        updates: true,
        updatePublish: allowPublish,
      };
      if (version) info.updateVersion = version;
      return info;
    },
    log,
  };

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    const session = new Session(host, (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    });
    session.greet();
    ws.on('message', (data) => session.handle(String(data)));
    ws.on('close', () => session.disconnect());
    ws.on('error', () => session.disconnect());
  });

  const cleanup = (): void => {
    manager.stopWatchdog();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        /* ignore */
      }
    }
    try {
      wss.close();
    } catch {
      /* ignore */
    }
  };

  let boundPort = -1;
  let listenError: unknown = null;
  for (const candidate of candidates) {
    try {
      await listen(server, candidate);
      boundPort = (server.address() as AddressInfo).port;
      break;
    } catch (err) {
      listenError = err;
    }
  }
  if (boundPort < 0) {
    cleanup();
    manager.setPersistHook(null);
    throw listenError instanceof Error ? listenError : new Error('无法监听指定端口');
  }

  const lanUrls = collectLanUrls(boundPort);
  host.urls = lanUrls;

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    cleanup();
    flushSave();
    manager.setPersistHook(null);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 800);
    });
  };

  return {
    port: boundPort,
    localUrl: `http://localhost:${boundPort}`,
    lanUrls,
    saveFile,
    hasClient,
    setAllowUpdatePublish: (allow: boolean) => {
      allowPublish = allow;
      log(`update publish ${allow ? 'enabled' : 'disabled'} by the host`);
    },
    close,
  };
}
