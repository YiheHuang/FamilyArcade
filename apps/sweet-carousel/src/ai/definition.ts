import * as engine from '../game/engine';
import type { GameConfig, GameDefinition, GameState, GameView, Move } from '../game/types';
import { choosePick, explainPick } from './ai';

export const sweetCarousel: GameDefinition<GameState, Move, GameView, GameConfig> = {
  id: 'sweet-carousel',
  minPlayers: engine.MIN_PLAYERS,
  maxPlayers: engine.MAX_PLAYERS,
  setup: engine.setup,
  view: engine.view,
  legal: engine.legal,
  apply: engine.apply,
  score: engine.score,
  result: engine.result,
  serialize: engine.serialize,
  deserialize: engine.deserialize,
  invariants: engine.invariants,
  ai: {
    choose(view, level, budgetMs, rng) {
      const cardId = choosePick(view, level, budgetMs, rng);
      if (cardId === null || view.mySeat === null) return null;
      return { kind: 'pick', seat: view.mySeat, cardId };
    },
    explain(view, move) {
      if (move.kind !== 'pick') return { key: 'hint.potential' };
      return explainPick(view, move.cardId);
    },
  },
};
