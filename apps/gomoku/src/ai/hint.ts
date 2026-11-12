import { analyseMove, chooseMove } from './ai';
import { CENTER, other, wouldWin, type GameState, type Mark } from '../game/gomoku';

export type HintKind = 'win' | 'block' | 'openFour' | 'four' | 'openThree' | 'center' | 'balance';

export interface Hint {
  move: number;
  kind: HintKind;
  threat?: Mark;
}

/**
 * A deterministic, explainable hint for the side to move. The move comes from
 * the Hard threat-space search; the reason is read back from the board so the
 * UI can explain *why* it is good.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.5);
  if (move < 0 || state.board[move] !== null) return null;
  return describe(state, move);
}

export function describe(state: GameState, move: number): Hint | null {
  if (state.status !== 'playing' || state.board[move] !== null) return null;
  const me = state.turn;
  const opp = other(me);

  if (wouldWin(state.board, move, me)) return { move, kind: 'win' };

  if (wouldWin(state.board, move, opp)) return { move, kind: 'block', threat: opp };

  const read = analyseMove(state.board, move, me);
  if (read.winningPoints.length >= 2) return { move, kind: 'openFour' };
  if (read.winningPoints.length === 1) return { move, kind: 'four' };
  if (read.shapeScore >= 30_000) return { move, kind: 'openThree' };
  if (move === CENTER) return { move, kind: 'center' };
  return { move, kind: 'balance' };
}
