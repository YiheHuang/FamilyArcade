import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { apply, replay, rngForConfig, setup } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';

const saved = JSON.parse(
  readFileSync(path.resolve('..', 'docs', 'demo-state.en.json'), 'utf8'),
) as { state: GameState };

const config = saved.state.config;
const moves = saved.state.moves;
const finalState = replay(config, moves);

function snapshot(state: GameState) {
  return {
    board: state.board.map((t) => ({ ...t })),
    scores: [...state.scores],
    blooms: [...state.blooms],
    current: state.current,
    turn: state.turn,
    moves: state.moves.length,
  };
}

const snapshots = [snapshot(finalState)];
let state = setup(config, rngForConfig(config));
snapshots[0] = snapshot(state);
for (let i = 0; i < moves.length; i++) {
  const out = apply(state, moves[i]);
  if (!out.ok) throw new Error(`video data replay failed: ${out.reason}`);
  state = out.state;
  if ((i + 1) % 2 === 0 || i === moves.length - 1) snapshots.push(snapshot(state));
}

const data = {
  config,
  moves,
  snapshots,
  facts: {
    moves: moves.length,
    turns: finalState.turn,
    tiles: finalState.board.length,
    scores: finalState.scores,
    blooms: finalState.blooms,
    bag: finalState.bag.length,
    hands: finalState.hands.map((h) => h.length),
    status: finalState.status,
    endReason: finalState.endReason,
  },
};

mkdirSync(path.resolve('src', 'data'), { recursive: true });
writeFileSync(path.resolve('src', 'data', 'game.json'), JSON.stringify(data, null, 2));console.log(
  'game.json',
  'moves',
  data.facts.moves,
  'snapshots',
  snapshots.length,
  'tiles',
  data.facts.tiles,
  'scores',
  data.facts.scores,
);
