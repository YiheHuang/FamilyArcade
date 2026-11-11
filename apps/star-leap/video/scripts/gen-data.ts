import { writeFileSync } from 'node:fs';
import { chooseMove } from '../../src/ai/ai';
import { apply, homeCount, setup } from '../../src/game/engine';
import { mulberry32 } from '../../src/game/rng';
import type { GameConfig, GameState } from '../../src/game/types';

interface Snapshot {
  board: number[];
  current: number;
  turn: number;
  moves: number;
  home: number[];
  lastPath: number[] | null;
}

function snap(state: GameState): Snapshot {
  return {
    board: [...state.board],
    current: state.current,
    turn: state.turn,
    moves: state.moves.length,
    home: state.config.seats.map((_, i) => homeCount(state, i)),
    lastPath: state.lastMove?.path ?? null,
  };
}

const config: GameConfig = {
  playerCount: 2,
  seats: [
    { name: 'Blue', kind: 'human', level: 'normal' },
    { name: 'Gold', kind: 'human', level: 'normal' },
  ],
};

let state = setup(config);
const snapshots: Snapshot[] = [snap(state)];
const want = new Set([16, 32, 48, 64]);
let guard = 0;
while (state.status === 'playing' && state.moves.length < 64 && guard++ < 200) {
  const move = chooseMove(state, state.current, {
    level: 'normal',
    budgetMs: 8,
    rng: mulberry32(20261111 + guard),
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
  if (want.has(state.moves.length)) snapshots.push(snap(state));
}

const payload = {
  playerNames: ['Blue', 'Gold'],
  config,
  moves: state.moves,
  snapshots,
  facts: {
    holes: 121,
    marbles: 10,
    players: 2,
    moves: state.moves.length,
    home: state.config.seats.map((_, i) => homeCount(state, i)),
  },
};
writeFileSync('src/data/game.json', JSON.stringify(payload, null, 2));
console.log('snapshots', snapshots.length, 'moves', state.moves.length, 'home', payload.facts.home);
