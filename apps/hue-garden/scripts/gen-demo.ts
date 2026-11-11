import { mkdirSync, writeFileSync } from 'node:fs';
import { apply, legalMoves, rngForConfig, setup, view } from '../src/game/engine';
import { chooseMove } from '../src/ai/ai';
import { mulberry32 } from '../src/game/rng';
import type { GameConfig, GameState, Move } from '../src/game/types';

const LEVEL = 'normal' as const;
const DEMO_MOVES = 38;

function names(lang: 'en' | 'zh'): [string, string] {
  return lang === 'zh' ? ['林奶奶', '阿禾'] : ['Grandma Lin', 'Ahe'];
}

function config(lang: 'en' | 'zh', seed: string): GameConfig {
  const [a, b] = names(lang);
  return {
    playerCount: 2,
    seats: [
      { name: a, kind: 'human', level: LEVEL },
      { name: b, kind: 'human', level: LEVEL },
    ],
    seed,
  };
}

function aiMove(state: GameState, salt: number): Move | null {
  const seatView = view(state, state.current);
  return (
    chooseMove(seatView, LEVEL, 40, mulberry32(0x9e3779b9 ^ salt ^ state.moves.length)) ??
    legalMoves(state, state.current)[0] ??
    null
  );
}

function makeDemo(lang: 'en' | 'zh'): GameState {
  const cfg = config(lang, `hg-demo-${lang}-v1`);
  let state = setup(cfg, rngForConfig(cfg));
  let guard = 0;
  while (state.status === 'playing' && state.moves.length < DEMO_MOVES && guard++ < 200) {
    const move = aiMove(state, 11);
    if (!move) break;
    const out = apply(state, move);
    if (!out.ok) break;
    state = out.state;
  }
  // Finish the half-round so the screenshot shows the first player thinking.
  while (state.status === 'playing' && state.current !== 0 && guard++ < 205) {
    const move = aiMove(state, 17);
    if (!move) break;
    const out = apply(state, move);
    if (!out.ok) break;
    state = out.state;
  }
  return state;
}

interface WinShot {
  state: GameState;
  move: Move;
}

function findWin(lang: 'en' | 'zh'): WinShot | null {
  for (let seed = 1; seed <= 160; seed++) {
    const cfg = config(lang, `hg-win-${lang}-${seed}`);
    let state = setup(cfg, rngForConfig(cfg));
    let guard = 0;
    while (state.status === 'playing' && guard++ < 500) {
      const move = aiMove(state, seed);
      if (!move) break;
      const before = state;
      const out = apply(state, move);
      if (!out.ok) break;
      if (out.state.status === 'ended' && out.state.endReason === 'cleared') {
        if (
          move.kind === 'play' &&
          move.placements.length === 1 &&
          before.hands[before.current].length === 1
        ) {
          return { state: before, move };
        }
      }
      state = out.state;
    }
  }
  return null;
}

mkdirSync('docs', { recursive: true });
for (const lang of ['en', 'zh'] as const) {
  const demo = makeDemo(lang);
  writeFileSync(
    `docs/demo-state.${lang}.json`,
    JSON.stringify({ version: 1, state: demo, savedAt: Date.now() }, null, 2),
  );
  console.log(lang, 'demo', demo.moves.length, 'moves', demo.board.length, 'tiles', demo.current, 'current');

  const win = findWin(lang);
  if (!win) {
    console.error('no one-tile win state found');
    process.exit(1);
  }
  writeFileSync(
    `docs/win-state.${lang}.json`,
    JSON.stringify({ version: 1, state: win.state, savedAt: Date.now() }, null, 2),
  );
  writeFileSync(
    `docs/win-move.${lang}.json`,
    JSON.stringify(
      {
        seat: win.move.seat,
        handTiles: win.state.hands[win.move.seat],
        placements: win.move.kind === 'play' ? win.move.placements : [],
      },
      null,
      2,
    ),
  );
  console.log(
    lang,
    'win state',
    win.state.moves.length,
    'moves',
    'scores',
    win.state.scores,
    'bag',
    win.state.bag.length,
    'hand',
    win.state.hands[win.move.seat],
  );
}
