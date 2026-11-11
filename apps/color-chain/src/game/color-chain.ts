/**
 * Color Chain — a pure, deterministic colour-and-number shedding engine.
 *
 * No DOM, clock, network or `Math.random` here. Every shuffle takes an injected
 * RNG. Rules are documented in docs/rules.md and audited by tests/engine.test.ts.
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];
export type CardColor = Color | 'wild';
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type Rng = () => number;

export interface Card {
  /** Unique, stable id. Also used as the intent payload for LAN play. */
  id: string;
  color: CardColor;
  kind: CardKind;
  /** 0–9 for number cards, null for every action card. */
  value: number | null;
}

export interface Player {
  name: string;
  hand: Card[];
  score: number;
  /** null means a human seat; a level means that seat is played by the AI. */
  ai: AiLevel | null;
}

export type GameStatus = 'playing' | 'round-over' | 'match-over';

export type GameEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'play'; seat: number; card: Card; color?: Color }
  | { t: 'draw'; seat: number }
  | { t: 'skip'; seat: number; target: number }
  | { t: 'reverse'; seat: number }
  | { t: 'drawPenalty'; seat: number; target: number; count: number }
  | { t: 'pass'; seat: number }
  | { t: 'roundEnd'; winner: number; points: number[] }
  | { t: 'matchEnd'; winners: number[] };

export interface GameState {
  players: Player[];
  turn: number;
  direction: 1 | -1;
  /** Colour that must be matched right now (wild cards set this). */
  current: Color;
  drawPile: Card[];
  /** Public discard pile; the last item is the face-up top card. */
  discard: Card[];
  status: GameStatus;
  round: number;
  roundWinner: number | null;
  /** Points added to each player in the round that just ended. */
  roundPoints: number[] | null;
  matchWinners: number[];
  targetScore: number;
  /** Set after a draw: only this card may be played (or the player may pass). */
  drawnCardId: string | null;
  events: GameEvent[];
  /** Seat that opened the round; rotates each round. */
  firstSeat: number;
}

export type Move =
  | { type: 'play'; cardId: string; color?: Color }
  | { type: 'draw' }
  | { type: 'pass' };

export type MoveError =
  | 'game-over'
  | 'wrong-turn'
  | 'bad-seat'
  | 'bad-move'
  | 'not-in-hand'
  | 'illegal-card'
  | 'must-play-drawn'
  | 'color-required'
  | 'already-drawn'
  | 'must-draw'
  | 'draw-empty';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface PlayerView {
  name: string;
  handCount: number;
  score: number;
  ai: AiLevel | null;
}

export interface SeatView {
  seat: number;
  hand: Card[];
  players: PlayerView[];
  turn: number;
  direction: 1 | -1;
  current: Color;
  top: Card;
  status: GameStatus;
  round: number;
  roundWinner: number | null;
  roundPoints: number[] | null;
  matchWinners: number[];
  targetScore: number;
  canMove: boolean;
  canDraw: boolean;
  canPass: boolean;
  legalIds: string[];
  drawnCardId: string | null;
  drawCount: number;
  discardCount: number;
  events: GameEvent[];
  firstSeat: number;
}

export interface PlayerSetup {
  name: string;
  ai: AiLevel | null;
}

export interface SetupOptions {
  players: PlayerSetup[];
  rng: Rng;
  targetScore?: number;
  cardsPerPlayer?: number;
  firstSeat?: number;
  round?: number;
}

const SHORT: Record<Color, string> = { red: 'r', yellow: 'y', green: 'g', blue: 'b' };
const ACTION_KINDS: readonly CardKind[] = ['skip', 'reverse', 'draw2'];

/* ------------------------------------------------------------------ deck */

/** A fresh 108-card deck: 4 × 25 colour cards + 4 Wild + 4 Wild Draw Four. */
export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    const short = SHORT[color];
    cards.push({ id: `${short}-0`, color, kind: 'number', value: 0 });
    for (let value = 1; value <= 9; value++) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: `${short}-${value}-${copy}`, color, kind: 'number', value });
      }
    }
    for (const kind of ACTION_KINDS) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: `${short}-${kind}-${copy}`, color, kind, value: null });
      }
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    cards.push({ id: `wild-${copy}`, color: 'wild', kind: 'wild', value: null });
    cards.push({ id: `wild4-${copy}`, color: 'wild', kind: 'wild4', value: null });
  }
  return cards;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const raw = rng();
    const unit = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
    const j = Math.floor(unit * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function isWild(card: Card): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

export function cardPoints(card: Card): number {
  if (card.kind === 'number') return card.value ?? 0;
  if (card.kind === 'wild' || card.kind === 'wild4') return 50;
  return 20;
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((total, card) => total + cardPoints(card), 0);
}

/* ---------------------------------------------------------------- helpers */

export function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1];
}

