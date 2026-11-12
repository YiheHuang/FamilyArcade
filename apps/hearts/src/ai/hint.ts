import { chooseMove, choosePass } from './ai';
import {
  QUEEN_SPADES,
  cardPoints,
  rankOf,
  suitOf,
  type Card,
  type GameState,
} from '../game/hearts';

export type HintKind =
  | 'pass'
  | 'moon'
  | 'blockMoon'
  | 'queen'
  | 'void'
  | 'lead'
  | 'take'
  | 'duck';

export interface Hint {
  card?: Card;
  cards?: Card[];
  kind: HintKind;
  threat?: number;
}

function winsNow(state: GameState, card: Card): boolean {
  if (state.trick.length === 0) return false;
  const lead = suitOf(state.trick[0].card);
  if (suitOf(card) !== lead) return false;
  const rank = rankOf(card);
  return state.trick.every((item) => suitOf(item.card) !== lead || rankOf(item.card) < rank);
}

/**
 * A deterministic, explainable hint. The card comes from the Hard search; the
 * reason is read from the public table so the panel can explain the choice.
 */
export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase === 'passing') {
    const cards = choosePass(state, seat, 'hard', () => 0.5);
    return cards.length === 3 ? { cards, kind: 'pass' } : null;
  }
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const card = chooseMove(state, seat, 'hard', () => 0.5);
  if (card < 0) return null;
  if (state.handPoints[seat] >= 20) return { card, kind: 'moon' };

  let threat: number | undefined;
  let best = 20;
  for (let index = 0; index < 4; index += 1) {
    if (index !== seat && state.handPoints[index] > best) {
      best = state.handPoints[index];
      threat = index;
    }
  }
  if (threat !== undefined) return { card, kind: 'blockMoon', threat };
  if (card === QUEEN_SPADES) return { card, kind: 'queen' };
  if (state.trick.length > 0 && suitOf(card) !== suitOf(state.trick[0].card)) {
    return { card, kind: 'void' };
  }
  if (state.trick.length === 0) return { card, kind: 'lead' };
  if (winsNow(state, card) && state.trick.some((item) => cardPoints(item.card) > 0)) {
    return { card, kind: 'take' };
  }
  return { card, kind: 'duck' };
}
