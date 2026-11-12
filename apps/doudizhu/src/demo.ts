import { chooseCards } from './ai/ai';
import { bid, pass, play, setup, type GameState, type Seat } from './game/doudizhu';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A complete, valid round used only by screenshot tooling. */
export function demoState(_kind: 'over'): GameState {
  const rng = seeded(20261112);
  let state = setup({ rng, firstBidder: 0 });
  const opening = bid(state, 0, 3, rng);
  if (opening.ok) state = opening.state;
  let guard = 0;
  while (state.phase === 'playing' && guard < 400) {
    guard += 1;
    const seat = state.turn as Seat;
    const ids = chooseCards(state, seat, 'normal', rng);
    if (ids && ids.length > 0) {
      const result = play(state, seat, ids);
      if (result.ok) {
        state = result.state;
        continue;
      }
    }
    const result = pass(state, seat);
    if (result.ok) state = result.state;
    else break;
  }
  return state;
}