/** Move `steps` seats in the current direction. */
export function nextSeat(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + state.direction * steps) % n) + n) % n;
}

function shift(from: number, direction: 1 | -1, steps: number, n: number): number {
  return (((from + direction * steps) % n) + n) % n;
}

function pushEvents(events: GameEvent[], ...next: GameEvent[]): GameEvent[] {
  return [...events, ...next].slice(-80);
}

export function canPlayCard(state: GameState, card: Card): boolean {
  if (state.status !== 'playing') return false;
  if (isWild(card)) return true;
  if (card.color === state.current) return true;
  const top = topCard(state);
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value) return true;
  // Family UNO convention: an action symbol can follow the same symbol.
  if (card.kind !== 'number' && card.kind === top.kind) return true;
  return false;
}

export function drawAvailable(state: GameState): boolean {
  return state.drawPile.length > 0 || state.discard.length > 1;
}

export function legalCards(state: GameState, seat: number): Card[] {
  if (state.status !== 'playing' || state.turn !== seat) return [];
  const player = state.players[seat];
  if (!player) return [];
  if (state.drawnCardId) {
    const drawn = player.hand.find((card) => card.id === state.drawnCardId);
    return drawn && canPlayCard(state, drawn) ? [drawn] : [];
  }
  return player.hand.filter((card) => canPlayCard(state, card));
}

export function legalMoves(state: GameState, seat: number): Move[] {
  if (state.status !== 'playing' || state.turn !== seat) return [];
  const moves: Move[] = [];
  for (const card of legalCards(state, seat)) {
    if (isWild(card)) {
      for (const color of COLORS) moves.push({ type: 'play', cardId: card.id, color });
    } else {
      moves.push({ type: 'play', cardId: card.id });
    }
  }
  if (!state.drawnCardId && drawAvailable(state)) moves.push({ type: 'draw' });
  if (state.drawnCardId || !drawAvailable(state)) moves.push({ type: 'pass' });
  return moves;
}

/* ------------------------------------------------------------------ setup */

export function setup(options: SetupOptions): GameState {
  const players = options.players;
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
    throw new Error('Color Chain needs 2 to 6 players');
  }
  const targetScore = options.targetScore ?? 200;
  if (!Number.isFinite(targetScore) || targetScore <= 0) {
    throw new Error('targetScore must be a positive number');
  }
  const cardsPerPlayer = options.cardsPerPlayer ?? 7;
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1 || cardsPerPlayer > 12) {
    throw new Error('cardsPerPlayer must be between 1 and 12');
  }
  const firstSeat = options.firstSeat ?? 0;
  if (!Number.isInteger(firstSeat) || firstSeat < 0 || firstSeat >= players.length) {
    throw new Error('firstSeat is out of range');
  }
  const round = options.round ?? 1;
  const deck = shuffle(fullDeck(), options.rng);
  const hands: Card[][] = players.map(() => []);
  for (let roundCard = 0; roundCard < cardsPerPlayer; roundCard++) {
    for (let seat = 0; seat < players.length; seat++) {
      const card = deck.pop();
      if (card) hands[seat].push(card);
    }
  }
  // The opening card is always a number, so no opening action can be ambiguous.
  const numberIndexes = deck.flatMap((card, index) => (card.kind === 'number' ? [index] : []));
  const raw = options.rng();
  const unit = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
  const pick = numberIndexes[Math.floor(unit * numberIndexes.length)] ?? 0;
  const opening = deck.splice(pick, 1)[0];
  const current = opening.color as Color;
  return {
    players: players.map((player, seat) => ({
      name: String(player.name || `Player ${seat + 1}`).slice(0, 18),
      hand: hands[seat],
      score: 0,
      ai: player.ai,
    })),
    turn: firstSeat,
    direction: 1,
    current,
    drawPile: deck,
    discard: [opening],
    status: 'playing',
    round,
    roundWinner: null,
    roundPoints: null,
    matchWinners: [],
    targetScore: Math.round(targetScore),
    drawnCardId: null,
    events: [{ t: 'roundStart', round }],
    firstSeat,
  };
}

