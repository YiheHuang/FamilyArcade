import { choosePick } from './ai';
import { mulberry32 } from '../game/rng';
import type { AiLevel, GameView } from '../game/types';

interface Request {
  requestId: number;
  view: GameView;
  level: AiLevel;
  budgetMs: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, view, level, budgetMs, seed } = event.data;
  const cardId = choosePick(view, level, budgetMs, mulberry32(seed));
  self.postMessage({ requestId, cardId });
};
