import { sameOriginWs } from '@family-arcade/lan';

export interface LanServerInfo {
  port: number;
  urls: string[];
  token: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function browserLanPort(): number {
  if (typeof location === 'undefined') return 8080;
  const raw = new URLSearchParams(location.search).get('lanPort');
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080;
}

export async function startLanServer(): Promise<LanServerInfo> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('lan_start')) as LanServerInfo;
  }
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  const port = browserLanPort();
  return {
    port,
    urls: [`http://${host}:${port}`],
    token: 'browser',
  };
}

export function hostWsUrl(info: LanServerInfo): string {
  if (isTauri()) return `ws://127.0.0.1:${info.port}/ws`;
  return `ws://${location.hostname}:${info.port}/ws`;
}

export function inviteBase(info: LanServerInfo): string {
  return info.urls[0] ?? `http://${location.hostname}:${info.port}`;
}

export function inviteUrl(info: LanServerInfo, room: string, code: string, name = 'Guest'): string {
  const params = new URLSearchParams({ lan: room, code, name });
  return `${inviteBase(info)}/?${params.toString()}`;
}

export function guestWsUrl(): string {
  return sameOriginWs();
}
