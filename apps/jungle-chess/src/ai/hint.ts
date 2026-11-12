import { chooseMove } from './ai';
import {
  apply,
  decodeMove,
  distance,
  enemyDen,
  opposite,
  trapOwner,
  type Animal,
  type GameState,
} from '../game/jungle-chess';

export type HintKind = 'den' | 'capture' | 'jump' | 'trap' | 'advance' | 'safe';

export interface Hint {
  move: number;
  from: number;
  to: number;
  kind: HintKind;
  animal?: Animal;
}

/**
 * A deterministic, explainable hint. The move comes from the Hard search; the
 * reason is derived from the resulting position so the toast can say why.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.5);
  if (move < 0) return null;
  const decoded = decodeMove(move);
  if (!decoded) return null;
  const piece = state.board[decoded.from];
  if (!piece) return null;

  const after = apply(state, move).state;
  if (after.status === 'won' && after.winner === state.turn) {
    return {
      move,
      ...decoded,
      kind: after.reason === 'den' ? 'den' : 'capture',
    };
  }

  const target = state.board[decoded.to];
  if (target) {
    return { move, ...decoded, kind: 'capture', animal: target.kind };
  }

  const jump = distance(decoded.from, decoded.to) > 1;
  if (jump) return { move, ...decoded, kind: 'jump' };

  const trap = trapOwner(decoded.from);
  if (trap === opposite(state.turn)) return { move, ...decoded, kind: 'trap' };

  if (distance(decoded.to, enemyDen(state.turn)) < distance(decoded.from, enemyDen(state.turn))) {
    return { move, ...decoded, kind: 'advance' };
  }

  return { move, ...decoded, kind: 'safe' };
}
