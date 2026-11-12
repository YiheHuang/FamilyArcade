import {
  cardValue,
  makeRng,
  pegPlayScore,
  rankOf,
  type Card,
  type GameState,
} from '../game/cribbage';
import { chooseDiscard, choosePlay, rankDiscards } from './ai';

export type HintKind =
  | 'keepRun'
  | 'keepPair'
  | 'keepFifteen'
  | 'cribSafe'
  | 'pegThirtyOne'
  | 'pegFifteen'
  | 'pegPair'
  | 'pegRun'
  | 'pegLow'
  | 'pegSafe'
  | 'cut';

export interface Hint {
  action: 'discard' | 'play' | 'cut';
  cards?: Card[];
  card?: Card;
  reason: HintKind;
  value?: number;
}

function hasRun(cards: Card[]): boolean {
  const ranks = [...new Set(cards.map(rankOf))].sort((a, b) => a - b);
  let streak = 1;
  for (let index = 1; index < ranks.length; index += 1) {
    streak = ranks[index] === ranks[index - 1] + 1 ? streak + 1 : 1;
    if (streak >= 3) return true;
  }
  return false;
}

function hasFifteen(cards: Card[]): boolean {
  const subsets = 1 << cards.length;
  for (let mask = 1; mask < subsets; mask += 1) {
    let sum = 0;
    for (let index = 0; index < cards.length; index += 1) {
      if (mask & (1 << index)) sum += cardValue(cards[index]);
    }
    if (sum === 15) return true;
  }
  return false;
}

function hasPair(cards: Card[]): boolean {
  const ranks = new Map<number, number>();
  for (const card of cards) {
    const rank = rankOf(card);
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
  }
  return [...ranks.values()].some((amount) => amount >= 2);
}

export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase === 'cut' && state.turn === seat) {
    return { action: 'cut', reason: 'cut' };
  }

  if (state.phase === 'discard' && state.turn === seat) {
    const choices = rankDiscards(state, seat);
    if (choices.length === 0) return null;
    const best = choices[0];
    const cards = chooseDiscard(state, seat, 'hard', makeRng(7));
    if (cards.length === 0) return null;
    const reason = hasRun(best.keep)
      ? 'keepRun'
      : hasPair(best.keep)
        ? 'keepPair'
        : hasFifteen(best.keep)
          ? 'keepFifteen'
          : 'cribSafe';
    return {
      action: 'discard',
      cards,
      reason,
      value: Math.round(best.keepEv * 10) / 10,
    };
  }

  if (state.phase === 'pegging' && state.turn === seat) {
    const card = choosePlay(state, seat, 'hard', makeRng(11));
    if (card === null) return null;
    const peg = pegPlayScore(state.sequence, state.count, card);
    const kinds = new Set(peg.parts.map((part) => part.kind));
    if (kinds.has('thirtyone')) {
      return { action: 'play', card, reason: 'pegThirtyOne', value: peg.points };
    }
    if (kinds.has('fifteen')) {
      return { action: 'play', card, reason: 'pegFifteen', value: peg.points };
    }
    if (kinds.has('pair')) {
      return { action: 'play', card, reason: 'pegPair', value: peg.points };
    }
    if (kinds.has('run')) {
      return { action: 'play', card, reason: 'pegRun', value: peg.points };
    }
    return {
      action: 'play',
      card,
      reason: cardValue(card) <= 4 ? 'pegLow' : 'pegSafe',
      value: 0,
    };
  }

  return null;
}
