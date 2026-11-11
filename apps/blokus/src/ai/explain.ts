import type { Game } from '../game/engine';
import type { PlaceMove } from '../game/types';
import { moveParts } from './search';

export type HintReason = 'size' | 'mobility' | 'edge' | 'block';

export interface HintExplanation {
  reason: HintReason;
  /** the hint's scores minus the average of all legal moves */
  deltas: { size: number; mobility: number; edge: number; block: number };
}

const NOTABLE = 2;

/**
 * Explain why a move was recommended: compare its features against the
 * average of every legal move and report the standout one. Pure and tested.
 */
export function explainMove(g: Game, hint: PlaceMove): HintExplanation {
  const moves = g.legalMoves(hint.p);
  const frontier = g.frontierFlagsFor(hint.p);
  const avg = { size: 0, mobility: 0, edge: 0, block: 0 };
  let hintParts: { size: number; mobility: number; edge: number; block: number } | null = null;

  for (const m of moves) {
    const p = moveParts(g, m, frontier);
    avg.size += p.size;
    avg.mobility += p.added - p.killed;
    avg.edge += p.edge;
    avg.block += p.contact;
    if (m.piece === hint.piece && m.o === hint.o && m.x === hint.x && m.y === hint.y) {
      hintParts = {
        size: p.size,
        mobility: p.added - p.killed,
        edge: p.edge,
        block: p.contact,
      };
    }
  }
  const n = Math.max(1, moves.length);
  const deltas = {
    size: (hintParts?.size ?? 0) - avg.size / n,
    mobility: (hintParts?.mobility ?? 0) - avg.mobility / n,
    edge: (hintParts?.edge ?? 0) - avg.edge / n,
    block: (hintParts?.block ?? 0) - avg.block / n,
  };

  let reason: HintReason = 'size';
  if (deltas.mobility >= NOTABLE) reason = 'mobility';
  else if (deltas.block >= NOTABLE) reason = 'block';
  else if (deltas.edge >= NOTABLE) reason = 'edge';
  return { reason, deltas };
}
