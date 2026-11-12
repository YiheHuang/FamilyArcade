import {
  applyAction,
  canTakeDiscard,
  cardValue,
  handValue,
  legalLayoffActions,
  legalMeldActions,
  meldAcceptsCard,
  meldPointsFor,
  rankOf,
  rankValue,
  suitOf,
  type Card,
  type GameAction,
  type GameState,
} from '../game/rummy-500';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;
type Candidate = GameAction;

function pick<T>(items: T[], rng: Rng): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function handPotential(hand: Card[]): number {
  let score = 0;
  for (let a = 0; a < hand.length; a += 1) {
    for (let b = a + 1; b < hand.length; b += 1) {
      const first = hand[a];
      const second = hand[b];
      if (rankOf(first) === rankOf(second)) {
        score += 7;
      } else if (suitOf(first) === suitOf(second)) {
        const gap = Math.abs(rankValue(rankOf(first)) - rankValue(rankOf(second)));
        if (gap === 1) score += 4;
        else if (gap === 2) score += 2;
      }
    }
  }
  return score;
}

export function actionPoints(state: GameState, action: GameAction): number {
  const seat = state.turn;
  const before = meldPointsFor(state, seat);
  const result = applyAction(state, action);
  if (!result.ok) return -Infinity;
  return meldPointsFor(result.state, seat) - before;
}

function actionValue(state: GameState, action: GameAction): number {
  const seat = state.turn;
  const result = applyAction(state, action);
  if (!result.ok) return -Infinity;
  const next = result.state;
  const delta = meldPointsFor(next, seat) - meldPointsFor(state, seat);
  const hand = next.players[seat]?.hand ?? [];
  const emptyBonus = hand.length === 0 ? 1000 : 0;
  const clearBonus = next.mustMeld === null ? 6 : 0;
  return delta + handPotential(hand) * 0.25 + emptyBonus + clearBonus;
}

function forcedActions(state: GameState): Candidate[] {
  const melds = legalMeldActions(state);
  const layoffs = legalLayoffActions(state);
  if (!state.mustMeld) return [...melds, ...layoffs];
  return [
    ...melds.filter((action) => action.cards.includes(state.mustMeld as Card)),
    ...layoffs.filter((action) => action.card === state.mustMeld),
  ];
}

