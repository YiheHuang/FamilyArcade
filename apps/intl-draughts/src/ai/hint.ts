import { advance, legalMoves, type GameState, type Move } from '../game/intl-draughts';
import { chooseMove } from './ai';

export type HintKind = 'win' | 'promotion' | 'capture' | 'safe' | 'position';

export interface Hint {
  move: Move;
  kind: HintKind;
  count: number;
}

/**
 * A deterministic hint for the family UI. The hard search chooses the move;
 * the reason below explains the tactical point in plain language.
 */
export function hintFor(state: GameState): Hint | null {
  const move = chooseMove(state, 'normal', () => 0.5);
  if (!move) return null;
  const next = advance(state, move);
  if (next.status === 'won' && next.winner === state.turn) {
    return { move, kind: 'win', count: move.captures.length };
  }
  if (move.captures.length > 0) {
    return { move, kind: 'capture', count: move.captures.length };
  }
  if (move.promote) {
    return { move, kind: 'promotion', count: move.captures.length };
  }
  const replies = legalMoves(next);
  const pressured = replies.some((reply) => reply.captures.length > 0);
  return { move, kind: pressured ? 'position' : 'safe', count: 0 };
}
