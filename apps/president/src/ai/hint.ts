import { chooseAiAction } from './ai';
import {
  checkPlay,
  legalPlays,
  type Card,
  type GameState,
  type PlayerAction,
  type Rng,
} from '../game/president';

export type HintKind = 'goOut' | 'control' | 'save' | 'lead' | 'clubs' | 'low' | 'beat' | 'pass';

export interface Hint {
  action: PlayerAction;
  cards: Card[];
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
 * A deterministic hint from the Hard policy, plus a reason derived from the
 * position. Hints never reveal another hand and are only used in solo/hot-seat.
 */
export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return null;

  let action = chooseAiAction(state, seat, 'hard', seeded(0x51f15e));
  if (!action) {
    const fallback = legalPlays(state, seat)[0];
    action = fallback
      ? { type: 'play', cards: fallback.map((card) => card.id) }
      : { type: 'pass' };
  }

  if (action.type === 'pass') {
    if (!state.trick) {
      const fallback = legalPlays(state, seat)[0];
      if (!fallback) return null;
      action = { type: 'play', cards: fallback.map((card) => card.id) };
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

  if (state.mustLeadClubs && state.trick === null) {
    return { action, cards: played, kind: 'clubs' };
  }
  if (played.length === state.hands[seat].length) {
    return { action, cards: played, kind: 'goOut' };
  }
  if (played[0].rank === 15) return { action, cards: played, kind: 'control' };
  if (!state.trick) return { action, cards: played, kind: 'lead' };
  if (played[0].rank <= 10) return { action, cards: played, kind: 'low' };
  return { action, cards: played, kind: 'beat' };
}
