import { describe, expect, it } from 'vitest';
import { chooseMove, explain, hintMove } from '../src/ai/ai';
import { apply, legalMoves, setup, view } from '../src/game/engine';
import { mulberry32, seedFromString } from '../src/game/rng';
import { ROUNDS } from '../src/game/data';
import { AI_LEVELS, type AiLevel, type GameConfig, type GameState } from '../src/game/types';

function config(seed: string, playerCount = 3): GameConfig {
  return {
    playerCount,
    seed,
    seats: Array.from({ length: playerCount }, (_, index) => ({
      name: `Player ${index + 1}`,
      kind: index === 0 ? ('human' as const) : index === 1 ? ('ai' as const) : ('human' as const),
      level: 'normal' as const,
    })),
  };
}

function applySupport(state: GameState, balloon: number, tailwind = false): GameState {
  const out = apply(state, { kind: 'support', seat: state.current, balloon, tailwind });
  if (!out.ok) throw new Error(out.reason);
  return out.state;
}

function advance(state: GameState): GameState {
  const out = apply(state, { kind: 'advance' });
  if (!out.ok) throw new Error(out.reason);
  return out.state;
}

function stateWithHistory(): GameState {
  const cfg = config('companion-history', 3);
  let state = setup(cfg, mulberry32(seedFromString(cfg.seed)));
  state = applySupport(state, 2);
  state = applySupport(state, 0);
  state = applySupport(state, 1);
  state = advance(state);
  state = applySupport(state, 2);
  state = applySupport(state, 1);
  state = applySupport(state, 0);
  state = advance(state);
  state = applySupport(state, 3);
  return state;
}

function isLegalSupport(state: GameState, move: ReturnType<typeof chooseMove>): boolean {
  if (!move || move.kind !== 'support') return false;
  return legalMoves(state, move.seat).some(
    (candidate) =>
      candidate.kind === 'support' &&
      candidate.balloon === move.balloon &&
      candidate.tailwind === move.tailwind,
  );
}

describe('four AI levels', () => {
  it('always returns a legal support for every level', () => {
    const base = stateWithHistory();
    expect(base.current).toBe(1);
    const playerView = view(base, 1);
    for (const level of AI_LEVELS) {
      const move = chooseMove(playerView, level, 80, mulberry32(level.length * 101));
      expect(move).not.toBeNull();
      expect(isLegalSupport(base, move)).toBe(true);
    }
  });

  it('is deterministic when given the same view and seed', () => {
    const state = stateWithHistory();
    const playerView = view(state, 1);
    for (const level of AI_LEVELS) {
      const a = chooseMove(playerView, level, 80, mulberry32(424242));
      const b = chooseMove(playerView, level, 80, mulberry32(424242));
      expect(a).toEqual(b);
    }
  });

  it('returns null outside a support turn', () => {
    const cfg = config('not-turn', 3);
    let state = setup(cfg, mulberry32(seedFromString(cfg.seed)));
    expect(chooseMove(view(state, 1), 'hard', 80, mulberry32(1))).toBeNull();
    state = applySupport(state, 0);
    state = applySupport(state, 0);
    const out = apply(state, { kind: 'support', seat: 2, balloon: 1, tailwind: false });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.phase).toBe('summary');
      expect(chooseMove(view(out.state, 1), 'normal', 80, mulberry32(1))).toBeNull();
    }
  });

  it('keeps every decision inside the 80 ms budget', () => {
    const state = stateWithHistory();
    const playerView = view(state, 1);
    for (const level of AI_LEVELS) {
      const start = performance.now();
      const move = chooseMove(playerView, level, 80, mulberry32(level.charCodeAt(0)));
      const elapsed = performance.now() - start;
      expect(move).not.toBeNull();
      expect(elapsed).toBeLessThan(80);
    }
  });

  it('has a human-readable explanation for a hint', () => {
    const state = stateWithHistory();
    const playerView = view(state, 1);
    const move = hintMove(playerView);
    expect(move).not.toBeNull();
    if (move) {
      const reason = explain(playerView, move);
      expect(reason.key.startsWith('ai.reason')).toBe(true);
      expect(reason.params.balloonId).toBeTypeOf('string');
    }
  });
});

describe('Companion gentleness', () => {
  it('avoids the balloon a human has supported twice', () => {
    const state = stateWithHistory();
    const playerView = view(state, 1);
    expect(playerView.history.length).toBe(2);
    expect(playerView.history[0].supports[0]).toBe(2);
    expect(playerView.history[1].supports[0]).toBe(2);
    for (let seed = 0; seed < 30; seed++) {
      const move = chooseMove(playerView, 'companion', 80, mulberry32(seed));
      expect(move).not.toBeNull();
      if (move?.kind === 'support') {
        expect(move.balloon).not.toBe(2);
      }
    }
  });

  it('does not avoid a balloon without a favourite signal', () => {
    const cfg = config('companion-none', 3);
    let state = setup(cfg, mulberry32(seedFromString(cfg.seed)));
    state = applySupport(state, 0);
    const playerView = view(state, 1);
    const move = chooseMove(playerView, 'companion', 80, mulberry32(3));
    expect(move).not.toBeNull();
    expect(isLegalSupport(state, move)).toBe(true);
  });
});

describe('budget scaling', () => {
  it('works for 2–6 seats', () => {
    for (let players = 2; players <= 6; players++) {
      const cfg = config(`budget-${players}`, players);
      let state = setup(cfg, mulberry32(seedFromString(cfg.seed)));
      if (players === 2) {
        state = applySupport(state, 0);
      } else {
        while (state.current !== 1) state = applySupport(state, 0);
      }
      const move = chooseMove(view(state, 1), 'hard', 80, mulberry32(players));
      expect(move).not.toBeNull();
      expect(isLegalSupport(state, move)).toBe(true);
    }
  });

  it('can complete four rounds of AI-only choices when driven by the engine', () => {
    const cfg = config('ai-loop', 4);
    let state = setup(cfg, mulberry32(seedFromString(cfg.seed)));
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 40) {
      if (state.phase === 'summary') {
        state = advance(state);
        continue;
      }
      const level: AiLevel = AI_LEVELS[(state.current + state.round) % AI_LEVELS.length];
      const move = chooseMove(view(state, state.current), level, 80, mulberry32(state.current + guard));
      if (!move) break;
      const out = apply(state, move);
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      state = out.state;
    }
    expect(state.phase).toBe('ended');
    expect(state.history).toHaveLength(ROUNDS);
  });
});
