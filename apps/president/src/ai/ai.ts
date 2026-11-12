/**
 * Four President opponents. Every level is deterministic with an injected RNG
 * and sees only its own hand, public finish counts and cards already played.
 * Hard samples the unseen cards and rolls the round forward; it never reads
 * another player's real hand.
 */
import {
  DECK,
  groupByRank,
  legalPlays,
  pass,
  play,
  type Card,
  type GameState,
  type PlayerAction,
  type Rng,
} from '../game/president';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

function ids(cards: Card[]): string[] {
  return cards.map((card) => card.id);
}

function positionScore(state: GameState, me: number): number {
  if (state.phase === 'round-over' && state.order) {
    const place = state.order.indexOf(me);
    if (place >= 0) {
      return (state.playerCount - place) * 1000 + (place === 0 ? 600 : 0);
    }
  }
  if (state.finish.includes(me)) {
    const place = state.finish.indexOf(me);
    return (state.playerCount - place) * 800;
  }
  const hand = state.hands[me];
  const groups = groupByRank(hand);
  let score = -hand.length * 7;
  for (const group of groups) {
    const size = group.cards.length;
    const rank = group.rank;
    const control = rank === 15 ? 34 : rank === 14 ? 20 : rank === 13 ? 10 : 2;
    score += control * size;
    if (size >= 2) score += 4;
    if (size >= 3) score += 7;
    score -= Math.ceil(size / 3) * 5;
  }
  if (state.trick && state.trick.seat === me) score += 14;
  const next = state.turn;
  if (next !== me && state.hands[next]?.length === 1) score -= 12;
  if (next !== me && state.hands[next]?.length === 2) score -= 6;
  return score;
}

function afterPlayScore(state: GameState, me: number, played: Card[], before: GameState): number {
  if (state.phase === 'round-over') return positionScore(state, me) + 10000;
  let score = positionScore(state, me);
  const rank = played[0].rank;
  if (rank === 15 && state.hands[me].length > 2) score -= 24;
  else if (rank === 14 && state.hands[me].length > 3) score -= 11;
  const group = before.hands[me].filter((card) => card.rank === rank).length;
  if (group > played.length && played.length < 3) score -= 4;
  return score;
}

function passScore(state: GameState, me: number): number {
  let score = positionScore(state, me);
  if (!state.trick) score -= 9;
  const next = state.turn;
  if (next !== me && state.hands[next]?.length <= 2) score -= 14;
  if (state.last?.kind === 'pass' && state.trick) score -= 2;
  return score;
}

function chooseLowest(candidates: Card[][], rng: Rng): Card[] {
  if (candidates.length === 1) return candidates[0];
  const best = Math.min(...candidates.map((cards) => cards[0].rank));
  const low = candidates.filter((cards) => cards[0].rank === best);
  return low[Math.floor(rng() * low.length)] ?? low[0];
}

function sampleHidden(state: GameState, me: number, rng: Rng): GameState {
  const mine = new Set(state.hands[me].map((card) => card.id));
  const seen = new Set(state.discard.map((card) => card.id));
  const unseen = DECK.filter((card) => !mine.has(card.id) && !seen.has(card.id));
  for (let i = unseen.length - 1; i > 0; i -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const j = Math.floor(value * (i + 1));
    const swap = unseen[i];
    unseen[i] = unseen[j];
    unseen[j] = swap;
  }
  const hands = state.hands.map((hand) => hand.slice());
  let cursor = 0;
  for (let seat = 0; seat < state.playerCount; seat += 1) {
    if (seat === me) continue;
    const count = state.hands[seat].length;
    const drawn = unseen.slice(cursor, cursor + count);
    cursor += count;
    hands[seat] = drawn;
  }
  return { ...state, hands };
}

function rollout(state: GameState, rng: Rng): GameState {
  let current = state;
  for (let step = 0; step < 420 && current.phase === 'playing'; step += 1) {
    const legal = legalPlays(current, current.turn);
    if (legal.length > 0) {
      const cards = chooseLowest(legal, rng);
      const result = play(current, current.turn, ids(cards));
      if (!result.ok) break;
      current = result.state;
    } else if (current.trick) {
      const result = pass(current, current.turn);
      if (!result.ok) break;
      current = result.state;
    } else {
      break;
    }
  }
  if (current.phase === 'round-over') return current;
  return current;
}

