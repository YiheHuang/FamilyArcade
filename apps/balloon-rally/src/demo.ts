import { setup, apply, score } from './game/engine';
import { mulberry32, seedFromString } from './game/rng';
import type { GameConfig, GameState } from './game/types';
import type { Lang } from './i18n';

interface Choice {
  balloon: number;
  tailwind: boolean;
}

const CHOICES: Choice[][] = [
  [
    { balloon: 0, tailwind: false },
    { balloon: 3, tailwind: false },
    { balloon: 1, tailwind: true },
    { balloon: 4, tailwind: false },
  ],
  [
    { balloon: 2, tailwind: false },
    { balloon: 0, tailwind: true },
    { balloon: 4, tailwind: false },
    { balloon: 3, tailwind: false },
  ],
  [
    { balloon: 1, tailwind: false },
    { balloon: 2, tailwind: false },
    { balloon: 0, tailwind: false },
    { balloon: 4, tailwind: true },
  ],
  [
    { balloon: 3, tailwind: false },
    { balloon: 4, tailwind: false },
    { balloon: 2, tailwind: true },
    { balloon: 1, tailwind: false },
  ],
];

function names(lang: Lang): string[] {
  return lang === 'zh' ? ['小满', '阿禾', '外婆', '小北'] : ['Maya', 'Leo', 'Nana', 'Sam'];
}

function configFor(seed: string, lang: Lang): GameConfig {
  const list = names(lang);
  return {
    playerCount: list.length,
    seed,
    seats: list.map((name) => ({ name, kind: 'human', level: 'normal' })),
  };
}

function playOneRound(state: GameState, round: number): GameState {
  let current = state;
  for (const choice of CHOICES[round - 1]) {
    const out = apply(current, {
      kind: 'support',
      seat: current.current,
      balloon: choice.balloon,
      tailwind: choice.tailwind,
    });
    if (!out.ok) throw new Error(`demo move failed: ${out.reason}`);
    current = out.state;
  }
  return current;
}

function advance(state: GameState): GameState {
  const out = apply(state, { kind: 'advance' });
  if (!out.ok) throw new Error(`demo advance failed: ${out.reason}`);
  return out.state;
}

function playTo(seed: number, rounds: number, lang: Lang): GameState {
  const config = configFor(`demo-${seed}`, lang);
  let state = setup(config, mulberry32(seedFromString(config.seed)));
  for (let round = 1; round <= rounds; round++) {
    state = playOneRound(state, round);
    if (round < rounds) state = advance(state);
  }
  return state;
}

function summaryQuality(state: GameState): number {
  if (state.history.length < 2) return -1;
  const positions = state.positions;
  const distinct = new Set(positions).size;
  const sorted = [...new Set(positions)].sort((a, b) => b - a);
  const gap = sorted.length > 1 ? sorted[0] - sorted[1] : 0;
  const totals = score(state).map((r) => r.total);
  const spread = Math.max(...totals) - Math.min(...totals);
  if (distinct < 4) return -1;
  if (gap < 1 || gap > 4) return -1;
  return distinct * 10 + gap * 3 + Math.min(spread, 5);
}

function endQuality(state: GameState): number {
  if (state.phase !== 'ended') return -1;
  const rows = score(state);
  const winners = rows.filter((r) => r.rank === 1);
  if (winners.length !== 1) return -1;
  const second = rows.find((r) => r.rank === 2);
  const margin = second ? winners[0].total - second.total : 0;
  if (margin < 1 || margin > 4) return -1;
  return 20 + margin * 2 + winners[0].total / 10;
}

export function buildDemoState(kind: 'summary' | 'support' | 'end', lang: Lang): GameState {
  if (kind === 'end') {
    let best: GameState | null = null;
    let bestScore = -1;
    for (let seed = 1; seed < 2200; seed++) {
      const state = playTo(seed, 4, lang);
      let ended = state;
      if (state.phase === 'summary') ended = advance(state);
      const quality = endQuality(ended);
      if (quality > bestScore) {
        best = ended;
        bestScore = quality;
      }
    }
    if (!best) {
      const state = playTo(1, 4, lang);
      best = state.phase === 'summary' ? advance(state) : state;
    }
    return best;
  }

  let best: GameState | null = null;
  let bestScore = -1;
  for (let seed = 1; seed < 2200; seed++) {
    const state = playTo(seed, 2, lang);
    const quality = summaryQuality(state);
    if (quality > bestScore) {
      best = state;
      bestScore = quality;
    }
  }
  const summary = best ?? playTo(1, 2, lang);
  return kind === 'summary' ? summary : advance(summary);
}