/* ------------------------------------------------------------- draw logic */

interface DrawResult {
  cards: Card[];
  drawPile: Card[];
  discard: Card[];
}

function takeCards(state: GameState, count: number, rng: Rng): DrawResult {
  let drawPile = state.drawPile.slice();
  let discard = state.discard.slice();
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discard.length <= 1) break;
      const top = discard[discard.length - 1];
      drawPile = shuffle(discard.slice(0, -1), rng);
      discard = [top];
    }
    const card = drawPile.pop();
    if (!card) break;
    cards.push(card);
  }
  return { cards, drawPile, discard };
}

function withHand(players: Player[], seat: number, hand: Card[]): Player[] {
  return players.map((player, index) => (index === seat ? { ...player, hand } : player));
}

function addCards(players: Player[], seat: number, cards: Card[]): Player[] {
  if (cards.length === 0) return players;
  return players.map((player, index) =>
    index === seat ? { ...player, hand: [...player.hand, ...cards] } : player,
  );
}

function finishRound(state: GameState, winner: number): GameState {
  const roundPoints = state.players.map((player, seat) =>
    seat === winner ? 0 : handPoints(player.hand),
  );
  const players = state.players.map((player, seat) => ({
    ...player,
    score: player.score + roundPoints[seat],
  }));
  const over = players.some((player) => player.score >= state.targetScore);
  const low = Math.min(...players.map((player) => player.score));
  const matchWinners = over
    ? players.flatMap((player, seat) => (player.score === low ? [seat] : []))
    : [];
  let events = pushEvents(state.events, { t: 'roundEnd', winner, points: roundPoints });
  if (over) events = pushEvents(events, { t: 'matchEnd', winners: matchWinners });
  return {
    ...state,
    players,
    status: over ? 'match-over' : 'round-over',
    roundWinner: winner,
    roundPoints,
    matchWinners,
    drawnCardId: null,
    events,
  };
}

/* -------------------------------------------------------------------- act */

export function act(state: GameState, seat: number, move: Move, rng: Rng): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-turn' };
  if (!move || typeof move !== 'object' || !('type' in move)) {
    return { ok: false, state, error: 'bad-move' };
  }

  if (move.type === 'draw') {
    if (state.drawnCardId) return { ok: false, state, error: 'already-drawn' };
    if (!drawAvailable(state)) return { ok: false, state, error: 'draw-empty' };
    const taken = takeCards(state, 1, rng);
    if (taken.cards.length === 0) return { ok: false, state, error: 'draw-empty' };
    const card = taken.cards[0];
    return {
      ok: true,
      state: {
        ...state,
        players: withHand(state.players, seat, [...state.players[seat].hand, card]),
        drawPile: taken.drawPile,
        discard: taken.discard,
        drawnCardId: card.id,
        events: pushEvents(state.events, { t: 'draw', seat }),
      },
    };
  }

  if (move.type === 'pass') {
    if (!state.drawnCardId && drawAvailable(state)) {
      return { ok: false, state, error: 'must-draw' };
    }
    const turn = nextSeat(state, seat, 1);
    return {
      ok: true,
      state: {
        ...state,
        turn,
        drawnCardId: null,
        events: pushEvents(state.events, { t: 'pass', seat }),
      },
    };
  }

  if (move.type !== 'play') return { ok: false, state, error: 'bad-move' };
  const cardId = typeof move.cardId === 'string' ? move.cardId : '';
  const player = state.players[seat];
  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return { ok: false, state, error: 'not-in-hand' };
  const card = player.hand[cardIndex];
  if (state.drawnCardId && card.id !== state.drawnCardId) {
    return { ok: false, state, error: 'must-play-drawn' };
  }
  if (!canPlayCard(state, card)) return { ok: false, state, error: 'illegal-card' };
  const wild = isWild(card);
  const chosen = move.color;
  if (wild && (!chosen || !COLORS.includes(chosen))) {
    return { ok: false, state, error: 'color-required' };
  }

  const hand = player.hand.filter((_, index) => index !== cardIndex);
  let players = withHand(state.players, seat, hand);
  const discard = [...state.discard, card];
  const current: Color = wild ? (chosen as Color) : (card.color as Color);
  let direction = state.direction;
  let steps = 1;
  const n = state.players.length;
  const events: GameEvent[] = wild
    ? [{ t: 'play', seat, card, color: chosen as Color }]
    : [{ t: 'play', seat, card }];

  let drawPile = state.drawPile;
  let nextDiscard = discard;
  let turn = seat;

  if (card.kind === 'skip') {
    const target = shift(seat, direction, 1, n);
    events.push({ t: 'skip', seat, target });
    steps = 2;
  } else if (card.kind === 'reverse') {
    direction = direction === 1 ? -1 : 1;
    steps = n === 2 ? 2 : 1;
    events.push({ t: 'reverse', seat });
  } else if (card.kind === 'draw2' || card.kind === 'wild4') {
    const count = card.kind === 'draw2' ? 2 : 4;
    const target = shift(seat, direction, 1, n);
    const taken = takeCards(
      { ...state, drawPile, discard: nextDiscard },
      count,
      rng,
    );
    players = addCards(players, target, taken.cards);
    drawPile = taken.drawPile;
    nextDiscard = taken.discard;
    events.push({
      t: 'drawPenalty',
      seat,
      target,
      count: taken.cards.length,
    });
    steps = 2;
  }

  turn = shift(seat, direction, steps, n);

  let next: GameState = {
    ...state,
    players,
    turn,
    direction,
    current,
    drawPile,
    discard: nextDiscard,
    drawnCardId: null,
    events: pushEvents(state.events, ...events),
  };
  if (hand.length === 0) next = finishRound(next, seat);
  return { ok: true, state: next };
}

