import { writeFileSync } from 'node:fs';
import { chooseMove } from '../src/ai/ai';
import { apply, result, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { GameConfig } from '../src/game/types';

const config: GameConfig = {
  playerCount: 2,
  seats: [
    { name: 'Player 1', kind: 'human', level: 'normal' },
    { name: 'Player 2', kind: 'human', level: 'normal' },
  ],
};

let state = setup(config);
let guard = 0;
while (state.status === 'playing' && guard++ < 320) {
  const move = chooseMove(state, state.current, {
    level: 'normal',
    budgetMs: 5,
    rng: mulberry32(424242 + guard),
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

const res = result(state);
if (!res) throw new Error('demo game did not finish');
for (const lang of ['en', 'zh'] as const) {
  const names = lang === 'zh' ? ['玩家 1', '玩家 2'] : ['Player 1', 'Player 2'];
  const entry = {
    version: 1,
    id: `demo-finished-game-${lang}`,
    finishedAt: Date.now(),
    config: { ...state.config, seats: state.config.seats.map((s, i) => ({ ...s, name: names[i] })) },
    moves: state.moves,
    winner: state.winner,
    ranking: res.ranking.map((r) => ({ name: names[r.seat], home: r.home, distance: r.distance })),
  };
  writeFileSync(`docs/history-demo.${lang}.json`, JSON.stringify(entry, null, 2));
}
console.log('moves', state.moves.length, 'winner', state.winner, 'reason', state.endReason);