function hardAction(state: GameState, seat: number, rng: Rng, candidates: Card[][]): PlayerAction {
  const options: { action: PlayerAction; cards: Card[] }[] = candidates.map((cards) => ({
    action: { type: 'play', cards: ids(cards) },
    cards,
  }));
  if (state.trick) options.push({ action: { type: 'pass' }, cards: [] });

  let bestScore = -Infinity;
  let bestOptions: PlayerAction[] = [];
  for (const option of options) {
    const applied =
      option.action.type === 'play'
        ? play(state, seat, option.action.cards)
        : pass(state, seat);
    if (!applied.ok) continue;
    if (applied.state.phase === 'round-over') {
      const value = positionScore(applied.state, seat) + 20000;
      if (value > bestScore) {
        bestScore = value;
        bestOptions = [option.action];
      }
      continue;
    }
    let total = 0;
    const samples = 2;
    for (let sample = 0; sample < samples; sample += 1) {
      const hidden = sampleHidden(applied.state, seat, rng);
      const finished = rollout(hidden, rng);
      total += positionScore(finished, seat);
    }
    let value = total / samples;
    if (option.action.type === 'play') {
      value += afterPlayScore(applied.state, seat, option.cards, state) / 60;
    } else {
      value += passScore(applied.state, seat) / 60;
    }
    if (value > bestScore + 1e-9) {
      bestScore = value;
      bestOptions = [option.action];
    } else if (Math.abs(value - bestScore) < 1e-9) {
      bestOptions.push(option.action);
    }
  }
  if (bestOptions.length === 0) {
    return candidates[0] ? { type: 'play', cards: ids(candidates[0]) } : { type: 'pass' };
  }
  return bestOptions[Math.floor(rng() * bestOptions.length)] ?? bestOptions[0];
}

function heuristicAction(
  state: GameState,
  seat: number,
  level: 'companion' | 'normal',
  rng: Rng,
  candidates: Card[][],
): PlayerAction {
  const options: { action: PlayerAction; score: number }[] = candidates.map((cards) => {
    const applied = play(state, seat, ids(cards));
    const after = applied.state;
    let score = applied.ok
      ? afterPlayScore(after, seat, cards, state)
      : -Infinity;
    if (level === 'companion') {
      score -= cards[0].rank * 7;
      if (cards[0].rank === 15) score -= 120;
      if (cards.length >= 2) score += 4;
      if (applied.ok && after.phase === 'round-over') score += 4000;
    }
    return { action: { type: 'play', cards: ids(cards) }, score };
  });

  if (state.trick) {
    const applied = pass(state, seat);
    if (applied.ok) options.push({ action: { type: 'pass' }, score: passScore(applied.state, seat) });
  }

  const best = Math.max(...options.map((item) => item.score));
  const top = options.filter((item) => item.score >= best - 1e-9);
  const choice = top[Math.floor(rng() * top.length)] ?? top[0];
  return choice.action;
}

export function chooseAiAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return null;
  const candidates = legalPlays(state, seat);
  const canPass = state.trick !== null;

  if (candidates.length === 0) return canPass ? { type: 'pass' } : null;

  const goesOut = candidates.some((cards) => cards.length === state.hands[seat].length);
  if (goesOut) {
    const winner = candidates.find((cards) => cards.length === state.hands[seat].length);
    if (winner) return { type: 'play', cards: ids(winner) };
  }

  if (level === 'easy') {
    if (canPass && rng() < 0.24) return { type: 'pass' };
    if (rng() < 0.58) {
      return { type: 'play', cards: ids(candidates[0]) };
    }
    const pick = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
    return { type: 'play', cards: ids(pick) };
  }

  if (level === 'companion') {
    // Let a child with one or two cards keep the lead instead of stomping a 2 on them.
    const human = state.hands[0]?.length ?? 0;
    if (
      canPass &&
      seat !== 0 &&
      human > 0 &&
      human <= 2 &&
      candidates.every((cards) => cards[0].rank >= 14)
    ) {
      return { type: 'pass' };
    }
    if (canPass && rng() < 0.16) return { type: 'pass' };
    return heuristicAction(state, seat, 'companion', rng, candidates);
  }

  if (level === 'normal') {
    if (rng() < 0.07) {
      const pick = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
      return { type: 'play', cards: ids(pick) };
    }
    return heuristicAction(state, seat, 'normal', rng, candidates);
  }

  return hardAction(state, seat, rng, candidates);
}

/** A simple legal action for a seat whose guest has dropped off the LAN. */
export function fallbackAction(state: GameState, seat: number): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const candidates = legalPlays(state, seat);
  if (candidates.length > 0) return { type: 'play', cards: ids(candidates[0]) };
  if (state.trick) return { type: 'pass' };
  return null;
}

export function handPlan(cards: Card[]): number {
  return groupByRank(cards).reduce((total, group) => total + Math.ceil(group.cards.length / 3), 0);
}
