/**
 * Deterministic screen fixtures for screenshots and the showcase routes.
 * They use the real engine; nothing here mocks a render.
 */

import {
  applyAction,
  defaultButton,
  legalActions,
  makeRng,
  nextHand,
  setup,
  type GameState,
} from './game/texas-holdem';

const checkOrCall = (state: GameState): GameState => {
  const options = legalActions(state, state.turn);
  const action = options.canCheck
    ? { type: 'check' as const }
    : options.canCall
      ? { type: 'call' as const }
      : { type: 'fold' as const };
  return applyAction(state, state.turn, action).state;
};

const callDown = (state: GameState): GameState => {
  let current = state;
  for (let guard = 0; guard < 80; guard += 1) {
    if (current.phase === 'showdown' || current.phase === 'session-over') return current;
    if (current.turn < 0) return current;
    current = checkOrCall(current);
  }
  return current;
};

export function demoTable(): GameState {
  let state = setup({
    rng: makeRng(0x5eed1001),
    seats: 4,
    startingStack: 1000,
    button: defaultButton(4),
  });
  for (let guard = 0; guard < 30; guard += 1) {
    if (state.phase === 'flop' && state.turn === 0 && state.players[0].hand.length === 2) {
      return state;
    }
    if (state.phase === 'showdown' || state.phase === 'session-over' || state.turn < 0) {
      return state;
    }
    state = checkOrCall(state);
  }
  return state;
}

export function demoShowdown(): GameState {
  const state = setup({
    rng: makeRng(0x5eed2002),
    seats: 4,
    startingStack: 1000,
    button: defaultButton(4),
  });
  return callDown(state);
}

export function demoOver(): GameState {
  let state = setup({
    rng: makeRng(0x5eed3003),
    seats: 2,
    startingStack: 1000,
    button: 0,
  });
  for (let hand = 0; hand < 40; hand += 1) {
    for (let guard = 0; guard < 20; guard += 1) {
      if (state.phase === 'showdown' || state.phase === 'session-over') break;
      if (state.turn < 0) break;
      const options = legalActions(state, state.turn);
      const action = options.canAllIn
        ? { type: 'all-in' as const }
        : options.canCheck
          ? { type: 'check' as const }
          : { type: 'fold' as const };
      const result = applyAction(state, state.turn, action);
      if (!result.ok) break;
      state = result.state;
    }
    if (state.sessionOver || state.phase === 'session-over') return state;
    if (state.phase !== 'showdown') return state;
    const next = nextHand(state, makeRng(0x5eed3003 + hand * 97));
    if (!next.ok) return state;
    state = next.state;
  }
  return state;
}

export function demoTableFor(seats: number, seed = 0x5eed4004): GameState {
  let state = setup({
    rng: makeRng(seed),
    seats,
    startingStack: 1000,
    button: defaultButton(seats),
  });
  for (let guard = 0; guard < 20; guard += 1) {
    if (state.phase === 'flop' && state.turn === 0) return state;
    if (state.phase === 'showdown' || state.phase === 'session-over' || state.turn < 0) {
      return state;
    }
    state = checkOrCall(state);
  }
  return state;
}
