import { describe, expect, it } from 'vitest';
import { setupGame } from '../src/setup';
import { applyMove } from '../src/apply';
import { chooseMove } from '../src/ai';
import { randomAgent } from '../src/simulation';
import { checkInvariants } from '../src/invariants';
import { totalPoints } from '../src/scoring';
import type { AiLevel, GameState, Move } from '../src/types';
import type { PlayerConfig } from '../src/setup';

type SeatPlan = AiLevel | 'random';

function agentFor(plan: SeatPlan) {
  if (plan === 'random') return randomAgent();
  return (state: GameState): Move => chooseMove(state, plan);
}

function playOneGame(seed: string, plans: readonly SeatPlan[]): GameState {
  const configs: PlayerConfig[] = plans.map((p, i) => ({
    name: `P${i}`,
    kind: p === 'random' ? 'human' : 'ai',
    aiLevel: p === 'random' ? 'normal' : p,
  }));
  let state = setupGame(configs, { seed });
  const agents = plans.map(agentFor);
  let steps = 0;
  while (state.phase !== 'ended') {
    if (steps++ > 1500) throw new Error(`seed=${seed} 对局超过 1500 步未结束`);
    const move = agents[state.current]!(state);
    const res = applyMove(state, move);
    if (res.error) throw new Error(`seed=${seed} 第 ${steps} 步非法：${res.error}`);
    state = res.state;
    const issues = checkInvariants(state);
    if (issues.length) throw new Error(`seed=${seed} 不变量被破坏：${issues.join('；')}`);
  }
  return state;
}

describe('AI 自动对局回归（headless）', () => {
  it('16 局混合对局：不变量恒成立、回合数相等、胜者合法', () => {
    for (let g = 0; g < 16; g++) {
      const n = 2 + (g % 3);
      const hardMix = g % 3 === 0;
      const plans: SeatPlan[] = Array.from({ length: n }, (_, i) => {
        if (hardMix) return i === 0 ? 'hard' : i === 1 ? 'normal' : 'easy';
        return i % 2 === 0 ? 'easy' : 'random';
      });
      const state = playOneGame(`sim-${g}`, plans);
      const scores = state.players.map(totalPoints);
      expect(state.winners!.length).toBeGreaterThan(0);
      for (const w of state.winners!) expect(scores[w]).toBe(Math.max(...scores));
      expect(scores.some((s) => s >= 15)).toBe(true);
      expect(new Set(state.turnsTaken).size).toBe(1);
      expect(state.finalRound).toBe(true);
    }
  }, 180_000);

  it('4 人全困难局可正常完赛', () => {
    const state = playOneGame('sim-hard-4p', ['hard', 'hard', 'hard', 'hard']);
    expect(state.phase).toBe('ended');
    expect(state.winners!.length).toBeGreaterThan(0);
  }, 180_000);

  it('2 人全陪玩档可正常完赛（陪玩档也能打完）', () => {
    const state = playOneGame('sim-friendly', ['friendly', 'friendly']);
    expect(state.phase).toBe('ended');
  }, 60_000);
});
