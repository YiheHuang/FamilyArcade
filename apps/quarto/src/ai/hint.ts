import { chooseAction } from './ai';
import {
  applyAction,
  quartoOnBoard,
  winningCells,
  type AttributeMatch,
  type GameAction,
  type GameState,
} from '../game/quarto';

export type HintKind = 'win' | 'avoid' | 'forced' | 'setup' | 'quiet' | 'open' | 'balance';

export interface Hint {
  action: GameAction;
  kind: HintKind;
  attributes?: AttributeMatch[];
}

function threatAttributes(
  state: GameState,
  piece: number,
  cell: number,
): AttributeMatch[] | undefined {
  const board = state.board.slice();
  board[cell] = piece;
  return quartoOnBoard(board)?.attributes;
}

/**
 * A deterministic, explainable hint. The action comes from the hard search;
 * the reason is derived from the position so the UI can say why it is good.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const action = chooseAction(state, 'hard', () => 0.5);
  if (!action) return null;

  if (action.type === 'place') {
    const applied = applyAction(state, action);
    if (!applied.ok) return null;
    if (applied.state.status === 'won') {
      return { action, kind: 'win', attributes: applied.state.attributes ?? undefined };
    }

    for (const piece of applied.state.pool) {
      const cells = winningCells(applied.state.board, piece);
      if (cells.length > 0) {
        return {
          action,
          kind: 'setup',
          attributes: threatAttributes(applied.state, piece, cells[0]),
        };
      }
    }
    return { action, kind: 'quiet' };
  }

  const safe = state.pool.filter((piece) => winningCells(state.board, piece).length === 0);
  if (safe.length === 0) return { action, kind: 'forced' };
  if (safe.length < state.pool.length) return { action, kind: 'avoid' };
  if (state.placements === 0) return { action, kind: 'open' };
  return { action, kind: 'balance' };
}
