import {
  act,
  COLORS,
  drawAvailable,
  fullDeck,
  handPoints,
  isWild,
  legalCards,
  nextSeat,
  shuffle,
  topCard,
  type AiLevel,
  type Card,
  type Color,
  type GameState,
  type Move,
  type Rng,
} from '../game/color-chain';

export type { AiLevel } from '../game/color-chain';

export type HintReason =
  | 'finish'
  | 'attack'
  | 'wild'
  | 'matchColor'
  | 'matchNumber'
  | 'matchSymbol'
  | 'action'
  | 'draw'
  | 'pass';

export interface Hint {
  move: Move;
  cardId: string | null;
  reason: HintReason;
}

function handOf(state: GameState, seat: number): Card[] {
  return state.players[seat]?.hand ?? [];
}

function isAttack(card: Card): boolean {
  return card.kind === 'draw2' || card.kind === 'wild4';
}

/** A gentle Companion avoids piling draw penalties onto a human with few cards. */
function gentleTarget(state: GameState, seat: number): boolean {
  const target = nextSeat(state, seat, 1);
  const player = state.players[target];
  return Boolean(player && player.ai === null && player.hand.length <= 3);
}

function colorCounts(state: GameState, seat: number): Record<Color, number> {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of handOf(state, seat)) {
    if (card.color !== 'wild') counts[card.color] += 1;
  }
  return counts;
}

function majorityColor(state: GameState, seat: number, rng: Rng): Color {
  const counts = colorCounts(state, seat);
  const high = Math.max(...COLORS.map((color) => counts[color]));
  const tied = COLORS.filter((color) => counts[color] === high);
  return tied[Math.floor(rng() * tied.length)] ?? COLORS[0];
}

function chooseColor(state: GameState, seat: number, level: AiLevel, rng: Rng): Color {
  if (level === 'easy') return COLORS[Math.floor(rng() * COLORS.length)] ?? COLORS[0];
  return majorityColor(state, seat, rng);
}

function makePlay(state: GameState, seat: number, card: Card, level: AiLevel, rng: Rng): Move {
  if (isWild(card)) {
    return { type: 'play', cardId: card.id, color: chooseColor(state, seat, level, rng) };
  }
  return { type: 'play', cardId: card.id };
}

/** Heuristic value of a play, used by Normal and to shortlist Hard's samples. */
function playScore(state: GameState, seat: number, card: Card): number {
  const hand = handOf(state, seat);
  if (hand.length === 1) return 10000;
  const n = state.players.length;
  const target = nextSeat(state, seat, 1);
  const targetCards = state.players[target]?.hand.length ?? 7;
  const nonWildPlayable = legalCards(state, seat).some((item) => !isWild(item));
  let score = 0;
  switch (card.kind) {
    case 'number':
      score = 16 + (card.value ?? 0) * 0.2;
      break;
    case 'skip':
      score = 30 + (n === 2 ? 18 : 0) + (targetCards <= 2 ? 18 : 0);
      break;
    case 'reverse':
      score = 24 + (n === 2 ? 16 : 0) + (targetCards <= 2 ? 10 : 0);
      break;
    case 'draw2':
      score = 40 + (targetCards <= 2 ? 30 : 0) + (targetCards <= 1 ? 15 : 0);
      break;
    case 'wild':
      score = 6;
      break;
    case 'wild4':
      score = 48 + (targetCards <= 2 ? 35 : 0) + (targetCards <= 1 ? 15 : 0);
      break;
  }
  if (card.color !== 'wild') {
    score += hand.filter((item) => item.color === card.color).length * 1.4;
  }
  if (isWild(card) && nonWildPlayable) score -= card.kind === 'wild4' ? 34 : 20;
  return score;
}

