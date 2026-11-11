import { sameOriginWs } from '@family-arcade/lan';

export interface LanServerInfo {
  port: number;
  urls: string[];
  token: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** In the packaged app the Rust shell owns the relay; in a browser the dev
 *  `npm run lan` relay (same wire protocol) serves the built app. */
export async function startLanServer(): Promise<LanServerInfo> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('lan_start')) as LanServerInfo;
  }
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  return {
    port: 8097,
    urls: [`http://${host}:8097`],
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
  const params = new URLSearchParams({ lan: room, code, name, tutorial: '0' });
  return `${inviteBase(info)}/?${params.toString()}`;
}

export function guestWsUrl(): string {
  return sameOriginWs();
}
