import { chooseMove } from './ai';
import { mulberry32 } from '../game/rng';
import type { AiLevel, GameState } from '../game/types';

interface Request {
  requestId: number;
  state: GameState;
  seat: number;
  level: AiLevel;
  budgetMs: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, state, seat, level, budgetMs, seed } = event.data;
  const rng = mulberry32(seed);
  const move = chooseMove(state, seat, { level, budgetMs, rng });
  self.postMessage({ requestId, move });
};
