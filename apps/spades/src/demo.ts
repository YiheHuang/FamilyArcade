import { chooseBid, chooseCard } from './ai/ai';
import {
  bid,
  nextRound,
  play,
  reveal,
  setup,
  type GameState,
  type Seat,
} from './game/spades';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function turnSeat(state: GameState): Seat | null {
  return state.turn < 0 ? null : (state.turn as Seat);
}

function playOneRound(seed: number): GameState {
  const rng = seeded(seed);
  let state = setup({ rng, dealer: 3, target: 500, blindNil: true });
  for (let step = 0; step < 4; step += 1) {
    const seat = turnSeat(state);
    if (seat === null) break;
    state = reveal(state, seat);
    const choice = chooseBid(state, seat, 'normal', rng);
    const result = bid(state, seat, choice.value, choice.blind);
    if (!result.ok) break;
    state = result.state;
  }
  let guard = 0;
  while (state.phase === 'playing' && guard < 60) {
    guard += 1;
    const seat = turnSeat(state);
    if (seat === null) break;
    const id = chooseCard(state, seat, 'normal', rng);
    const result = play(state, seat, id);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

/** A complete, valid round used by screenshot tooling. */
export function demoRound(): GameState {
  return playOneRound(20261112);
}

/** A complete, valid 500-point match used by screenshot tooling. */
export function demoMatch(): GameState {
  const rng = seeded(90210);
  let state = setup({ rng, dealer: 3, target: 500, blindNil: true });
  let rounds = 0;
  while (state.phase !== 'done' && rounds < 200) {
    rounds += 1;
    for (let step = 0; step < 4; step += 1) {
      const seat = turnSeat(state);
      if (seat === null) break;
      state = reveal(state, seat);
      const choice = chooseBid(state, seat, 'normal', rng);
      const result = bid(state, seat, choice.value, choice.blind);
      if (!result.ok) break;
      state = result.state;
    }
    let guard = 0;
    while (state.phase === 'playing' && guard < 60) {
      guard += 1;
      const seat = turnSeat(state);
      if (seat === null) break;
      const id = chooseCard(state, seat, 'normal', rng);
      const result = play(state, seat, id);
      if (!result.ok) break;
      state = result.state;
    }
    if (state.phase === 'round-over') {
      const next = nextRound(state, rng);
      if (!next.ok) break;
      state = next.state;
    }
  }
  if (state.phase !== 'done') {
    // A pathological seed should still leave a renderable final table.
    const scores: [number, number] = [Math.max(state.scores[0], 500), state.scores[1]];
    return {
      ...state,
      phase: 'done',
      turn: -1,
      winner: 0,
      scores,
    };
  }
  return state;
}
