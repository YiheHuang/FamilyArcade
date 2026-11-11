import { viewFor, type ClientState, type GameState, type LogEntry, type PendingDiscard, type PendingNoble, type Phase, type ReservedCard, type Tokens, type PlayerState } from '@splendor/engine';

export interface HiddenReserved {
  hidden: true;
}
export type ViewReserved = ReservedCard | HiddenReserved;

export type ViewPlayer = Omit<PlayerState, 'reserved'> & { reserved: ViewReserved[] };

/** 统一视图：本地模式由完整 GameState 派生；局域网模式来自服务器脱敏视图 */
export interface GameView {
  players: ViewPlayer[];
  bank: Tokens;
  board: (number | null)[][];
  deckCounts: number[];
  nobles: number[];
  current: number;
  turn: number;
  turnsTaken: number[];
  phase: Phase;
  pending: PendingDiscard | PendingNoble | null;
  finalRound: boolean;
  finalTriggered: number | null;
  consecutivePasses: number;
  endReason: 'normal' | 'deadlock' | null;
  winners: number[] | null;
  log?: LogEntry[];
}

export function isHidden(r: ViewReserved): r is HiddenReserved {
  return (r as HiddenReserved).hidden === true;
}

export function localView(g: GameState): GameView {
  return {
    players: g.players.map((p) => ({ ...p, reserved: [...p.reserved] })),
    bank: { ...g.bank },
    board: g.board.map((row) => [...row]),
    deckCounts: g.decks.map((d) => d.length),
    nobles: [...g.nobles],
    current: g.current,
    turn: g.turn,
    turnsTaken: [...g.turnsTaken],
    phase: g.phase,
    pending: g.pending ? { ...g.pending } : null,
    finalRound: g.finalRound,
    finalTriggered: g.finalTriggered,
    consecutivePasses: g.consecutivePasses,
    endReason: g.endReason,
    winners: g.winners ? [...g.winners] : null,
    log: g.log,
  };
}

export function fromClientState(cs: ClientState): GameView {
  return {
    players: cs.players.map((p) => ({ ...p, reserved: p.reserved.map((r) => ({ ...r })) })),
    bank: { ...cs.bank },
    board: cs.board.map((row) => [...row]),
    deckCounts: [...cs.deckCounts],
    nobles: [...cs.nobles],
    current: cs.current,
    turn: cs.turn,
    turnsTaken: [...cs.turnsTaken],
    phase: cs.phase,
    pending: cs.pending ? { ...cs.pending } : null,
    finalRound: cs.finalRound,
    finalTriggered: cs.finalTriggered,
    consecutivePasses: cs.consecutivePasses,
    endReason: cs.endReason,
    winners: cs.winners ? [...cs.winners] : null,
    log: cs.log,
  };
}
