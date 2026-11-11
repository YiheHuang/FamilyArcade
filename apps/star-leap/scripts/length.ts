import { chooseMove } from '../src/ai/ai';
import { apply, legalMoves, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameConfig } from '../src/game/types';

function play(level0: AiLevel, level1: AiLevel, seed: number, max = 1200) {
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: 'A', kind: 'ai', level: level0 },
      { name: 'B', kind: 'ai', level: level1 },
    ],
  };
  let state = setup(config);
  let guard = 0;
  while (state.status === 'playing' && guard++ < max) {
    if (guard % 100 === 0) console.log('  move', guard, 'turn', state.turn, 'noProgress', state.noProgress);
    const move = chooseMove(state, state.current, {
      level: state.current === 0 ? level0 : level1,
      budgetMs: 1,
      rng: mulberry32(seed * 131 + guard),
    });
    if (!move) {
      const out = apply(state, { seat: state.current, from: -1, to: -1, path: [], kind: 'pass' });
      if (!out.ok) break;
      state = out.state;
      continue;
    }
    const out = apply(state, move);
    if (!out.ok) break;
    state = out.state;
  }
  return state;
}

for (const pair of [
  ['easy', 'easy'],
  ['normal', 'easy'],
  ['normal', 'normal'],
] as [AiLevel, AiLevel][]) {
  console.log('start', pair);
  const s = play(pair[0], pair[1], 1);
  console.log('end', pair, 'moves', s.moves.length, 'status', s.status, 'winner', s.winner, 'reason', s.endReason);
}
