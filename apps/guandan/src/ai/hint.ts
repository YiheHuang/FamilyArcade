import { chooseAiAction } from './ai';
import {
  bestCombo,
  isWild,
  legalPlays,
  partnerOf,
  type Card,
  type Combo,
  type GameState,
  type PlayerAction,
  type Rng,
} from '../game/guandan';

export type HintKind =
  | 'finish'
  | 'partner'
  | 'bomb'
  | 'wild'
  | 'control'
  | 'lead'
  | 'beat'
  | 'pass';

export interface Hint {
  action: PlayerAction;
  cards: Card[];
  combo: Combo | null;
  kind: HintKind;
}

function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic hint from the Hard policy plus a reason derived from the
 * position. Hints are only used in solo and hot-seat.
 */
export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return null;

  let action = chooseAiAction(state, seat, 'hard', seeded(0x9e3779b9));
  if (!action) {
    const fallback = legalPlays(state, seat)[0];
    action = fallback
      ? { type: 'play', cards: fallback.cards.map((card) => card.id) }
      : { type: 'pass' };
  }

  if (action.type === 'pass') {
    if (!state.trick) {
      const fallback = legalPlays(state, seat)[0];
      if (!fallback) return null;
      action = { type: 'play', cards: fallback.cards.map((card) => card.id) };
    } else {
      const partnerWinning = state.trick.seat === partnerOf(seat);
      return { action, cards: [], combo: null, kind: partnerWinning ? 'partner' : 'pass' };
    }
  }

  const played = state.hands[seat].filter((card) =>
    action.type === 'play' ? action.cards.includes(card.id) : false,
  );
  if (played.length === 0) return null;
  const combo = bestCombo(played, state.levelRank, state.trick?.combo ?? null);
  if (!combo) return null;

  if (played.length === state.hands[seat].length) {
    return { action, cards: played, combo, kind: 'finish' };
  }
  if (combo.bomb) {
    return { action, cards: played, combo, kind: 'bomb' };
  }
  if (played.some((card) => isWild(card, state.levelRank))) {
    return { action, cards: played, combo, kind: 'wild' };
  }
  if (state.trick?.seat === partnerOf(seat)) {
    return { action, cards: played, combo, kind: 'partner' };
  }
  if (!state.trick) {
    return { action, cards: played, combo, kind: 'lead' };
  }
  if (combo.rank >= 15) {
    return { action, cards: played, combo, kind: 'control' };
  }
  return { action, cards: played, combo, kind: 'beat' };
}
