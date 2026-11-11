import { describe, expect, it } from 'vitest';
import { explainMove } from '../src/ai/explain';
import { chooseMove } from '../src/ai/search';
import { Game } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';

describe('提示理由', () => {
  it('对任意合法局面都能给出理由与偏差', () => {
    const g = new Game({ variant: 'duo', players: 2 });
    const rng = mulberry32(7);
    for (let i = 0; i < 20 && !g.over; i++) {
      const moves = g.legalMoves(g.turn);
      if (moves.length === 0) {
        g.tryApply({ kind: 'pass', p: g.turn });
        continue;
      }
      const mv = chooseMove(g, g.turn, 'normal', Date.now() + 200, rng);
      if (!mv) break;
      const ex = explainMove(g, mv);
      expect(['size', 'mobility', 'edge', 'block']).toContain(ex.reason);
      expect(Number.isFinite(ex.deltas.size)).toBe(true);
      g.tryApply(mv);
    }
  });

  it('开局第一步总会落到一个明确的理由上', () => {
    const g = new Game({ variant: 'duo', players: 2 });
    const mv = g.legalMoves(0)[0];
    const ex = explainMove(g, mv);
    expect(['size', 'mobility', 'edge', 'block']).toContain(ex.reason);
  });
});
