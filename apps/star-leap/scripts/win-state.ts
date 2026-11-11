import { writeFileSync } from 'node:fs';
import { ADJ, TRIANGLES, targetHoles } from '../src/game/board';
import { setup } from '../src/game/engine';
import type { GameConfig } from '../src/game/types';

function make(names: [string, string]) {
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: names[0], kind: 'human', level: 'normal' },
      { name: names[1], kind: 'human', level: 'normal' },
    ],
  };
  const state = setup(config);
  state.board.fill(0);
  const target = targetHoles(2, 0);
  const last = target.find((h) => ADJ[h].some((n) => !target.includes(n)))!;
  for (const hole of target) if (hole !== last) state.board[hole] = 1;
  const from = ADJ[last].find((h) => !target.includes(h))!;
  state.board[from] = 1;
  // Put the opponent's marbles in a neutral side triangle so the ranking
  // screen shows a plausible distance instead of an empty board.
  for (const hole of TRIANGLES['lower-left']) state.board[hole] = 2;
  state.current = 0;
  state.moves = [];
  state.lastMove = null;
  return { state, last, from };
}

const en = make(['Player 1', 'Player 2']);
const zh = make(['玩家 1', '玩家 2']);

writeFileSync('docs/win-state.json', JSON.stringify({ version: 1, state: en.state, savedAt: Date.now() }, null, 2));
writeFileSync('docs/win-state.zh.json', JSON.stringify({ version: 1, state: zh.state, savedAt: Date.now() }, null, 2));
writeFileSync('docs/win-target.json', JSON.stringify({ last: en.last, from: en.from }, null, 2));
console.log('last target', en.last, 'from', en.from);
