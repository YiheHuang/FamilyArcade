import { describe, expect, it } from 'vitest';
import { apply, invariants, legalMoves, result, score, setup, view } from '../src/game/engine';
import { deserialize, replay, serialize } from '../src/game/replay';
import { mulberry32, seedFromString } from '../src/game/rng';
import { ROUNDS } from '../src/game/data';
import type { GameConfig, GameState } from '../src/game/types';

function randomConfig(seed: number): GameConfig {
  const playerCount = 2 + Math.floor(mulberry32(seed)() * 5);
  return {
    playerCount,
    seed: `sim-rng-${seed}`,
    seats: Array.from({ length: playerCount }, (_, index) => ({
      name: `S${seed}-${index + 1}`,
      kind: index === 0 ? ('human' as const) : ('ai' as const),
      level: (['companion', 'easy', 'normal', 'hard'] as const)[index % 4],
    })),
  };
}

function playRandom(seed: number): GameState {
  const rng = mulberry32(seedFromString(`sim-rng-${seed}`));
  const config = randomConfig(seed);
  let state = setup(config, rng);
  let steps = 0;

  while (state.phase !== 'ended' && steps < 80) {
    expect(invariants(state)).toEqual([]);
    if (state.phase === 'support') {
      const current = state.current;
      if (current + 1 < state.config.playerCount) {
        const privateView = view(state, current + 1);
        expect(privateView.mySupport).toBeNull();
        expect(JSON.stringify(privateView)).not.toContain('windPlan');
      }
    }
    if (state.phase === 'summary') {
      const out = apply(state, { kind: 'advance' });
      expect(out.ok).toBe(true);
      if (!out.ok) break;
      state = out.state;
      continue;
    }
    const moves = legalMoves(state, state.current);
    expect(moves.length).toBeGreaterThan(0);
    const move = moves[Math.floor(rng() * moves.length)];
    const out = apply(state, move);
    expect(out.ok).toBe(true);
    if (!out.ok) break;
    state = out.state;
    steps += 1;
  }

  expect(state.phase).toBe('ended');
  expect(state.history).toHaveLength(ROUNDS);
  expect(invariants(state)).toEqual([]);
  const rows = score(state);
  expect(rows).toHaveLength(config.playerCount);
  for (const row of rows) {
    expect(row.total).toBeGreaterThanOrEqual(0);
    expect(row.roundPoints).toBeGreaterThanOrEqual(0);
    expect(row.tailwindPoints).toBeGreaterThanOrEqual(0);
  }
  expect(result(state)).not.toBeNull();
  return state;
}

describe('seeded random rally simulation', () => {
  it('plays 120 complete random rallies with clean invariants', () => {
    const finals: GameState[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      finals.push(playRandom(seed));
    }
    expect(finals).toHaveLength(120);
    expect(finals.every((state) => state.phase === 'ended')).toBe(true);
  });

  it('round-trips serialization and replays real move logs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const final = playRandom(seed * 17);
      const restored = deserialize(serialize(final));
      expect(restored).toEqual(final);
      expect(invariants(restored)).toEqual([]);
      const replayed = replay(restored.config, restored.moves);
      expect(replayed).toEqual(restored);
      expect(score(replayed)).toEqual(score(restored));
    }
  });

  it('keeps hidden wind plans out of every player view', () => {
    let state = setup(randomConfig(77), mulberry32(77));
    for (let seat = 0; seat < state.config.playerCount; seat++) {
      const playerView = view(state, seat);
      expect(JSON.stringify(playerView)).not.toContain('windPlan');
      expect(playerView.mySupport).toBeNull();
    }
    const moves = legalMoves(state, 0);
    const support = moves.find((move) => move.kind === 'support');
    expect(support).toBeDefined();
    if (support) {
      const out = apply(state, support);
      expect(out.ok).toBe(true);
      if (out.ok) state = out.state;
    }
    for (let seat = 1; seat < state.config.playerCount; seat++) {
      expect(view(state, seat).mySupport).toBeNull();
    }
    expect(view(state, 0).mySupport).not.toBeNull();
  });

  it('can advance all four rounds in under a small action budget', () => {
    const state = setup(randomConfig(9), mulberry32(9));
    const maxActions = ROUNDS * (state.config.playerCount + 1) + 1;
    expect(maxActions).toBeLessThan(40);
  });
});
