import { COLORS } from './types.js';
import type { GameState, PendingDiscard, PendingNoble, Phase, PlayerState, ReservedCard, Tokens } from './types.js';

export interface HiddenReserved {
  hidden: true;
}

export interface ClientPlayerState extends Omit<PlayerState, 'reserved'> {
  reserved: (ReservedCard | HiddenReserved)[];
}

/** 面向单个座位（或观战）的视图：隐藏牌堆顺序与（可选）他人的盲抽预定卡 */
export interface ClientState {
  version: 1;
  seed: string;
  playerCount: number;
  players: ClientPlayerState[];
  bank: Tokens;
  board: (number | null)[][];
  /** 各档牌堆剩余张数（隐藏顺序） */
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
  /** 视角座位；null 表示观战 */
  you: number | null;
  log: GameState['log'];
}

export interface ViewOptions {
  /**
   * 是否隐藏他人预定卡（含从桌面明的预定卡）。
   * false（默认）：从桌面预定的卡为公开信息，仅盲抽预定卡保密（BGS 风格）；
   * true：他人所有预定卡均保密（严格模式，官方数字版风格）。
   */
  hideReserved?: boolean;
}

export function viewFor(state: GameState, seat: number | null, opts: ViewOptions = {}): ClientState {
  const hideReserved = opts.hideReserved ?? false;
  return {
    version: 1,
    seed: state.seed,
    playerCount: state.playerCount,
    players: state.players.map((p) => ({
      ...p,
      reserved: p.reserved.map((r) => {
        const isSelf = seat != null && p.seat === seat;
        if (!isSelf && hideReserved && r.fromDeck) return { hidden: true } as const;
        return r;
      }),
    })),
    bank: { ...state.bank },
    board: state.board.map((row) => [...row]),
    deckCounts: state.decks.map((d) => d.length),
    nobles: [...state.nobles],
    current: state.current,
    turn: state.turn,
    turnsTaken: [...state.turnsTaken],
    phase: state.phase,
    pending: state.pending ? { ...state.pending } : null,
    finalRound: state.finalRound,
    finalTriggered: state.finalTriggered,
    consecutivePasses: state.consecutivePasses,
    endReason: state.endReason,
    winners: state.winners ? [...state.winners] : null,
    you: seat,
    log: state.log,
  };
}

/** 是否需要该座位做决定（LAN/热座轮转与 AI 驱动用） */
export function awaitingSeat(state: GameState): number | null {
  if (state.phase === 'ended') return null;
  return state.current;
}

/** 玩家令牌总数（含金币） */
export function tokenCount(p: PlayerState): number {
  return COLORS.reduce((s, c) => s + p.tokens[c], 0) + p.tokens.gold;
}