/** Tripwire alias used by LAN intents: the seat itself is checked by `act`. */
export function applySeat(state: GameState, seat: number, move: Move, rng: Rng): MoveResult {
  return act(state, seat, move, rng);
}

/* --------------------------------------------------------------- next round */

export function nextRound(state: GameState, rng: Rng): GameState {
  if (state.status !== 'round-over') return state;
  const nextFirst = (state.firstSeat + 1) % state.players.length;
  const fresh = setup({
    players: state.players.map((player) => ({ name: player.name, ai: player.ai })),
    rng,
    targetScore: state.targetScore,
    firstSeat: nextFirst,
    round: state.round + 1,
  });
  return {
    ...fresh,
    players: fresh.players.map((player, seat) => ({
      ...player,
      score: state.players[seat]?.score ?? 0,
    })),
  };
}

/* -------------------------------------------------------------------- view */

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.players.length ? seat : 0;
  const player = state.players[safeSeat];
  const canMove = state.status === 'playing' && state.turn === safeSeat;
  const canDrawNow = canMove && !state.drawnCardId && drawAvailable(state);
  const canPassNow =
    canMove && (state.drawnCardId !== null || !drawAvailable(state));
  return {
    seat: safeSeat,
    hand: player.hand.slice(),
    players: state.players.map((item) => ({
      name: item.name,
      handCount: item.hand.length,
      score: item.score,
      ai: item.ai,
    })),
    turn: state.turn,
    direction: state.direction,
    current: state.current,
    top: topCard(state),
    status: state.status,
    round: state.round,
    roundWinner: state.roundWinner,
    roundPoints: state.roundPoints ? state.roundPoints.slice() : null,
    matchWinners: state.matchWinners.slice(),
    targetScore: state.targetScore,
    canMove,
    canDraw: canDrawNow,
    canPass: canPassNow,
    legalIds: canMove ? legalCards(state, safeSeat).map((card) => card.id) : [],
    drawnCardId: state.turn === safeSeat ? state.drawnCardId : null,
    drawCount: state.drawPile.length,
    discardCount: state.discard.length,
    events: state.events.slice(-40),
    firstSeat: state.firstSeat,
  };
}

/** Seats sorted for a final table: lowest score first, then fewest cards. */
export function ranking(state: GameState): number[] {
  return state.players
    .map((player, seat) => ({ seat, score: player.score, cards: player.hand.length }))
    .sort((a, b) => a.score - b.score || a.cards - b.cards || a.seat - b.seat)
    .map((item) => item.seat);
}
