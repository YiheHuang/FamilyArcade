/**
 * Local calibration helper. Run with: npm run ai:calibrate
 * Not part of the app bundle; it prints a small table for docs/ai-calibration.md.
 */
import { apply, legal, result, setupFromSeed, score, view } from '../src/game/engine';
import { choosePick } from '../src/ai/ai';
import { mulberry32, seedFromString } from '../src/game/rng';
import type { AiLevel, GameState, PlayerCount } from '../src/game/types';

function playAiGame(levels: AiLevel[], seed: string): GameState {
  const playerCount = levels.length as PlayerCount;
  let state = setupFromSeed({
    playerCount,
    seats: levels.map((level, index) => ({ name: `Seat ${index + 1}`, kind: 'ai', level })),
    seed,
  });
  const rng = mulberry32(seedFromString(seed));
  let guard = 0;
  while (state.phase !== 'ended' && guard < 500) {
    guard++;
    if (state.phase === 'choosing') {
      const open = state.pending
        .map((cardId, seat) => (cardId === null ? seat : -1))
        .filter((seat) => seat >= 0);
      for (const seat of open) {
        const cardId = choosePick(view(state, seat), levels[seat], 80, rng);
        if (cardId === null) throw new Error('AI returned no card');
        const out = apply(state, { kind: 'pick', seat, cardId });
        if (!out.ok) throw new Error(`AI pick rejected: ${out.reason}`);
        state = out.state;
      }
    } else if (state.phase === 'reveal') {
      const out = apply(state, { kind: 'advance' });
      if (!out.ok) throw new Error(out.reason);
      state = out.state;
    } else {
      const out = apply(state, { kind: 'next-round' });
      if (!out.ok) throw new Error(out.reason);
      state = out.state;
    }
  }
  if (state.phase !== 'ended') throw new Error('AI game did not finish');
  return state;
}

function playRandomGame(playerCount: PlayerCount, seed: string): { totals: number[]; rows: ReturnType<typeof score> } {
  let state = setupFromSeed({
    playerCount,
    seats: Array.from({ length: playerCount }, (_, index) => ({
      name: `Seat ${index + 1}`,
      kind: 'human' as const,
      level: 'normal' as const,
    })),
    seed,
  });
  const rng = mulberry32(seedFromString(seed));
  let guard = 0;
  while (state.phase !== 'ended' && guard < 500) {
    guard++;
    if (state.phase === 'choosing') {
      const open = state.pending
        .map((cardId, seat) => (cardId === null ? seat : -1))
        .filter((seat) => seat >= 0);
      const seat = open[Math.floor(rng() * open.length)];
      const moves = legal(state, seat);
      const out = apply(state, moves[Math.floor(rng() * moves.length)]);
      if (!out.ok) throw new Error(out.reason);
      state = out.state;
    } else if (state.phase === 'reveal') {
      const out = apply(state, { kind: 'advance' });
      if (!out.ok) throw new Error(out.reason);
      state = out.state;
    } else {
      const out = apply(state, { kind: 'next-round' });
      if (!out.ok) throw new Error(out.reason);
      state = out.state;
    }
  }
  return { totals: score(state).map((row) => row.total), rows: score(state) };
}

function matchup(
  a: AiLevel,
  b: AiLevel,
  games: number,
): { aWins: number; bWins: number; avg: number; aPoints: number; bPoints: number } {
  let aWins = 0;
  let bWins = 0;
  let total = 0;
  let aPoints = 0;
  let bPoints = 0;
  for (let game = 0; game < games; game++) {
    const aFirst = game % 2 === 0;
    const levels: AiLevel[] = aFirst ? [a, b] : [b, a];
    const state = playAiGame(levels, `cal-${a}-${b}-${game}`);
    const res = result(state)!;
    const winnerLevel = levels[res.winner!];
    if (winnerLevel === a) aWins++;
    else bWins++;
    const rows = score(state);
    const avg = rows.reduce((sum, row) => sum + row.total, 0) / 2;
    total += avg;
    aPoints += rows[levels.indexOf(a)].total;
    bPoints += rows[levels.indexOf(b)].total;
  }
  return { aWins, bWins, avg: total / games, aPoints: aPoints / games, bPoints: bPoints / games };
}

const games = Number(process.env.CAL_GAMES ?? 200);
const randomTotals: number[] = [];
const components = { set: 0, sampler: 0, leftover: 0, crown: 0 };
for (let i = 0; i < games; i++) {
  const playerCount = (2 + (i % 4)) as PlayerCount;
  const game = playRandomGame(playerCount, `random-${i}`);
  randomTotals.push(...game.totals);
  for (const row of game.rows) {
    components.set += row.setPoints;
    components.sampler += row.samplerPoints;
    components.leftover += row.leftoverPoints;
    components.crown += row.crownPoints;
  }
}
const randomAverage = randomTotals.reduce((sum, value) => sum + value, 0) / randomTotals.length;
const randomMin = Math.min(...randomTotals);
const randomMax = Math.max(...randomTotals);

console.log('Sweet Carousel calibration');
console.log(`random games: ${games}, seats: ${randomTotals.length}`);
console.log(`random average score: ${randomAverage.toFixed(2)} (min ${randomMin}, max ${randomMax})`);
console.log(
  `per-seat components: sets ${(components.set / randomTotals.length).toFixed(2)}, ` +
    `samplers ${(components.sampler / randomTotals.length).toFixed(2)}, ` +
    `leftovers ${(components.leftover / randomTotals.length).toFixed(2)}, ` +
    `crowns ${(components.crown / randomTotals.length).toFixed(2)}`,
);
console.log('');
for (const [a, b] of [
  ['hard', 'normal'],
  ['normal', 'easy'],
  ['easy', 'companion'],
] as const) {
  const resultRow = matchup(a, b, games);
  console.log(
    `${a} vs ${b}: ${resultRow.aWins}-${resultRow.bWins} ` +
      `(${((resultRow.aWins / games) * 100).toFixed(1)}% for ${a}), ` +
      `avg points ${a} ${resultRow.aPoints.toFixed(1)} / ${b} ${resultRow.bPoints.toFixed(1)}, ` +
      `table total ${resultRow.avg.toFixed(1)}`,
  );
}
