import { chooseMove } from './ai';
import {
  apply,
  legalMoves,
  movePieceKind,
  mustPlaceQueen,
  queenCell,
  surroundCount,
  type GameState,
  type Move,
} from '../game/hive';

export type HintKind =
  | 'win'
  | 'defend'
  | 'queen'
  | 'ant'
  | 'beetle'
  | 'spider'
  | 'grasshopper'
  | 'develop';

export interface Hint {
  move: Move;
  kind: HintKind;
}

const PIECE_HINT: Record<string, HintKind> = {
  ant: 'ant',
  beetle: 'beetle',
  spider: 'spider',
  grasshopper: 'grasshopper',
};

export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const legal = legalMoves(state);
  if (legal.length === 0 || legal.every((move) => move.type === 'pass')) return null;
  const move = chooseMove(state, 'hard', () => 0.47);
  if (!move) return null;
  const next = apply(state, move).state;

  if (next.status === 'won' && next.winner === state.turn) return { move, kind: 'win' };

  if (mustPlaceQueen(state)) return { move, kind: 'queen' };

  const queen = queenCell(state, state.turn);
  if (queen && surroundCount(state, state.turn) >= 4) {
    const after = queenCell(next, state.turn);
    if (!after || surroundCount(next, state.turn) < surroundCount(state, state.turn)) {
      return { move, kind: 'defend' };
    }
  }

  const piece = movePieceKind(state, move);
  const kind = piece ? PIECE_HINT[piece] : undefined;
  if (kind) return { move, kind };
  return { move, kind: 'develop' };
}
