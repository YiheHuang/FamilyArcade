import type { AiLevel, GameState, Move } from './types.js';
import { hashString, mulberry32 } from './rng.js';
import { legalMoves } from './legal.js';
import { applyMove } from './apply.js';
import { chooseMove } from './ai/index.js';
import { setupGame, type GameOptions, type PlayerConfig } from './setup.js';

export type AgentFn = (state: GameState) => Move;

/** 确定性随机走法智能体（测试用；可由 seed 复现） */
export function randomAgent(): AgentFn {
  return (state) => {
    const moves = legalMoves(state);
    if (moves.length === 0) throw new Error('no legal moves');
    const rng = mulberry32(hashString(`${state.seed}|rnd|${state.current}|${state.moves.length}`));
    return moves[Math.floor(rng() * moves.length)]!;
  };
}

/** AI 智能体（确定性） */
export function aiAgent(level: AiLevel): AgentFn {
  return (state) => chooseMove(state, level);
}

export interface RunGameResult {
  state: GameState;
  error?: string;
}

/** 跑完一整局（headless） */
export function runGame(
  players: PlayerConfig[],
  opts: GameOptions,
  agents: readonly AgentFn[],
  maxMoves = 4000,
): RunGameResult {
  let state = setupGame(players, opts);
  let guard = 0;
  while (state.phase !== 'ended') {
    if (guard++ > maxMoves) return { state, error: `超过最大步数 ${maxMoves}，游戏未结束` };
    const agent = agents[state.current];
    if (!agent) return { state, error: `座位 ${state.current} 没有智能体` };
    const move = agent(state);
    const res = applyMove(state, move);
    if (res.error) return { state, error: `非法走法（座位 ${state.current}）：${res.error}` };
    state = res.state;
  }
  return { state };
}

export { chooseMove };
