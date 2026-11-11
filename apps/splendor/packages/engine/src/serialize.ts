import type { GameState, Move } from './types.js';
import { applyMove, cloneState } from './apply.js';
import { setupGame, type GameOptions, type PlayerConfig } from './setup.js';

export interface SaveFile {
  kind: 'splendor-save';
  version: 1;
  savedAt: string;
  state: GameState;
}

export function serializeGame(state: GameState): string {
  const doc: SaveFile = { kind: 'splendor-save', version: 1, savedAt: new Date().toISOString(), state };
  return JSON.stringify(doc);
}

export function deserializeGame(json: string): GameState {
  const doc = JSON.parse(json) as SaveFile;
  if (doc.kind !== 'splendor-save' || doc.version !== 1) throw new Error('invalid save format');
  const state = doc.state;
  if (state.version !== 1) throw new Error('unsupported save version');
  return state;
}

/** 从种子 + 走法序列完整重放（确定性校验用） */
export function replayGame(players: PlayerConfig[], opts: GameOptions, moves: readonly Move[]): { state: GameState; error?: string } {
  let state = setupGame(players, opts);
  for (const move of moves) {
    const res = applyMove(state, move);
    if (res.error) return { state, error: `重放失败（第 ${state.moves.length + 1} 步）：${res.error}` };
    state = res.state;
  }
  return { state };
}
