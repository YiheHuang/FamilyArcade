import { describe, expect, it } from 'vitest';
import { ADJ, HOLE_COUNT, JUMP, targetHoles } from '../src/game/board';
import {
  apply,
  deserialize,
  distanceSum,
  homeCount,
  legalMoves,
  movesForMarble,
  ranking,
  replay,
  serialize,
  setup,
  STALEMATE_TURNS,
  mustPass,
} from '../src/game/engine';
import type { GameConfig, GameState, Move } from '../src/game/types';

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    kind: 'human' as const,
    level: 'normal' as const,
  }));

const config = (n: 2 | 3 | 4 = 2): GameConfig => ({ playerCount: n, seats: seats(n) });

function countMarbles(state: GameState, seat: number): number {
  return state.board.filter((v) => v === seat + 1).length;
}

describe('setup', () => {
  it('places ten marbles per seat in the right triangles', () => {
    for (const n of [2, 3, 4] as const) {
      const state = setup(config(n));
      expect(state.status).toBe('playing');
      expect(state.current).toBe(0);
      expect(state.turn).toBe(1);
      for (let seat = 0; seat < n; seat++) {
        expect(countMarbles(state, seat)).toBe(10);
      }
    }
  });

  it('rejects a mismatched seat count', () => {
    expect(() => setup({ playerCount: 4, seats: seats(2) })).toThrow();
  });
});

describe('legal moves', () => {
  it('offers moves only to the current seat', () => {
    const state = setup(config(2));
    expect(legalMoves(state, 0).length).toBeGreaterThan(0);
    expect(legalMoves(state, 1)).toEqual([]);
  });

  it('moves a marble to an adjacent empty hole and advances the turn', () => {
    const state = setup(config(2));
    const move = legalMoves(state, 0)[0];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.current).toBe(1);
    expect(out.state.turn).toBe(2);
    expect(out.state.board[move.from]).toBe(0);
    expect(out.state.board[move.to]).toBe(1);
    expect(out.state.lastMove).toEqual(move);
  });

  it('rejects a move from the wrong seat', () => {
    const state = setup(config(2));
    const move = legalMoves(state, 0)[0];
    const out = apply(state, { ...move, seat: 1 });
    expect(out).toEqual({ ok: false, reason: 'not-your-turn' });
  });

  it('rejects landing on an occupied hole', () => {
    const state = setup(config(2));
    const move = legalMoves(state, 0)[0];
    const occupied = state.board.findIndex((v) => v === 1);
    const out = apply(state, { ...move, to: occupied, path: [move.from, occupied] });
    expect(out).toEqual({ ok: false, reason: 'occupied' });
  });

  it('supports a two-jump chain and keeps the jumped marbles', () => {
    const state = setup(config(2));
    state.board.fill(0);

    // Find a→c over b, then c→e over d.
    let start = -1;
    let mid = -1;
    let end = -1;
    for (let a = 0; a < HOLE_COUNT && start < 0; a++) {
      for (const b of ADJ[a]) {
        const c = JUMP[a][b];
        if (c < 0) continue;
        for (const d of ADJ[c]) {
          if (d === b) continue;
          const e = JUMP[c][d];
          if (e < 0 || e === a) continue;
          start = a;
          mid = c;
          end = e;
          state.board[b] = 2;
          state.board[d] = 2;
          break;
        }
        if (start >= 0) break;
      }
    }
    expect(start).toBeGreaterThanOrEqual(0);
    state.board[start] = 1;

    const moves = movesForMarble(state, start);
    const chain = moves.find((m) => m.to === end && m.path.length === 3);
    expect(chain).toBeDefined();
    expect(chain!.path).toEqual([start, mid, end]);
    expect(chain!.kind).toBe('jump');

    const out = apply(state, chain!);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.board[start]).toBe(0);
    expect(out.state.board[mid]).toBe(0);
    expect(out.state.board[end]).toBe(1);
    expect(out.state.board[ADJ[start].find((h) => state.board[h] === 2)!]).toBe(2);
  });
});

