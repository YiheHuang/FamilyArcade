import { chooseAiAction } from './ai';
import {
  checkPlay,
  classify,
  legalCombos,
  seededRng,
  type Card,
  type GameState,
  type PlayerAction,
} from '../game/big-two';

export type HintKind =
  | 'goOut'
  | 'leadDiamond'
  | 'control'
  | 'endgame'
  | 'safeLead'
  | 'beat'
  | 'lead'
  | 'pass';

export interface Hint {
  action: PlayerAction;
  cards: Card[];
  kind: HintKind;
}

/**
 * A deterministic hint from the Hard policy plus a human-readable reason.
 * Hints never reveal another hand and are only offered in solo/hot-seat.
 */
export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.hands[seat].length === 0) return null;

  let action = chooseAiAction(state, seat, 'hard', seededRng(0x51f15e));
  if (!action) {
    const fallback = legalCombos(state, seat)[0];
    action = fallback
      ? { type: 'play', cards: fallback.cards.map((card) => card.id) }
      : { type: 'pass' };
  }

  if (action.type === 'pass') {
    if (!state.trick) {
      const fallback = legalCombos(state, seat)[0];
      if (!fallback) return null;
      action = { type: 'play', cards: fallback.cards.map((card) => card.id) };
    } else {
      return { action, cards: [], kind: 'pass' };
    }
  }

  const played = state.hands[seat].filter((card) =>
    action.type === 'play' ? action.cards.includes(card.id) : false,
  );
  if (played.length === 0) return null;
  const check = checkPlay(state, seat, played.map((card) => card.id));
  if (!check.ok) return null;

  if (state.mustLeadDiamond && state.trick === null) {
    return { action, cards: played, kind: 'leadDiamond' };
  }
  if (played.length === state.hands[seat].length) {
    return { action, cards: played, kind: 'goOut' };
  }
  if (!state.trick) {
    const combo = classify(played);
    const danger = state.hands.some(
      (hand, index) => index !== seat && hand.length <= 2,
    );
    if (danger && (combo?.size ?? 0) >= 2) {
      return { action, cards: played, kind: 'endgame' };
    }
    if ((combo?.size ?? 0) >= 2 || (combo?.rank ?? 15) <= 9) {
      return { action, cards: played, kind: 'safeLead' };
    }
    return { action, cards: played, kind: 'lead' };
  }
  if (played[0].rank >= 14) return { action, cards: played, kind: 'control' };
  return { action, cards: played, kind: 'beat' };
}
