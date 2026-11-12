import { chooseMove } from './ai';
import { applyMove, type GameState, type Move, type PieceType } from '../game/xiangqi';

export type HintKind = 'mate' | 'trap' | 'capture' | 'check' | 'escape' | 'develop';

export interface Hint {
  move: Move;
  kind: HintKind;
  captured?: PieceType;
}

/**
 * Explainable hint for the side to move. The move comes from the deterministic
 * Hard search; the reason is read from the resulting position.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.5);
  if (!move) return null;
  const captured = state.board[move.to]?.type;
  const result = applyMove(state, move.from, move.to);
  if (!result.ok) return null;
  if (result.state.status === 'won' && result.state.winner === state.turn) {
    return { move, kind: result.state.reason === 'checkmate' ? 'mate' : 'trap' };
  }
  if (captured) return { move, kind: 'capture', captured };
  if (result.state.check) return { move, kind: 'check' };
  if (state.check) return { move, kind: 'escape' };
  return { move, kind: 'develop' };
}