function companionScore(state: GameState, seat: number, card: Card): number {
  const hand = handOf(state, seat);
  if (hand.length === 1) return 10000;
  const gentle = gentleTarget(state, seat);
  switch (card.kind) {
    case 'number':
      return 20;
    case 'skip':
      return 16;
    case 'reverse':
      return 14;
    case 'draw2':
      return gentle ? -30 : 11;
    case 'wild':
      return hand.length > 2 ? 8 : 18;
    case 'wild4':
      return gentle ? -50 : 9;
  }
  return 0;
}

/* ------------------------------------------------------------ hard samples */

function sampleHidden(state: GameState, hero: number, rng: Rng): GameState {
  const known = new Set<string>();
  for (const card of state.discard) known.add(card.id);
  for (const card of state.players[hero].hand) known.add(card.id);
  const unseen = shuffle(
    fullDeck().filter((card) => !known.has(card.id)),
    rng,
  );
  const counts = state.players.map((player, seat) => (seat === hero ? 0 : player.hand.length));
  let cursor = 0;
  const players = state.players.map((player, seat) => {
    if (seat === hero) return player;
    const hand = unseen.slice(cursor, cursor + counts[seat]);
    cursor += counts[seat];
    return { ...player, hand };
  });
  return { ...state, players, drawPile: unseen.slice(cursor) };
}

function playout(state: GameState, hero: number, rng: Rng): number {
  let current = state;
  for (let step = 0; step < 90; step++) {
    if (current.status !== 'playing') break;
    const seat = current.turn;
    const cards = legalCards(current, seat);
    let move: Move;
    if (cards.length > 0) {
      let card = cards[Math.floor(rng() * cards.length)];
      if (cards.length > 1 && isWild(card) && current.players[seat].hand.length > 1) {
        const plain = cards.filter((item) => !isWild(item));
        if (plain.length > 0 && rng() < 0.65) {
          card = plain[Math.floor(rng() * plain.length)];
        }
      }
      move = isWild(card)
        ? { type: 'play', cardId: card.id, color: COLORS[Math.floor(rng() * COLORS.length)] }
        : { type: 'play', cardId: card.id };
    } else if (!current.drawnCardId && drawAvailable(current)) {
      move = { type: 'draw' };
    } else {
      move = { type: 'pass' };
    }
    const result = act(current, seat, move, rng);
    if (!result.ok) break;
    current = result.state;
  }
  if (current.roundWinner !== null) {
    const added = current.roundPoints?.[hero] ?? 0;
    return (current.roundWinner === hero ? 100 : 0) - added;
  }
  const myPoints = handPoints(current.players[hero].hand);
  const fewest = Math.min(...current.players.map((player) => player.hand.length));
  return (current.players[hero].hand.length === fewest ? 8 : 0) - myPoints * 0.55;
}

function evaluateMove(state: GameState, seat: number, move: Move, rng: Rng): number {
  const samples = 8;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const result = act(state, seat, move, rng);
    if (!result.ok) return -100000;
    total += playout(sampleHidden(result.state, seat, rng), seat, rng);
  }
  return total / samples;
}

function hardCandidates(state: GameState, seat: number): { move: Move; card: Card | null }[] {
  const candidates: { move: Move; card: Card | null }[] = [];
  for (const card of legalCards(state, seat)) {
    if (isWild(card)) {
      const counts = colorCounts(state, seat);
      const ranked = [...COLORS].sort((a, b) => counts[b] - counts[a]);
      const top = counts[ranked[0]];
      const colors = ranked.filter((color) => counts[color] === top);
      const extra = ranked.find((color) => !colors.includes(color));
      if (extra) colors.push(extra);
      for (const color of colors.slice(0, 3)) {
        candidates.push({ move: { type: 'play', cardId: card.id, color }, card });
      }
    } else {
      candidates.push({ move: { type: 'play', cardId: card.id }, card });
    }
  }
  let shortlist = candidates;
  if (shortlist.length > 8) {
    shortlist = [...shortlist]
      .sort((a, b) => (b.card ? playScore(state, seat, b.card) : 0) - (a.card ? playScore(state, seat, a.card) : 0))
      .slice(0, 8);
  }
  const result = [...shortlist];
  if (!state.drawnCardId && drawAvailable(state)) {
    result.push({ move: { type: 'draw' }, card: null });
  }
  if (state.drawnCardId || !drawAvailable(state)) {
    result.push({ move: { type: 'pass' }, card: null });
  }
  return result;
}

