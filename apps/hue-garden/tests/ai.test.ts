import { describe, expect, it } from 'vitest';
import { apply, legalMoves, view } from '../src/game/engine';
import { chooseMove, AI_WEIGHTS, bloomThreats, explainMove, positionFromView } from '../src/ai/ai';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameState } from '../src/game/types';
import { fresh } from './helpers';

const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];
const BUDGETS: Record<AiLevel, number> = {
  companion: 80,
  easy: 80,
  normal: 300,
  hard: 900,
};

function midgame(seed = 31, movesToPlay = 34): GameState {
  let state = fresh(2, seed);
  for (let i = 0; i < movesToPlay && state.status === 'playing'; i++) {
    const moves = legalMoves(state, state.current);
    const move = moves[Math.floor(mulberry32(seed * 13 + i)() * moves.length)];
    const out = apply(state, move);
    if (!out.ok) throw new Error(out.reason);
    state = out.state;
  }
  return state;
}

function moveKey(move: unknown): string {
  return JSON.stringify(move);
}

describe('AI views and legality', () => {
  it('only receives the acting seat hand and public counts', () => {
    const state = midgame(5, 20);
    const playerView = view(state, 0);
    expect('hands' in playerView).toBe(false);
    expect('bag' in playerView).toBe(false);
    expect(playerView.hand).toHaveLength(state.hands[0].length);
    expect(playerView.handCounts).toEqual(state.hands.map((h) => h.length));
    expect(playerView.bagCount).toBe(state.bag.length);
    const position = positionFromView(playerView);
    expect(position.hands[0]).toEqual(state.hands[0]);
    expect(position.hands[1]).toEqual([]);
  });

  it('returns a legal move for all four levels and is deterministic with a seed', () => {
    const state = midgame(9, 38);
    const seat = state.current;
    const playerView = view(state, seat);
    const legal = legalMoves(state, seat);
    expect(legal.length).toBeGreaterThan(0);

    for (const level of LEVELS) {
      const a = chooseMove(playerView, level, BUDGETS[level], mulberry32(20261111));
      const b = chooseMove(playerView, level, BUDGETS[level], mulberry32(20261111));
      expect(a).not.toBeNull();
      expect(moveKey(a)).toBe(moveKey(b));
      expect(legal.map(moveKey)).toContain(moveKey(a));
    }
  });

  it('stays within the time budgets', () => {
    const state = midgame(17, 47);
    const playerView = view(state, state.current);
    for (const level of LEVELS) {
      const start = performance.now();
      const move = chooseMove(playerView, level, BUDGETS[level], mulberry32(7));
      const elapsed = performance.now() - start;
      expect(move).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(BUDGETS[level]);
    }
  });

  it('gives the companion no denial or threat weight', () => {
    expect(AI_WEIGHTS.companion.opponent).toBe(0);
    expect(AI_WEIGHTS.companion.threat).toBe(0);
    expect(AI_WEIGHTS.hard.noise).toBeLessThan(AI_WEIGHTS.normal.noise);
  });

  it('explains a hint in human terms', () => {
    const state = midgame(21, 28);
    const playerView = view(state, state.current);
    const move = chooseMove(playerView, 'normal', 300, mulberry32(4));
    expect(move).not.toBeNull();
    if (!move) return;
    const reason = explainMove(playerView, move);
    expect(reason.key.startsWith('hint.')).toBe(true);
    if (move.kind === 'play') {
      expect(reason.params?.points).toBeGreaterThan(0);
    }
  });

  it('counts public bloom threats without reading hidden hands', () => {
    const state = midgame(33, 30);
    const playerView = view(state, state.current);
    const threats = bloomThreats(
      playerView,
      playerView.board,
      playerView.hand ?? [],
    );
    expect(threats).toBeGreaterThanOrEqual(0);
  });
});

describe('AI self-play', () => {
  it('plays two full AI games to a legal end', () => {
    for (let game = 0; game < 2; game++) {
      let state = fresh(2, 100 + game);
      let guard = 0;
      while (state.status === 'playing' && guard++ < 400) {
        const seat = state.current;
        const playerView = view(state, seat);
        const level: AiLevel = seat === 0 ? 'easy' : 'normal';
        const move = chooseMove(playerView, level, 120, mulberry32(game * 1000 + guard));
        expect(move).not.toBeNull();
        if (!move) break;
        expect(legalMoves(state, seat).map(moveKey)).toContain(moveKey(move));
        const out = apply(state, move);
        expect(out.ok).toBe(true);
        if (!out.ok) break;
        state = out.state;
      }
      expect(state.status).toBe('ended');
    }
  });
});
