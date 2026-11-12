import {
  applyAction,
  type Card,
  type GameAction,
  type GameState,
} from '../game/rummy-500';
import { actionPoints, bestMeldAction, chooseAiAction, chooseDiscard } from './ai';

export type HintKind = 'meld' | 'layoff' | 'take' | 'stock' | 'discard' | 'must';

export interface Hint {
  kind: HintKind;
  action: GameAction;
  points?: number;
  card?: Card;
  cards?: Card[];
  meldId?: number;
}

export function hintFor(state: GameState): Hint | null {
  if (state.phase !== 'draw' && state.phase !== 'meld') return null;

  if (state.phase === 'draw') {
    const choice = chooseAiAction(state, 'hard', () => 0.5);
    if (choice?.type === 'take-discard') {
      const taken = applyAction(state, choice);
      if (taken.ok) {
        const play = bestMeldAction(taken.state, 'hard', () => 0.5);
        const points = play ? actionPoints(taken.state, play) : 0;
        return {
          kind: 'take',
          action: choice,
          card: state.discard[choice.index],
          points,
        };
      }
    }
    return { kind: 'stock', action: { type: 'draw-stock' } };
  }

  if (state.mustMeld) {
    const play = bestMeldAction(state, 'hard', () => 0.5);
    if (!play) return null;
    const points = actionPoints(state, play);
    if (play.type === 'meld') {
      return { kind: 'must', action: play, cards: play.cards, points };
    }
    if (play.type === 'layoff') {
      return { kind: 'must', action: play, card: play.card, meldId: play.meldId, points };
    }
    return null;
  }

  const play = bestMeldAction(state, 'hard', () => 0.5);
  if (play) {
    const points = actionPoints(state, play);
    if (play.type === 'meld') {
      return { kind: 'meld', action: play, cards: play.cards, points };
    }
    if (play.type === 'layoff') {
      return { kind: 'layoff', action: play, card: play.card, meldId: play.meldId, points };
    }
    return null;
  }

  const card = chooseDiscard(state, 'hard', () => 0.5);
  if (!card) return null;
  return { kind: 'discard', action: { type: 'discard', card }, card };
}
