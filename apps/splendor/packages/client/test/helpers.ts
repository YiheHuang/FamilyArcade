import { applyMove, chooseMove, setupGame, type GameState, type Move, type PlayerConfig } from '@splendor/engine';

/** 客户端测试用：让引擎自打一局直到结束（人类座位用 normal 强度出招） */
export function playToEnd(players: PlayerConfig[], seed = 'client-test'): { state: GameState; moves: Move[] } {
  let state = setupGame(players, { seed });
  const moves: Move[] = [];
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 800) {
    const current = state.players[state.current]!;
    const level = current.kind === 'ai' ? (current.aiLevel ?? 'normal') : 'normal';
    const move = chooseMove(state, level);
    const res = applyMove(state, move);
    if (res.error) break;
    moves.push(move);
    state = res.state;
  }
  return { state, moves };
}

const HUMANS: PlayerConfig[] = [
  { name: '爸爸', kind: 'human' },
  { name: '电脑', kind: 'ai', aiLevel: 'normal' },
];

export const testGameFixtures = {
  /** 一局已结束的真实对局（人类座位 0） */
  finished: (seed = 'client-test-finished'): GameState => playToEnd(HUMANS, seed).state,
};
