import { chooseMove } from './ai';
import { mulberry32 } from '../game/rng';
import type { AiLevel, PlayerView } from '../game/types';

interface Request {
  requestId: number;
  view: PlayerView;
  level: AiLevel;
  budgetMs: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, view, level, budgetMs, seed } = event.data;
  const rng = mulberry32(seed);
  let move = null;
  try {
    move = chooseMove(view, level, budgetMs, rng);
  } catch {
    move = null;
  }
  self.postMessage({ requestId, move });
};
