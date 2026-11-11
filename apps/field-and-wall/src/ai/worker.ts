import { chooseMove } from './ai';
import { mulberry32 } from '../game/rng';
import type { AiLevel, GameView, Move } from '../game/types';

interface Request {
  requestId: number;
  view: GameView;
  seat: number;
  level: AiLevel;
  budgetMs: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, view, seat, level, budgetMs, seed } = event.data;
  let move: Move | null = null;
  try {
    move = chooseMove(view, seat, {
      level,
      budgetMs,
      rng: mulberry32(seed),
    });
  } catch {
    move = null;
  }
  self.postMessage({ requestId, move });
};
