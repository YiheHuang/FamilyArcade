/**
 * 浏览器可用的核心：房间/会话/协议（不含任何 Node 依赖）。
 *
 * 两种宿主共用同一份逻辑：
 *  - Node 宿主：`src/index.ts`（`npm run lan`、CI 用的独立服务器）；
 *  - 桌面宿主：Tauri 壳里的主机前端（Rust 只做中继），见 `packages/client/src/lanHost.ts`。
 */
export { RoomManager, TURN_LIMIT_CHOICES } from './rooms.js';
export type { Room, RoomSeat } from './rooms.js';
export { Session } from './session.js';
export type { SessionHost } from './session.js';
export { isClientMsg } from './protocol.js';
export type { ClientLike, ClientMsg, SeatInfo, ServerMsg } from './protocol.js';
