import { desktopAppVersion } from './lan';

/**
 * 桌面端的自动更新（走主进程 IPC）：
 * 更新源是一个静态目录，由任意一台机器的内置服务器通过 /updates/ 提供（或任意 HTTP 静态服务）。
 */

export interface DesktopUpdateState {
  appVersion: string;
  updatesDir: string;
  staged: { version: string; sha256: string; at: number } | null;
  /** 是否允许局域网内其他电脑上传更新包（本机作为服务器时） */
  allowPublish: boolean;
  /** 上一次更新失败并自动回滚的记录（界面提示一次后清除） */
  lastFailure: { version: string; status: string; at: number } | null;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
  current: string;
  error?: string;
}

export interface UpdateDownloadResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface PublishResult {
  ok: boolean;
  version?: string;
  sha256?: string;
  size?: number;
  dir?: string;
  error?: string;
}

export interface UploadResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface DiagnosticsInfo {
  appVersion: string;
  platform: string;
  electron: string;
  updatesDir: string;
  logsDir: string;
  serverPort: number;
  serverUrls: string[];
  logTail: string;
}

/** 更新源里当前的版本（设置页显示"更新包：已就绪 vX"） */
export interface ServerUpdateStatus {
  state: 'none' | 'ready' | 'empty' | 'error';
  version?: string;
  error?: string;
}

interface DesktopBridge {
  serverPort?: number;
  serverUrls?: string[];
  appVersion?: string;
  update?: {
    state: () => Promise<DesktopUpdateState>;
    check: (source: string) => Promise<UpdateCheckResult>;
    download: (source: string) => Promise<UpdateDownloadResult>;
    apply: () => Promise<boolean>;
    publish: () => Promise<PublishResult>;
    upload: (source: string) => Promise<UploadResult>;
    permissionGet: () => Promise<{ allowPublish: boolean }>;
    permissionSet: (allow: boolean) => Promise<{ allowPublish: boolean }>;
    ackFailure: () => Promise<boolean>;
  };
  log?: {
    write: (line: string, level?: 'info' | 'warn' | 'error') => Promise<boolean>;
    openDir: () => Promise<boolean>;
    diagnostics: () => Promise<DiagnosticsInfo>;
  };
  /** UDP 房间发现（仅桌面壳） */
  discovery?: {
    scan: (timeoutMs?: number) => Promise<DiscoveredRoom[]>;
  };
}

export interface DiscoveredRoom {
  host: string;
  ip: string;
  port: number;
  /** 本机自己（界面里过滤掉） */
  own?: boolean;
  code: string;
  seats: number;
  humans: number;
  open: boolean;
  started: boolean;
  version: string;
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as { splendorDesktop?: DesktopBridge }).splendorDesktop;
  return b && b.update ? b : null;
}

export function updatesSupported(): boolean {
  return !!desktopBridge();
}

export function logsSupported(): boolean {
  return !!desktopBridge()?.log;
}

export async function updateState(): Promise<DesktopUpdateState | null> {
  const b = desktopBridge();
  if (!b?.update) return null;
  try {
    return await b.update.state();
  } catch {
    return null;
  }
}

export async function checkUpdate(source: string): Promise<UpdateCheckResult> {
  const b = desktopBridge();
  const current = desktopAppVersion() ?? '';
  if (!b?.update) return { available: false, current, error: 'not-desktop' };
  if (!source.trim()) return { available: false, current, error: 'no-source' };
  try {
    return await b.update.check(source.trim());
  } catch (err) {
    return { available: false, current, error: String(err) };
  }
}

