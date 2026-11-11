import { describe, expect, it } from 'vitest';
import { apply, invariants, legal, result, score, setupFromSeed } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { GameState, PlayerCount } from '../src/game/types';
import { config } from './helpers';

function randomStep(state: GameState, rng: () => number): GameState {
  if (state.phase === 'choosing') {
    const open = state.pending
      .map((cardId, seat) => (cardId === null ? seat : -1))
      .filter((seat) => seat >= 0);
    const seat = open[Math.floor(rng() * open.length)];
    const moves = legal(state, seat);
    const move = moves[Math.floor(rng() * moves.length)];
    const out = apply(state, move);
    if (!out.ok) throw new Error(`random pick failed: ${out.reason}`);
    return out.state;
  }
  if (state.phase === 'reveal') {
    const out = apply(state, { kind: 'advance' });
    if (!out.ok) throw new Error(`random advance failed: ${out.reason}`);
    return out.state;
  }
  const out = apply(state, { kind: 'next-round' });
  if (!out.ok) throw new Error(`random next-round failed: ${out.reason}`);
  return out.state;
}

describe('120 seeded random games', () => {
  it('always terminates, keeps invariants, and produces a ranking', () => {
    let totalScore = 0;
    let seatsScored = 0;
    for (let game = 0; game < 120; game++) {
      const playerCount = (2 + (game % 4)) as PlayerCount;
      const rng = mulberry32(0xbeef + game * 7919);
      let state = setupFromSeed(config(playerCount, `simulation-${game}`));
      let steps = 0;
      while (state.phase !== 'ended') {
        expect(invariants(state)).toEqual([]);
        state = randomStep(state, rng);
        steps++;
        expect(steps).toBeLessThan(500);
      }
      expect(invariants(state)).toEqual([]);
      const final = result(state);
      expect(final).not.toBeNull();
      expect(final!.ranking).toHaveLength(playerCount);
      expect(final!.winner).toBeGreaterThanOrEqual(0);
      expect(final!.winner).toBeLessThan(playerCount);
      const rows = score(state);
      for (const row of rows) {
        expect(row.total).toBeGreaterThanOrEqual(0);
        expect(row.cards).toBe(24);
        totalScore += row.total;
        seatsScored++;
      }
      expect(state.rounds).toHaveLength(3);
    }
    const average = totalScore / seatsScored;
    // A calibration guard: random drafting should land in the designed band.
    expect(average).toBeGreaterThan(15);
    expect(average).toBeLessThan(45);
  });
});
