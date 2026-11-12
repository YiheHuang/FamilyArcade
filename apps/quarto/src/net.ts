import { sameOriginWs } from '@family-arcade/lan';

export interface LanServerInfo {
  port: number;
  urls: string[];
  token: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function startLanServer(): Promise<LanServerInfo> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('lan_start')) as LanServerInfo;
  }
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  // In dev/preview the shared relay lives on 8080. When the built app is
  // already served by the relay (or by a LAN test server), reuse that port.
  const pagePort = typeof location !== 'undefined' ? Number(location.port) : 0;
  const port = pagePort && pagePort !== 5214 && pagePort !== 4214 ? pagePort : 8080;
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
