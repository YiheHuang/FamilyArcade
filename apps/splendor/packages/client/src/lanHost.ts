/**
 * 桌面宿主（Tauri 壳）里的"权威端"。
 *
 * Rust 侧只是哑中继：每条 WebSocket 连接的消息通过 `lan://msg` 事件送进来，
 * 这里用与 Node 宿主（`npm run lan`、CI）**完全同一份** `RoomManager/Session`
 * 处理，回包再经 `lan_send` 发回去。规则逻辑因此零重复、测试覆盖共享。
 */
import type { RoomManager as RoomManagerType, Session as SessionType, ServerMsg } from '@splendor/server/lan-core';
import { desktopLog } from './desktop-update';
import { useGame } from './store';

interface TauriGlobal {
  core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event: { listen: (name: string, cb: (e: { payload: unknown }) => void) => Promise<() => void> };
}

interface RelayPayload {
  id: number;
  text?: string;
}

export interface LanHostHandle {
  manager: RoomManagerType;
  stats: { open: number; msg: number; close: number };
  sessions: Map<number, SessionType>;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __lanHost?: LanHostHandle;
  }
}

const tauri = (): TauriGlobal | null => (typeof window === 'undefined' ? null : (window.__TAURI__ ?? null));

/**
 * 挂载主机权威端（仅在 Tauri 壳内生效；浏览器打开时静默跳过）。
 * 由 `main.tsx` 在渲染前调用，保证第一条 WebSocket 消息到达时已经就绪。
 *
 * 房间核心按需动态载入：浏览器/手机客户端不会为此多下载代码。
 */
export function attachLanHost(): void {
  const T = tauri();
  if (!T || window.__lanHost) return;
  void buildHost(T);
}

async function buildHost(T: TauriGlobal): Promise<void> {
  const { RoomManager, Session } = await import('@splendor/server/lan-core');
  const invoke = T.core.invoke;
  const manager = new RoomManager();

  const stats = { open: 0, msg: 0, close: 0 };
  const sessions = new Map<number, SessionType>();

  // 房间存档：每次变更去抖写入 `%APPDATA%\Splendor\lan-rooms.json`（Rust 侧落盘）
  manager.setPersistHook(() => {
    try {
      void invoke('lan_save_rooms', { snapshot: manager.toSnapshot() }).catch(() => undefined);
    } catch {
      /* 忽略：存档失败不影响对局 */
    }
  });

  const host = {
    manager,
    urls: [] as string[],
    appVersion: window.splendorDesktop?.appVersion ?? 'dev',
    updateInfo: () => cachedUpdateInfo,
    log: (line: string) => desktopLog(`[lan] ${line}`),
  };
  let cachedUpdateInfo: { updates: boolean; updatePublish: boolean; updateVersion?: string } | null = null;
  const refreshUpdateInfo = async (): Promise<void> => {
    try {
      const info = (await invoke('update_source')) as { updates?: boolean; updatePublish?: boolean; updateVersion?: string | null };
      cachedUpdateInfo = {
        updates: info?.updates === true,
        updatePublish: info?.updatePublish === true,
        ...(info?.updateVersion ? { updateVersion: info.updateVersion } : {}),
      };
    } catch {
      cachedUpdateInfo = null;
    }
  };

  const sendTo = (id: number) => (msg: ServerMsg): void => {
    void invoke('lan_send', { id, text: JSON.stringify(msg) }).catch(() => undefined);
  };

  const wire = async (): Promise<void> => {
    // 恢复房间（重开应用后房间码仍可加入）
    try {
      const snapshot = await invoke('lan_load_rooms');
      if (snapshot && typeof snapshot === 'object') {
        const restored = manager.fromSnapshot(snapshot as Parameters<RoomManagerType['fromSnapshot']>[0]);
        if (restored > 0) desktopLog(`[lan] 已恢复 ${restored} 个房间`);
      }
    } catch {
      /* 没有存档或读取失败：正常开局 */
    }
    try {
      const urls = (await invoke('lan_addresses')) as string[];
      host.urls = Array.isArray(urls) ? urls : [];
    } catch {
      /* 地址仅用于展示 */
    }
    await refreshUpdateInfo();
    manager.startWatchdog();

    await T.event.listen('lan://open', (e) => {
      const { id } = e.payload as RelayPayload;
      stats.open += 1;
      const session = new Session(host, sendTo(id));
      sessions.set(id, session);
      session.greet();
    });
    await T.event.listen('lan://msg', (e) => {
      const { id, text } = e.payload as RelayPayload;
      stats.msg += 1;
      sessions.get(id)?.handle(String(text ?? ''));
    });
    await T.event.listen('lan://close', (e) => {
      const { id } = e.payload as RelayPayload;
      stats.close += 1;
      sessions.get(id)?.disconnect();
      sessions.delete(id);
    });
    await T.event.listen('lan://host-started', () => {
      void invoke('lan_addresses')
        .then((urls) => {
          host.urls = Array.isArray(urls) ? (urls as string[]) : [];
        })
        .catch(() => undefined);
      void refreshUpdateInfo();
    });
    // 更新源内容变化（本机发布 / 别人上传 / 权限切换）时刷新通告
    await T.event.listen('update://source-changed', () => {
      void refreshUpdateInfo();
    });

    // 房间状态变化时更新 UDP 广播（家里另一台电脑能在「局域网对战」里看到）
    let lastSig = '';
    const pushAdvertise = (): void => {
      const lan = useGame.getState().lan;
      const code = lan?.code ?? '';
      const seats = lan?.seats.length ?? 0;
      const humans = lan?.seats.filter((s) => s.kind === 'human').length ?? 0;
      const started = lan?.started ?? false;
      const sig = `${code}:${seats}:${humans}:${started}`;
      if (sig === lastSig) return;
      lastSig = sig;
      void invoke('discovery_set_advertise', {
        advertise: { code, seats, humans, open: !started, started },
      }).catch(() => undefined);
    };
    pushAdvertise();
    useGame.subscribe(pushAdvertise);

    window.__lanHost = { manager, stats, sessions };
    desktopLog(`[lan] 主机权威端就绪（${host.urls.length} 个局域网地址）`);
  };

  void wire();
}