function bestHard(state: GameState, seat: number, rng: Rng): Move {
  const candidates = hardCandidates(state, seat);
  if (candidates.length === 0) return { type: 'pass' };
  let best = candidates[0].move;
  let bestValue = -Infinity;
  for (const candidate of candidates) {
    const value = evaluateMove(state, seat, candidate.move, rng);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = candidate.move;
    }
  }
  return best;
}

/* ----------------------------------------------------------------- public */

export function chooseAction(state: GameState, seat: number, level: AiLevel, rng: Rng): Move {
  if (state.status !== 'playing' || state.turn !== seat) return { type: 'pass' };
  const cards = legalCards(state, seat);
  if (cards.length === 0) {
    if (!state.drawnCardId && drawAvailable(state)) return { type: 'draw' };
    return { type: 'pass' };
  }

  if (state.drawnCardId) {
    const card = cards[0];
    if (level === 'easy') {
      return rng() < 0.72 ? makePlay(state, seat, card, level, rng) : { type: 'pass' };
    }
    if (level === 'companion') {
      if (isAttack(card) && gentleTarget(state, seat) && handOf(state, seat).length > 1) {
        return { type: 'pass' };
      }
      return makePlay(state, seat, card, level, rng);
    }
    if (level === 'normal') {
      if (isWild(card) && handOf(state, seat).length > 1 && playScore(state, seat, card) < 12) {
        return { type: 'pass' };
      }
      return makePlay(state, seat, card, level, rng);
    }
    return bestHard(state, seat, rng);
  }

  if (level === 'easy') {
    if (rng() < 0.22 && drawAvailable(state)) return { type: 'draw' };
    const card = cards[Math.floor(rng() * cards.length)];
    return makePlay(state, seat, card, level, rng);
  }

  if (level === 'companion') {
    if (gentleTarget(state, seat) && drawAvailable(state) && cards.every(isAttack)) {
      return { type: 'draw' };
    }
    const ranked = [...cards].sort(
      (a, b) => companionScore(state, seat, b) - companionScore(state, seat, a),
    );
    return makePlay(state, seat, ranked[0], level, rng);
  }

  if (level === 'normal') {
    const ranked = [...cards].sort(
      (a, b) => playScore(state, seat, b) - playScore(state, seat, a),
    );
    return makePlay(state, seat, ranked[0], level, rng);
  }

  return bestHard(state, seat, rng);
}

export function hintFor(state: GameState, seat: number, rng: Rng): Hint {
  let move = chooseAction(state, seat, 'hard', rng);
  const cards = legalCards(state, seat);
  // A hint should point at a card when one fits; only suggest a draw when the hand has no play.
  if (cards.length > 0 && move.type !== 'play') {
    move = chooseAction(state, seat, 'normal', rng);
  }
  if (move.type === 'draw') return { move, cardId: null, reason: 'draw' };
  if (move.type === 'pass') return { move, cardId: null, reason: 'pass' };
  const card = handOf(state, seat).find((item) => item.id === move.cardId) ?? null;
  if (!card) return { move, cardId: null, reason: 'pass' };
  let reason: HintReason;
  if (handOf(state, seat).length === 1) reason = 'finish';
  else if (isAttack(card)) reason = 'attack';
  else if (isWild(card)) reason = 'wild';
  else if (card.kind !== 'number') reason = 'action';
  else if (card.color === state.current) reason = 'matchColor';
  else {
    const top = topCard(state);
    reason =
      top.kind === 'number' && top.value === card.value ? 'matchNumber' : 'matchSymbol';
  }
  return { move, cardId: card.id, reason };
}
