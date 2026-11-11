import type { Action, GameConfig, SerializedGame } from '../game/types';

/** bumped whenever the LAN wire format changes; both sides must match */
export const PROTOCOL_VERSION = 2;

export interface RoomPlayer {
  slot: number;
  name: string;
  connected: boolean;
  spectator?: boolean;
}

/** game-level messages (host is authoritative) */
export type GameMsg =
  | { g: 'start'; config: GameConfig; seats: string[] }
  | { g: 'request'; a: Action; v?: number } // guest → host (v = expected state version)
  | { g: 'applied'; a: Action; v?: number } // host → guests
  | { g: 'sync'; snapshot: SerializedGame; config: GameConfig; seats: string[] }
  | { g: 'resync' } // guest → host: please send me a snapshot
  | { g: 'rematch' }
  // ---- social (LAN) ----
  | { g: 'undo-ask' } // guest → host: I would like to undo my last move
  | { g: 'undo-request'; id: string; slot: number; toIndex: number; discarded: number }
  | { g: 'undo-vote'; id: string; slot: number; ok: boolean }
  | { g: 'undo-cancel'; id: string }
  | { g: 'undo-resolved'; id: string; ok: boolean; reason?: 'reject' | 'cancel' | 'timeout'; by?: number; discarded?: number }
  | { g: 'notice'; code: 'vote-busy' | 'caretaker' | 'returned' | 'slow'; slot?: number }
  | { g: 'pause'; on: boolean }
  | { g: 'nudge'; from: number; target: number };

export type ClientMsg =
  | {
      t: 'join';
      name: string;
      token?: string;
      host?: boolean;
      hostToken?: string;
      version?: number;
      /** 4-digit room code (required for guests) */
      code?: string;
    }
  | { t: 'msg'; payload: GameMsg; to?: number }
  | { t: 'meta'; phase: 'lobby' | 'playing' }
  | { t: 'ping' };

export type ServerMsg =
  | {
      t: 'welcome';
      slot: number;
      hostSlot: number;
      room: string;
      version: number;
      players: RoomPlayer[];
      spectator?: boolean;
    }
  | { t: 'room'; hostSlot: number; players: RoomPlayer[] }
  | { t: 'msg'; from: number; payload: GameMsg }
  | { t: 'error'; code: string; msg: string; server?: number; client?: number }
  | { t: 'pong' };

export interface HostInfo {
  port: number;
  token: string;
  /** 4-digit join code, shared with the family out-of-band */
  code: string;
  /** candidate addresses, best first */
  addresses: string[];
}

export interface DiscoveredHost {
  ip: string;
  port: number;
  room: string;
  players: number;
  max: number;
  phase: string;
  variant: string;
}
