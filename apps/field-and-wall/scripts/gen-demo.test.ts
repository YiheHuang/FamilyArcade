import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { apply, legalMoves, result, setup, simulatePlacement, viewFor } from '../src/game/engine';
import { chooseMove } from '../src/ai/ai';
import { mulberry32 } from '../src/game/rng';
import { localFeatures } from '../src/game/tiles';
import type { GameConfig, GameState, Move, ScoredFeature } from '../src/game/types';

interface Snapshot {
  moves: Move[];
  state: GameState;
  beauty: number;
  lastScored: ScoredFeature[];
}

function box(state: GameState): { w: number; h: number } {
  const xs = state.tiles.map((t) => t.x);
  const ys = state.tiles.map((t) => t.y);
  return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
}

function play(seed: string): { mid: Snapshot | null; end: GameState | null; full: GameState | null; target: Move | null } {
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: 'Mira', kind: 'human', level: 'normal' },
      { name: 'Tomas', kind: 'human', level: 'normal' },
    ],
    seed,
  };
  let state = setup(config);
  let mid: Snapshot | null = null;
  let guard = 0;
  while (state.status === 'playing' && guard++ < 90) {
    if (
      !mid &&
      state.tiles.length >= 30 &&
      state.tiles.length <= 44 &&
      state.bag.length > 6 &&
      state.lastScored.length > 0
    ) {
      const b = box(state);
      const type = state.currentTile;
      const hasClaimable = type ? localFeatures(type, 0).length > 0 : false;
      if (
        b.w >= 6 &&
        b.h >= 6 &&
        b.w <= 10 &&
        b.h <= 10 &&
        state.meeplesLeft[state.current] > 0 &&
        hasClaimable
      ) {
        const meepleCount = state.tiles.filter((t) => t.meeple != null).length;
        const gained = state.lastScored.reduce((n, f) => n + f.points, 0);
        const balance = Math.abs(state.scores[0] - state.scores[1]);
        mid = {
          moves: [...state.moves],
          state,
          beauty:
            gained * 2 +
            meepleCount * 3 +
            Math.min(state.tiles.length, 40) * 0.4 +
            state.scores[0] +
            state.scores[1] -
            Math.abs(b.w - b.h) * 4 -
            Math.max(0, balance - 16) * 0.5,
          lastScored: state.lastScored,
        };
      }
    }
    const move = chooseMove(viewFor(state), state.current, {
      level: 'normal',
      budgetMs: 26,
      rng: mulberry32(guard * 7919 + state.moves.length),
    });
    const chosen = move ?? legalMoves(state, state.current)[0];
    if (!chosen) break;
    const out = apply(state, chosen);
    if (!out.ok) break;
    state = out.state;
    if (state.status === 'playing' && state.bag.length === 0) {
      const target = pickTarget(state);
      if (target) {
        return { mid, end: state, full: state, target };
      }
    }
  }
  return { mid, end: null, full: state, target: null };
}

function pickTarget(state: GameState): Move | null {
  const legal = legalMoves(state, state.current).filter((m) => m.kind === 'place');
  if (legal.length === 0) {
    const discard = legalMoves(state, state.current)[0];
    return discard ?? null;
  }
  let best: { move: Move; points: number; meeple: boolean } | null = null;
  for (const move of legal) {
    const sim = simulatePlacement(
      state.tiles,
      state.currentTile ?? '',
      state.current,
      move,
      state.scores,
      state.meeplesLeft,
      state.completed,
    );
    const points = sim.scored.reduce((n, f) => n + (f.seats.includes(state.current) ? f.points : 0), 0);
    const meeple = move.meeple != null;
    if (!best || points > best.points || (points === best.points && meeple && !best.meeple)) {
      best = { move, points, meeple };
    }
  }
  return best?.move ?? null;
}

function writeSave(path: string, config: GameConfig, moves: Move[]): void {
  writeFileSync(
    path,
    JSON.stringify({ version: 1, config, moves, savedAt: 0 }, null, 2),
    'utf8',
  );
}

function rename(config: GameConfig, names: string[]): GameConfig {
  return {
    ...config,
    seats: config.seats.map((seat, i) => ({ ...seat, name: names[i] })),
  };
}

describe('demo data', () => {
  it('writes a curated mid-game and a one-move-from-the-end position', () => {
    mkdirSync('docs', { recursive: true });
    let best: { seed: string; mid: Snapshot; end: GameState; target: Move } | null = null;
    for (let s = 0; s < 7; s++) {
      const seed = `showcase-${s}`;
      const played = play(seed);
      if (!played.mid || !played.end || !played.target) continue;
      if (!best || played.mid.beauty > best.mid.beauty) {
        best = { seed, mid: played.mid, end: played.end, target: played.target };
      }
    }
    if (!best) throw new Error('could not generate a demo game');

    const enNames = ['Mira', 'Tomas'];
    const zhNames = ['阿禾', '小满'];
    const baseConfig = best.mid.state.config;

    writeSave('docs/demo-save.en.json', rename(baseConfig, enNames), best.mid.moves);
    writeSave('docs/demo-save.zh.json', rename(baseConfig, zhNames), best.mid.moves);
    writeSave('docs/end-save.en.json', rename(baseConfig, enNames), best.end.moves);
    writeSave('docs/end-save.zh.json', rename(baseConfig, zhNames), best.end.moves);

    const fullMoves = best.end.moves;
    const fullEn = { ...rename(baseConfig, enNames), seed: baseConfig.seed };
    const fullZh = { ...rename(baseConfig, zhNames), seed: baseConfig.seed };

    const midState = best.mid.state;
    const b = box(midState);
    writeFileSync(
      'docs/demo-info.json',
      JSON.stringify(
        {
          seed: best.seed,
          midMoves: best.mid.moves.length,
          midTiles: midState.tiles.length,
          midScores: midState.scores,
          midTurn: midState.turn,
          midCurrent: midState.current,
          midCurrentTile: midState.currentTile,
          midLastScored: best.mid.lastScored,
          boardBox: b,
          endMoves: best.end.moves.length,
          endScores: best.end.scores,
          target: best.target,
          full: { en: fullEn, zh: fullZh },
        },
        null,
        2,
      ),
      'utf8',
    );

    // A quick sanity check for the generated end position.
    if (best.end.status !== 'playing') throw new Error('end snapshot should be playable');
    if (best.end.bag.length !== 0) throw new Error('end snapshot should have an empty bag');
    const out = apply(best.end, best.target);
    if (!out.ok) throw new Error(`target move is illegal: ${out.reason}`);
    if (out.state.status !== 'ended') throw new Error('target move should finish the game');
    const res = result(out.state);
    if (!res) throw new Error('finished game has no result');

    writeFileSync(
      'docs/full-game.en.json',
      JSON.stringify(
        { config: fullEn, moves: [...fullMoves, best.target], scores: out.state.scores.slice() },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      'docs/full-game.zh.json',
      JSON.stringify(
        { config: fullZh, moves: [...fullMoves, best.target], scores: out.state.scores.slice() },
        null,
        2,
      ),
      'utf8',
    );

    console.log(
      `demo ${best.seed}: ${best.mid.state.tiles.length} tiles, scores ${best.mid.state.scores.join(':')}, end ${out.state.scores.join(':')}`,
    );
  }, 120_000);
});
