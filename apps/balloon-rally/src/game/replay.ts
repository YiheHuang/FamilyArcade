import { apply, invariants, setup } from './engine';
import { mulberry32, seedFromString, type Rng } from './rng';
import { BALLOON_COUNT } from './data';
import type { GameConfig, GameState, Move } from './types';

export function rngForConfig(config: GameConfig): Rng {
  return mulberry32(seedFromString(config.seed || 'balloon-rally'));
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function isStringArray(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((x) => typeof x === 'string');
}

export function deserialize(json: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('save is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('save is not an object');
  const state = parsed as GameState;
  if (state.version !== 1) throw new Error(`unsupported save version: ${String(state.version)}`);
  if (!state.config || !Array.isArray(state.config.seats)) throw new Error('save has no seats');
  if (typeof state.config.seed !== 'string') throw new Error('save has no seed');
  if (!Array.isArray(state.positions) || state.positions.length !== BALLOON_COUNT) {
    throw new Error('save has the wrong track');
  }
  if (!Array.isArray(state.windPlan) || state.windPlan.length !== 4) {
    throw new Error('save has no wind plan');
  }
  if (!Array.isArray(state.history) || !Array.isArray(state.moves)) {
    throw new Error('save has no history');
  }
  if (!isStringArray(state.config.seats.map((s) => s.name), state.config.playerCount)) {
    throw new Error('save has bad seat names');
  }
  const health = invariants(state);
  if (health.length) throw new Error(`save is inconsistent: ${health[0]}`);
  return state;
}

export function replay(config: GameConfig, moves: Move[], rng?: Rng): GameState {
  let state = setup(config, rng ?? rngForConfig(config));
  for (const move of moves) {
    const out = apply(state, move);
    if (!out.ok) throw new Error(`illegal replay move: ${out.reason}`);
    state = out.state;
  }
  return state;
}
