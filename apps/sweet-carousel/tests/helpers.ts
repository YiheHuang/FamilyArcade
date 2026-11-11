import { apply, legal, setupFromSeed } from '../src/game/engine';
import type { AiLevel, GameConfig, GameState, Move, PlayerCount, SeatConfig } from '../src/game/types';

export function seats(count: number, kind: 'human' | 'ai' = 'human', level: AiLevel = 'normal'): SeatConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    kind,
    level,
  }));
}

export function config(playerCount: PlayerCount = 2, seed = 'test-seed'): GameConfig {
  return {
    playerCount,
    seats: seats(playerCount),
    seed,
  };
}

export function firstPicks(state: GameState): GameState {
  let current = state;
  for (let seat = 0; seat < current.config.playerCount; seat++) {
    const move = legal(current, seat)[0];
    const out = apply(current, move);
    if (!out.ok) throw new Error(`pick failed: ${out.reason}`);
    current = out.state;
  }
  return current;
}

export function advance(state: GameState): GameState {
  const out = apply(state, { kind: 'advance' });
  if (!out.ok) throw new Error(`advance failed: ${out.reason}`);
  return out.state;
}

export function completeRound(state: GameState): GameState {
  let current = state;
  while (current.phase === 'choosing' || current.phase === 'reveal') {
    if (current.phase === 'choosing') current = firstPicks(current);
    else current = advance(current);
  }
  return current;
}

export function nextRound(state: GameState): GameState {
  const out = apply(state, { kind: 'next-round' });
  if (!out.ok) throw new Error(`next-round failed: ${out.reason}`);
  return out.state;
}

export function playGame(playerCount: PlayerCount, seed = 'sim'): GameState {
  let state = setupFromSeed(config(playerCount, seed));
  while (state.phase !== 'ended') {
    if (state.phase === 'choosing') state = firstPicks(state);
    else if (state.phase === 'reveal') state = advance(state);
    else state = nextRound(state);
  }
  return state;
}

export function moveLog(state: GameState): Move[] {
  // The engine does not store a flat move log, but each round stores every pick
  // in order. Reconstruct the moves a replay would need.
  const moves: Move[] = [];
  for (const round of state.rounds) {
    for (const group of round.picks) {
      for (const pick of group) moves.push({ kind: 'pick', seat: pick.seat, cardId: pick.cardId });
      moves.push({ kind: 'advance' });
    }
    moves.push({ kind: 'next-round' });
  }
  return moves;
}
