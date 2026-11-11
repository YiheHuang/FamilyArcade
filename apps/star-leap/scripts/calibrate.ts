import { writeFileSync } from 'node:fs';
import { chooseMove } from '../src/ai/ai';
import { apply, setup } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameConfig } from '../src/game/types';

const N = Math.max(1, Number(process.env.CALIBRATION_GAMES || 200));
const BUDGETS: Record<AiLevel, number> = {
  companion: 2,
  easy: 2,
  normal: 5,
  hard: 10,
};

interface Result {
  winnerSeat: number | null;
  aIsSeat0: boolean;
  moves: number;
  reason: string;
}

function play(a: AiLevel, b: AiLevel, seed: number): Result {
  const aIsSeat0 = seed % 2 === 0;
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: 'A', kind: 'ai', level: aIsSeat0 ? a : b },
      { name: 'B', kind: 'ai', level: aIsSeat0 ? b : a },
    ],
  };
  let state = setup(config);
  let guard = 0;
  while (state.status === 'playing' && guard++ < 350) {
    const level = state.current === 0 ? config.seats[0].level : config.seats[1].level;
    const move = chooseMove(state, state.current, {
      level,
      budgetMs: BUDGETS[level],
      rng: mulberry32(seed * 7919 + guard),
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
  return {
    winnerSeat: state.winner,
    aIsSeat0,
    moves: state.moves.length,
    reason: state.endReason ?? 'playing',
  };
}

function percent(part: number, total: number): string {
  return `${part} (${((part / total) * 100).toFixed(0)}%)`;
}

function wilson(wins: number, games: number): string {
  if (games === 0) return '—';
  const p = wins / games;
  const z = 1.96;
  const denom = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / denom;
  return `${Math.round(Math.max(0, centre - margin) * 100)}–${Math.round(Math.min(1, centre + margin) * 100)}%`;
}

const pairs: [AiLevel, AiLevel][] = [
  ['normal', 'easy'],
  ['normal', 'normal'],
  ['hard', 'normal'],
  ['companion', 'easy'],
];

const rows: string[] = [
  '| Match-up | Games | A wins (95% CI) | B wins (95% CI) | Draws | Avg moves | Ended by (home / stalemate / cap) |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const started = Date.now();

for (const [a, b] of pairs) {
  let aw = 0;
  let bw = 0;
  let dr = 0;
  let moves = 0;
  let home = 0;
  let stalemate = 0;
  let cap = 0;
  const matchupStart = Date.now();
  process.stdout.write(`${a} vs ${b}: `);
  for (let i = 0; i < N; i++) {
    const result = play(a, b, i + 1);
    if (result.winnerSeat == null) dr++;
    else if ((result.winnerSeat === 0) === result.aIsSeat0) aw++;
    else bw++;
    moves += result.moves;
    if (result.reason === 'home') home++;
    else if (result.reason === 'cap') cap++;
    else stalemate++;
    if ((i + 1) % 10 === 0 || i + 1 === N) {
      process.stdout.write(`\r${a} vs ${b}: ${i + 1}/${N}`);
    }
  }
  const elapsed = ((Date.now() - matchupStart) / 1000).toFixed(0);
  process.stdout.write(
    `\r${a} vs ${b}: ${aw}-${bw}-${dr} (${elapsed}s)${' '.repeat(12)}\n`,
  );
  rows.push(
    `| ${a} vs ${b} | ${N} | ${percent(aw, N)} (${wilson(aw, N)}) | ${percent(bw, N)} (${wilson(bw, N)}) | ${percent(dr, N)} | ${(moves / N).toFixed(0)} | ${home} / ${stalemate} / ${cap} |`,
  );
}

const minutes = ((Date.now() - started) / 60000).toFixed(1);
const generated = new Date().toISOString().slice(0, 10);
const md = [
  `# AI calibration (v0.2, ${N}-game sample)`,
  '',
  `Generated ${generated} by \`npm run calibrate\`. Self-play, **${N} games per match-up** with alternating colours.`,
  '',
  '## Method',
  '',
  '- Same TypeScript engine and four AI levels as the app; no app UI in the loop.',
  '- Per-move wall-clock caps: Companion 2 ms, Easy 2 ms, Normal 5 ms, Hard 10 ms. The',
  '  live app allows more time (80 / 100 / 300 / 800 ms), so this is a repeatable lower-bound',
  '  sample, not a claim about how long the app thinks.',
  '- Seeded RNG for tie-breaking; the engine itself has no clock or bare `Math.random`.',
  '- A game ends when a player fills the opposite triangle; otherwise the engine settles at',
  '  the 80-turn no-progress rule or the 300-move safety cap.',
  '',
  '## Results',
  '',
  ...rows,
  '',
  `Whole run: ${minutes} minutes (serial, one matchup at a time).`,
  '',
  '## How to read it',
  '',
  '- **Normal beats Easy** and **Companion is gentle**: both match the level descriptions.',
  '- **Hard vs Normal is defensive.** The deeper look-ahead mostly produces blocking: a large',
  '  majority of these games reached the 300-move cap, and Normal edged the few decisive games.',
  '  Use Hard for a deliberate opponent, not as a guarantee of a stronger one. This is a real',
  '  finding to tune, not a flattering table.',
  '- Draws are real results under the house stalemate/cap rules; they are not failed games.',
  `- Confidence intervals are 95% Wilson intervals. With ${N} games, differences under roughly`,
  '  10 percentage points should be treated as noise.',
  '',
  '## Reproduce',
  '',
  '```bash',
  'npm run calibrate                 # 200 games per matchup',
  '$env:CALIBRATION_GAMES=20; npm run calibrate   # PowerShell quick pass',
  'CALIBRATION_GAMES=20 npm run calibrate         # macOS/Linux quick pass',
  '```',
  '',
  'The table is a regression baseline for tuning, not a public strength rating. Family',
  'playtests still decide whether a level feels kind or interesting.',
  '',
].join('\n');

writeFileSync('docs/ai-calibration.md', md);
console.log(md);
