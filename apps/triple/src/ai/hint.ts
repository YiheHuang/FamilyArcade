import { chooseMove } from './ai';
import { apply, legalMoves, winningLine, type GameState, type Mark } from '../game/triple';

export type HintKind = 'win' | 'block' | 'center' | 'corner' | 'balance';

export interface Hint {
  move: number;
  kind: HintKind;
  threat?: Mark;
}

function wouldWin(board: GameState['board'], index: number, mark: Mark): boolean {
  const copy = board.slice();
  copy[index] = mark;
  return winningLine(copy) !== null;
}

/**
 * A deterministic, explainable hint for the side to move. The move comes from the
 * perfect Hard search; the reason is derived from the board so the UI can say why.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.5);
  if (move < 0 || state.board[move] !== null) return null;

  const me = state.turn;
  const opponent: Mark = me === 'X' ? 'O' : 'X';
  const after = apply(state, move).state;
  if (after.winner === me) return { move, kind: 'win' };

  const threats = legalMoves(state).filter((cell) => wouldWin(state.board, cell, opponent));
  if (threats.length > 0) return { move, kind: 'block', threat: opponent };
  if (move === 4) return { move, kind: 'center' };
  if (move === 0 || move === 2 || move === 6 || move === 8) return { move, kind: 'corner' };
  return { move, kind: 'balance' };
}
