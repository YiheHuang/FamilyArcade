import { writeFileSync } from 'node:fs';
import { chooseMove } from '../src/ai/ai';
import { apply, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { GameConfig, GameState } from '../src/game/types';

function playTo(targetMoves: number, lang: 'en' | 'zh'): GameState {
  const names = lang === 'zh' ? ['玩家 1', '玩家 2'] : ['Player 1', 'Player 2'];
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: names[0], kind: 'human', level: 'normal' },
      { name: names[1], kind: 'human', level: 'normal' },
    ],
  };
  let state = setup(config);
  let guard = 0;
  while (state.status === 'playing' && state.moves.length < targetMoves && guard++ < 500) {
    const move = chooseMove(state, state.current, {
      level: 'normal',
      budgetMs: 8,
      rng: mulberry32(20261110 + guard),
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

for (const lang of ['en', 'zh'] as const) {
  let state = playTo(64, lang);
  if (state.current !== 0) {
    const move = chooseMove(state, state.current, { level: 'easy', budgetMs: 8, rng: mulberry32(7) });
    if (move) {
      const out = apply(state, move);
      if (out.ok) state = out.state;
    }
  }
  const payload = { version: 1, state, savedAt: Date.now() };
  writeFileSync(`docs/demo-state.${lang}.json`, JSON.stringify(payload, null, 2));
  console.log(lang, 'moves', state.moves.length, 'current', state.current, 'status', state.status);
}
