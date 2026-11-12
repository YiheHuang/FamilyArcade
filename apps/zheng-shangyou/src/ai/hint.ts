/**
 * A reasoned hint for the local player. The hint always describes a legal
 * action; the UI turns the kind into a one-line reason.
 */
import {
  canBeat,
  legalPlays,
  type Card,
  type GameState,
  type PlayerAction,
} from '../game/zheng-shangyou';

export type HintKind =
  | 'goOut'
  | 'control'
  | 'save'
  | 'lead'
  | 'clubs'
  | 'low'
  | 'beat'
  | 'pass'
  | 'tribute';

export interface Hint {
  kind: HintKind;
  cards: Card[];
  action: PlayerAction;
}

function ids(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id);
}

function sortCheap(cards: Card[][]): Card[][] {
  return cards
    .slice()
    .sort((a, b) => a.length - b.length || a[0].rank - b[0].rank);
}

function opponentNearOut(state: GameState, seat: number): boolean {
  return state.hands.some(
    (hand, other) => other !== seat && hand.length > 0 && hand.length <= 2,
  );
}

export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase === 'tribute') {
    const pair = state.tribute?.pairs.find(
      (item) => item.to === seat && item.returned === null,
    );
    if (!pair) return null;
    const groups = new Map<number, Card[]>();
    for (const card of state.hands[seat] ?? []) {
      const list = groups.get(card.rank) ?? [];
      list.push(card);
      groups.set(card.rank, list);
    }
    const singles = (state.hands[seat] ?? []).filter(
      (card) => (groups.get(card.rank)?.length ?? 0) === 1 && card.id !== 'C3',
    );
    const safe = singles.length
      ? singles
      : (state.hands[seat] ?? []).filter((card) => card.id !== 'C3');
    const pool = safe.length ? safe : (state.hands[seat] ?? []).slice();
    const card = pool.slice().sort((a, b) => a.rank - b.rank)[0];
    if (!card) return null;
    return { kind: 'tribute', cards: [card], action: { type: 'tribute', card: card.id } };
  }

  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.hands[seat].length === 0 || state.finish.includes(seat)) return null;

  const legal = sortCheap(legalPlays(state, seat));
  const combo = legal.find((cards) => cards.length === state.hands[seat].length);
  if (!state.trick && state.mustLeadClubs) {
    const forced = legal.find((cards) => cards.some((card) => card.id === 'C3')) ?? legal[0];
    if (!forced) return null;
    if (forced.length === state.hands[seat].length) {
      return { kind: 'goOut', cards: forced, action: { type: 'play', cards: ids(forced) } };
    }
    return { kind: 'clubs', cards: forced, action: { type: 'play', cards: ids(forced) } };
  }

  if (combo) {
    return { kind: 'goOut', cards: combo, action: { type: 'play', cards: ids(combo) } };
  }

  if (!state.trick) {
    const lead = legal[0];
    if (!lead) return null;
    return { kind: 'lead', cards: lead, action: { type: 'play', cards: ids(lead) } };
  }

  if (legal.length === 0) {
    return { kind: 'pass', cards: [], action: { type: 'pass' } };
  }

  const cheapest = legal[0];
  const near = opponentNearOut(state, seat);
  const bomb = legal.find((cards) => cards.length === 4 && cards.every((card) => card.rank === cards[0].rank));
  const owner = state.trick.seat;
  const ownerCards = state.hands[owner]?.length ?? 0;
  if (bomb && (ownerCards <= 2 || near)) {
    return { kind: 'control', cards: bomb, action: { type: 'play', cards: ids(bomb) } };
  }
  if (cheapest[0].rank >= 15 && !near) {
    return { kind: 'save', cards: [], action: { type: 'pass' } };
  }
  if (cheapest.length === 1 && cheapest[0].rank >= 14 && near) {
    return { kind: 'control', cards: cheapest, action: { type: 'play', cards: ids(cheapest) } };
  }
  if (state.trick.combo.type === 'bomb') {
    const higher = legal.find((cards) => canBeat(
      { type: 'bomb', rank: cards[0].rank, length: 4, cards },
      state.trick?.combo ?? null,
    ));
    if (higher) {
      return { kind: 'control', cards: higher, action: { type: 'play', cards: ids(higher) } };
    }
  }
  return { kind: cheapest[0].rank >= 13 ? 'low' : 'beat', cards: cheapest, action: { type: 'play', cards: ids(cheapest) } };
}