function bestAction(state: GameState, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let bestValue = -Infinity;
  for (const action of candidates) {
    const value = actionValue(state, action);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

export function bestMeldAction(
  state: GameState,
  level: AiLevel = 'hard',
  rng: Rng = () => 0.5,
): Candidate | null {
  const candidates = forcedActions(state);
  if (candidates.length === 0) return null;
  if (state.mustMeld) return bestAction(state, candidates);
  if (level === 'companion' && rng() < 0.35) return null;
  if (level === 'easy' && rng() < 0.4) return pick(candidates, rng);
  if (level === 'normal' && rng() < 0.1) return pick(candidates, rng);
  return bestAction(state, candidates);
}

function discardKeepValue(state: GameState, card: Card, meldCards: Set<Card>): number {
  const hand = state.players[state.turn].hand;
  const rank = rankOf(card);
  const suit = suitOf(card);
  let keep = 0;

  const sameRank = hand.filter((item) => item !== card && rankOf(item) === rank);
  if (sameRank.length >= 2) keep += 26;
  else if (sameRank.length === 1) keep += 13;

  for (const item of hand) {
    if (item === card || suitOf(item) !== suit) continue;
    const gap = Math.abs(rankValue(rankOf(item)) - rankValue(rank));
    if (gap === 1) keep += 10;
    else if (gap === 2) keep += 5;
  }

  if (meldCards.has(card)) keep += 30;
  if (state.melds.some((meld) => meldAcceptsCard(meld, card))) keep += 18;
  keep -= cardValue(card) * 0.55;
  return keep;
}

export function chooseDiscard(
  state: GameState,
  level: AiLevel = 'hard',
  rng: Rng = () => 0.5,
): Card | null {
  if (state.phase !== 'meld' || state.mustMeld) return null;
  const hand = state.players[state.turn].hand;
  if (hand.length === 0) return null;

  const meldCards = new Set(legalMeldActions(state).flatMap((action) => action.cards));
  const ranked = hand
    .map((card) => ({ card, value: discardKeepValue(state, card, meldCards) }))
    .sort((a, b) => a.value - b.value || cardValue(a.card) - cardValue(b.card));

  if (level === 'easy') {
    if (rng() < 0.45) return pick(hand, rng);
    return ranked[0].card;
  }
  if (level === 'companion') {
    if (rng() < 0.5) return pick(hand, rng);
    return ranked[0].card;
  }
  if (level === 'normal' && rng() < 0.12) return pick(hand, rng);
  return ranked[0].card;
}

function takeDiscardValue(state: GameState, index: number): number {
  const seat = state.turn;
  const taken = applyAction(state, { type: 'take-discard', index });
  if (!taken.ok) return -Infinity;
  const forced = forcedActions(taken.state);
  if (forced.length === 0) return -Infinity;
  const play = bestAction(taken.state, forced);
  if (!play) return -Infinity;
  const after = applyAction(taken.state, play);
  if (!after.ok) return -Infinity;
  const next = after.state;
  const delta = meldPointsFor(next, seat) - meldPointsFor(state, seat);
  const above = (taken.state.drawn?.taken ?? []).slice(1);
  const extraCost = handValue(above) * 0.35;
  const emptyBonus = next.players[seat].hand.length === 0 ? 1000 : 0;
  return delta + handPotential(next.players[seat].hand) * 0.25 - extraCost + emptyBonus;
}

function chooseDraw(state: GameState, level: AiLevel, rng: Rng): GameAction {
  const indexes = state.discard
    .map((_, index) => index)
    .filter((index) => canTakeDiscard(state, index));
  const stockValue = handPotential(state.players[state.turn].hand) + 4;
  const ranked = indexes
    .map((index) => ({ index, value: takeDiscardValue(state, index) }))
    .sort((a, b) => b.value - a.value);

  if (state.stock.length === 0) {
    if (ranked.length === 0) return { type: 'draw-stock' };
    if (level === 'easy' || level === 'companion') return { type: 'take-discard', index: pick(ranked, rng).index };
    return { type: 'take-discard', index: ranked[0].index };
  }

  if (level === 'easy') {
    if (ranked.length > 0 && rng() < 0.35) return { type: 'take-discard', index: pick(ranked, rng).index };
    return { type: 'draw-stock' };
  }
  if (level === 'companion') {
    const top = state.discard.length - 1;
    if (top >= 0 && indexes.includes(top) && rng() < 0.55) {
      return { type: 'take-discard', index: top };
    }
    return { type: 'draw-stock' };
  }
  if (ranked.length === 0) return { type: 'draw-stock' };
  const margin = level === 'hard' ? 8 : 2;
  if (ranked[0].value > stockValue + margin) {
    return { type: 'take-discard', index: ranked[0].index };
  }
  return { type: 'draw-stock' };
}

export function chooseAiAction(
  state: GameState,
  level: AiLevel,
  rng: Rng = () => 0.5,
): GameAction | null {
  if (state.phase === 'draw') return chooseDraw(state, level, rng);
  if (state.phase !== 'meld') return null;

  if (state.mustMeld) {
    return bestAction(state, forcedActions(state));
  }

  const meld = bestMeldAction(state, level, rng);
  if (meld) return meld;

  const discard = chooseDiscard(state, level, rng);
  if (!discard) return null;
  return { type: 'discard', card: discard };
}

/**
 * Play one full seat turn. Stops when the turn passes or the hand ends, so the
 * caller can keep the UI responsive and record one undo snapshot per seat turn.
 */
export function runAiTurn(state: GameState, level: AiLevel, rng: Rng = () => 0.5): GameState {
  if (state.phase !== 'draw' && state.phase !== 'meld') return state;
  const seat = state.turn;
  let current = state;
  for (let step = 0; step < 80; step += 1) {
    const action = chooseAiAction(current, level, rng);
    if (!action) break;
    const result = applyAction(current, action);
    if (!result.ok) break;
    current = result.state;
    if (current.phase !== 'draw' && current.phase !== 'meld') break;
    if (current.turn !== seat) break;
  }
  return current;
}
