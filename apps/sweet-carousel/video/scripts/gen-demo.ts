/**
 * Generate the two real demo games used by the Remotion promo.
 * This mirrors scripts/shots.mjs exactly:
 *   - first two pick groups: every seat takes the first card in hand;
 *   - round 1 pick 3, seat 0 takes the third card (the selected-card screenshot);
 *   - everything else: first card in hand.
 *
 * Run from the repo root:
 *   npx vite-node video/scripts/gen-demo.ts
 */
import { writeFileSync } from 'node:fs';
import { apply, result, score, setupFromSeed } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';

function play(seed: string, names: string[]): GameState {
  let state = setupFromSeed({
    playerCount: 3,
    seats: names.map((name) => ({ name, kind: 'human', level: 'normal' })),
    seed,
  });
  while (state.phase !== 'ended') {
    if (state.phase === 'choosing') {
      for (let seat = 0; seat < state.config.playerCount; seat++) {
        const special = state.round === 1 && state.pickIndex === 2 && seat === 0;
        const cardId = state.hands[seat][special ? Math.min(2, state.hands[seat].length - 1) : 0];
        const out = apply(state, { kind: 'pick', seat, cardId });
        if (!out.ok) throw new Error(out.reason);
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
  return state;
}

function exportDemo(seed: string, names: string[], file: string) {
  const state = play(seed, names);
  const rows = score(state);
  const final = result(state)!;
  const data = {
    seed,
    players: rows.map((row) => ({
      seat: row.seat,
      name: row.name,
      total: row.total,
      rounds: row.roundScores,
      crowns: row.majorities,
      types: row.types,
      cards: row.cards,
    })),
    ranking: final.ranking.map((row) => row.seat),
    winner: final.winner,
    crowns: final.crowns.map((crown) => ({
      dessert: crown.dessert,
      seat: crown.seat,
      count: crown.count,
      points: crown.points,
    })),
    rounds: state.rounds.map((round) => ({
      round: round.round,
      passDirection: round.passDirection,
      totals: round.breakdowns.map((breakdown) => breakdown.total),
      combos: round.breakdowns.map((breakdown) => ({
        seat: breakdown.seat,
        pairs: breakdown.combos.filter((combo) => combo.kind === 'pair').length,
        triples: breakdown.combos.filter((combo) => combo.kind === 'triple').length,
        quads: breakdown.combos.filter((combo) => combo.kind === 'quad').length,
        sampler: Boolean(breakdown.sampler),
        leftovers: breakdown.leftoverPoints,
        total: breakdown.total,
      })),
    })),
    facts: {
      cards: 72,
      desserts: 6,
      copies: 12,
      rounds: 3,
      picksPerRound: 8,
      pair: 2,
      triple: 6,
      quad: 12,
      sampler: 5,
      crown: 6,
      leftover: 1,
      crownMin: 6,
      players: 3,
    },
  };
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(file, rows.map((row) => `${row.name}:${row.total}`).join(', '), 'crowns', final.crowns.length);
}

exportDemo('shots-en', ['Player 1', 'Player 2', 'Player 3'], 'video/src/data/demo-en.json');
exportDemo('shots-zh', ['玩家 1', '玩家 2', '玩家 3'], 'video/src/data/demo-zh.json');
