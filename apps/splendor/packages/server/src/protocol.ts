import type { AiLevel, ClientState, GameEvent, Move } from '@splendor/engine';

/** 可收消息的连接（WebSocket 或测试假客户端） */
export interface ClientLike {
  send(msg: ServerMsg): void;
}

/** 座位对外信息 */
export interface SeatInfo {
  seat: number;
  /** open = 等待玩家加入；human = 已配置为人类；ai = 电脑 */
  kind: 'open' | 'human' | 'ai';
  name: string;
  connected: boolean;
  aiLevel?: AiLevel;
  /** 掉线后临时托管中 */
  autoPlaying?: boolean;
}

/** 客户端 -> 服务器 */
export type ClientMsg =
  | { t: 'create'; name: string; seatCount: number; turnSeconds?: number }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'spectate'; code: string; name?: string }
  | { t: 'setSeat'; seat: number; kind: 'open' | 'ai'; aiLevel?: AiLevel }
  | { t: 'start' }
  | { t: 'move'; move: Move }
  | { t: 'undo:request' }
  | { t: 'undo:respond'; accept: boolean }
  | { t: 'undo:cancel' }
  | { t: 'leave' }
  | { t: 'ping' };

/** 服务器 -> 客户端 */
export type ServerMsg =
  | {
      t: 'welcome';
      urls: string[];
      appVersion?: string;
      /** 本服务器是否在 /updates/ 提供自动更新包 */
      updates?: boolean;
      /** 更新源里当前的版本号（存在 update.json 时） */
      updateVersion?: string;
      /** 是否允许局域网内其他电脑上传更新包 */
      updatePublish?: boolean;
    }
  | {
      t: 'room';
      code: string;
      you: { seat: number | null; token: string | null; spectator: boolean };
      hostSeat: number;
      seats: SeatInfo[];
      started: boolean;
      /** 本房间思考时间（秒，0=不限） */
      turnSeconds: number;
    }
  | { t: 'state'; view: ClientState; events: GameEvent[]; move?: Move; moveCount?: number; seed?: string }
  /** 悔棋：有人请求（voters 为需要表态的座位） */
  | { t: 'undo:ask'; seat: number; name: string; voters: number[] }
  /** 悔棋结果（ok=false 表示拒绝或取消） */
  | { t: 'undo:result'; ok: boolean; seat: number }
  /** 回合读秒（服务器权威，每秒推送一次；纯提示，不做强制） */
  | { t: 'clock'; seat: number; remaining: number; over: number }
  /** 错误：code 为本地化键（如 E_NOT_YOUR_TURN，可带 :参数） */
  | { t: 'error'; code: string }
  | { t: 'left' }
  | { t: 'pong' };

export function isClientMsg(value: unknown): value is ClientMsg {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}
