/// <reference lib="webworker" />
import { Game } from '../game/engine';
import { mulberry32 } from '../game/rng';
import type { AiRequest, AiResponse } from './protocol';
import { chooseMove } from './search';

self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const req = ev.data;
  const started = Date.now();
  let move: AiResponse['move'] = null;
  try {
    const g = Game.deserialize(req.snapshot);
    const rng = mulberry32(req.seed);
    move = chooseMove(g, req.seat, req.difficulty, started + req.budgetMs, rng);
  } catch (err) {
    console.error('AI worker 出错', err);
  }
  const res: AiResponse = { id: req.id, move, ms: Date.now() - started };
  (self as unknown as Worker).postMessage(res);
};

export {};