export async function downloadUpdate(source: string): Promise<UpdateDownloadResult> {
  const b = desktopBridge();
  if (!b?.update) return { ok: false, error: 'not-desktop' };
  try {
    return await b.update.download(source.trim());
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function applyUpdate(): Promise<void> {
  const b = desktopBridge();
  if (!b?.update) return;
  try {
    await b.update.apply();
  } catch {
    /* 重启失败时忽略 */
  }
}

/** 把本机版本写成更新源里的更新包（本机作为更新源时） */
export async function publishLocal(): Promise<PublishResult> {
  const b = desktopBridge();
  if (!b?.update) return { ok: false, error: 'not-desktop' };
  try {
    return await b.update.publish();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** 把本机版本上传给更新源服务器（对方需开启） */
export async function uploadLocal(source: string): Promise<UploadResult> {
  const b = desktopBridge();
  if (!b?.update) return { ok: false, error: 'not-desktop' };
  if (!source.trim()) return { ok: false, error: 'no-source' };
  try {
    return await b.update.upload(source.trim());
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getPublishPermission(): Promise<boolean> {
  const b = desktopBridge();
  if (!b?.update) return false;
  try {
    return (await b.update.permissionGet()).allowPublish;
  } catch {
    return false;
  }
}

export async function setPublishPermission(allow: boolean): Promise<boolean> {
  const b = desktopBridge();
  if (!b?.update) return false;
  try {
    return (await b.update.permissionSet(allow)).allowPublish;
  } catch {
    return false;
  }
}

export async function ackUpdateFailure(): Promise<void> {
  const b = desktopBridge();
  if (!b?.update) return;
  try {
    await b.update.ackFailure();
  } catch {
    /* ignore */
  }
}

/** 是否支持 UDP 房间发现（仅桌面壳） */
export function discoverySupported(): boolean {
  return !!desktopBridge()?.discovery;
}

/** 搜索附近正在开着的房间 */
export async function scanNearbyRooms(timeoutMs = 1200): Promise<DiscoveredRoom[]> {
  const bridge = desktopBridge();
  if (!bridge?.discovery) return [];
  try {
    const list = await bridge.discovery.scan(timeoutMs);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function openLogDir(): Promise<void> {
  const b = desktopBridge();
  if (!b?.log) return;
  try {
    await b.log.openDir();
  } catch {
    /* ignore */
  }
}

export async function readDiagnostics(): Promise<DiagnosticsInfo | null> {
  const b = desktopBridge();
  if (!b?.log) return null;
  try {
    return await b.log.diagnostics();
  } catch {
    return null;
  }
}

/** 渲染端错误上报（无桌面桥接时静默丢弃） */
export function desktopLog(line: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const b = desktopBridge();
  if (!b?.log) return;
  void b.log.write(line, level).catch(() => undefined);
}

/** 由局域网服务器地址推导更新源（ws://host:port/ws → http://host:port/updates） */
export function updateSourceFromLan(lanUrl: string): string {
  const m = lanUrl.match(/^wss?:\/\/([^/]+)/i);
  if (!m) return '';
  return `http://${m[1]}/updates`;
}

/**
 * 查询更新源里当前提供的版本（设置页/启动提示用）：
 * 直接用 HTTP 读 update.json，因此浏览器端也能显示。
 */
export async function fetchServerUpdateStatus(source: string): Promise<ServerUpdateStatus> {
  if (!source.trim()) return { state: 'none' };
  try {
    const res = await fetch(`${source.replace(/\/$/, '')}/update.json`, { cache: 'no-store' });
    if (res.status === 404) return { state: 'empty' };
    if (!res.ok) return { state: 'error', error: `HTTP ${res.status}` };
    const info = (await res.json()) as { version?: string };
    if (!info.version) return { state: 'empty' };
    return { state: 'ready', version: info.version };
  } catch (err) {
    return { state: 'error', error: String(err) };
  }
}

const SOURCE_KEY = 'splendor.update.source.v1';
const SKIP_KEY = 'splendor.update.skip.v1';

export function loadUpdateSource(): string {
  try {
    return localStorage.getItem(SOURCE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveUpdateSource(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(SOURCE_KEY, url.trim());
    else localStorage.removeItem(SOURCE_KEY);
  } catch {
    /* ignore */
  }
}

/** 记住"稍后再说"的版本，避免每次启动都弹窗 */
export function skipUpdateVersion(version: string): void {
  try {
    localStorage.setItem(SKIP_KEY, version);
  } catch {
    /* ignore */
  }
}

export function skippedUpdateVersion(): string {
  try {
    return localStorage.getItem(SKIP_KEY) ?? '';
  } catch {
    return '';
  }
}