describe('winning, ranking and stalemate', () => {
  it('wins when all ten marbles fill the target triangle', () => {
    const state = setup(config(2));
    state.board.fill(0);
    const target = targetHoles(2, 0);
    const last = target.find((h) => ADJ[h].some((n) => !target.includes(n)))!;
    for (const hole of target) if (hole !== last) state.board[hole] = 1;
    const from = ADJ[last].find((h) => !target.includes(h))!;
    state.board[from] = 1;
    state.current = 0;

    const move = legalMoves(state, 0).find((m) => m.to === last)!;
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.winner).toBe(0);
    expect(out.state.endReason).toBe('home');
    expect(homeCount(out.state, 0)).toBe(10);
  });

  it('ends by stalemate after a long stretch without progress', () => {
    const state = setup(config(2));
    state.noProgress = STALEMATE_TURNS - 1;
    const move = legalMoves(state, 0)[0];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.endReason).toBe('stalemate');
    expect(out.state.winner).toBeNull();
    expect(ranking(out.state).length).toBe(2);
  });

  it('ranks by marbles home, then distance, then seat', () => {
    const state = setup(config(2));
    state.board.fill(0);
    const target0 = targetHoles(2, 0);
    state.board[target0[0]] = 1;
    const target1 = targetHoles(2, 1);
    state.board[target1[0]] = 2;
    state.board[target1[1]] = 2;
    const rows = ranking(state);
    expect(rows[0].seat).toBe(1);
    expect(rows[0].home).toBe(2);
    expect(rows[1].seat).toBe(0);
    expect(rows[0].rank).toBe(1);
  });
});

describe('serialization and replay', () => {
  it('round-trips a game', () => {
    const state = setup(config(2));
    const move = legalMoves(state, 0)[0];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const copy = deserialize(serialize(out.state));
    expect(copy.board).toEqual(out.state.board);
    expect(copy.moves).toHaveLength(1);
  });

  it('replays the same moves to the same state', () => {
    let state = setup(config(2));
    const moves: Move[] = [];
    for (let i = 0; i < 6; i++) {
      const move = legalMoves(state, state.current)[0];
      const out = apply(state, move);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      state = out.state;
      moves.push(move);
    }
    const replayed = replay(config(2), moves);
    expect(replayed.board).toEqual(state.board);
    expect(replayed.current).toBe(state.current);
  });
});

describe('edge cases', () => {
  it('keeps a marble in its target triangle once it arrives', () => {
    const state = setup(config(2));
    state.board.fill(0);
    const target = targetHoles(2, 0);
    const inside = target[0];
    const outside = ADJ[inside].find((h) => !target.includes(h))!;
    state.board[inside] = 1;
    state.current = 0;
    const moves = legalMoves(state, 0);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) expect(target.includes(move.to)).toBe(true);
    expect(moves.some((m) => m.to === outside)).toBe(false);
  });

  it('ends at the move cap even without a winner', () => {
    const state = setup(config(2));
    const filler: Move = { seat: 0, from: -1, to: -1, path: [], kind: 'pass' };
    state.moves = Array.from({ length: 299 }, () => ({ ...filler }));
    const move = legalMoves(state, 0)[0];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.status).toBe('ended');
    expect(out.state.endReason).toBe('cap');
  });

  it('knows when a seat has no legal move', () => {
    const state = setup(config(2));
    state.board.fill(0);
    expect(mustPass(state, 0)).toBe(true);
  });

  it('keeps distance sums finite for every seat', () => {
    const state = setup(config(4));
    for (let seat = 0; seat < 4; seat++) {
      expect(distanceSum(state, seat)).toBeGreaterThan(0);
      expect(Number.isFinite(distanceSum(state, seat))).toBe(true);
    }
  });
});


