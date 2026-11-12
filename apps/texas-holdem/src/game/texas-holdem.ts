/**
 * No-limit Texas Hold'em engine · 2–6 seats, play money only.
 *
 * Pure TypeScript: no DOM, network, clock or Math.random. Every shuffle takes an
 * injected RNG. The host owns the authoritative state; `view(state, seat)` is the
 * only information a seat is allowed to see.
 */

import {
  RANK_VALUE,
  evaluate,
  makeDeck,
  type Card,
  type HandCategory,
  type Suit,
} from './evaluator';

export {
  RANKS,
  RANK_VALUE,
  SUITS,
  cardId,
  evaluate,
  makeDeck,
  scoreCards,
} from './evaluator';
export type { Card, HandCategory, Rank, Suit } from './evaluator';

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
export const DEFAULT_STACK = 1000;
export const DEFAULT_SMALL_BLIND = 10;
export const DEFAULT_BIG_BLIND = 20;

export type Rng = () => number;
export type Seat = number;
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase = Street | 'showdown' | 'session-over';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface Action {
  type: ActionType;
  /** For bet and raise, the total street contribution to raise TO. */
  amount?: number;
}

export interface ActionRecord {
  seat: number;
  street: Phase;
  type: ActionType;
  amount: number;
  to: number;
  allIn: boolean;
}

export interface PlayerState {
  stack: number;
  hand: Card[];
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  totalBet: number;
  acted: boolean;
  canRaise: boolean;
  lastAction: ActionRecord | null;
}

export interface PotShare {
  seat: number;
  amount: number;
  refund: boolean;
}

export interface PotResult {
  amount: number;
  contributors: number[];
  winners: number[];
  shares: PotShare[];
  oddChipSeat: number | null;
  oddChipAmount: number;
  uncalled: boolean;
}

export interface Payout {
  seat: number;
  amount: number;
  hand: HandCategory | null;
  refund: boolean;
}

export interface HandResult {
  handNumber: number;
  button: number;
  board: Card[];
  pot: number;
  payouts: Payout[];
  pots: PotResult[];
  winners: number[];
  showdown: boolean;
  folded: number[];
  stacks: number[];
  handNames: Record<number, HandCategory>;
  bestFive: Record<number, Card[]>;
  oddChips: { seat: number; amount: number }[];
  sessionOver: boolean;
  champion: number | null;
}

export interface GameState {
  version: number;
  handNumber: number;
  phase: Phase;
  button: number;
  smallBlind: number;
  bigBlind: number;
  sbSeat: number;
  bbSeat: number;
  turn: number;
  players: PlayerState[];
  deck: Card[];
  burned: Card[];
  board: Card[];
  currentBet: number;
  minRaise: number;
  actionLog: ActionRecord[];
  result: HandResult | null;
  sessionOver: boolean;
  champion: number | null;
}

export interface SetupOptions {
  rng: Rng;
  seats: number;
  startingStack?: number;
  smallBlind?: number;
  bigBlind?: number;
  button?: number;
  stacks?: number[];
}

export type ActionError =
  | 'bad-phase'
  | 'bad-seat'
  | 'wrong-turn'
  | 'not-dealt'
  | 'folded'
  | 'all-in'
  | 'bad-action'
  | 'cannot-check'
  | 'cannot-call'
  | 'cannot-bet'
  | 'cannot-raise'
  | 'no-raise-right'
  | 'bad-amount'
  | 'insufficient-stack'
  | 'session-over';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: ActionError;
}

export interface ActionOptions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBetTo: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxTo: number;
  canAllIn: boolean;
  allInTo: number;
  allInIsRaise: boolean;
  toCall: number;
}

export interface PublicPlayerView {
  seat: number;
  stack: number;
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  totalBet: number;
  acted: boolean;
  cardCount: number;
  dealer: boolean;
  smallBlind: boolean;
  bigBlind: boolean;
  lastAction: ActionRecord | null;
}

export interface SeatView {
  seat: number;
  version: number;
  handNumber: number;
  phase: Phase;
  button: number;
  smallBlind: number;
  bigBlind: number;
  sbSeat: number;
  bbSeat: number;
  turn: number;
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  hand: Card[];
  handName: HandCategory | null;
  bestFive: Card[];
  players: PublicPlayerView[];
  canAct: boolean;
  legal: ActionOptions;
  toCall: number;
  potOdds: number;
  revealed: { seat: number; cards: Card[] }[];
  result: HandResult | null;
  sessionOver: boolean;
  champion: number | null;
  actionLog: ActionRecord[];
}

/** Mulberry32: deterministic, fast and dependency-free. */
export function makeRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seats the button so the human at seat 0 is first to act pre-flop:
 * heads-up the button is the small blind; with three or more the button is
 * three seats before the human, putting the human under the gun.
 */
export const defaultButton = (seats: number): number =>
  seats === 2 ? 0 : Math.max(0, seats - 3);

function clampSeats(value: number): number {
  const rounded = Math.round(value);
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Number.isFinite(rounded) ? rounded : MIN_SEATS));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const pick = Math.max(0, Math.min(index, raw));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

function sortHand(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return cards
    .slice()
    .sort((a, b) => {
      const suit = suitOrder[a.suit] - suitOrder[b.suit];
      if (suit !== 0) return suit;
      return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
    });
}

const cloneCard = (card: Card): Card => ({ rank: card.rank, suit: card.suit });
const cloneAction = (action: ActionRecord | null): ActionRecord | null =>
  action ? { ...action } : null;

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({
    ...player,
    hand: player.hand.map(cloneCard),
    lastAction: cloneAction(player.lastAction),
  }));
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: clonePlayers(state.players),
    deck: state.deck.map(cloneCard),
    burned: state.burned.map(cloneCard),
    board: state.board.map(cloneCard),
    actionLog: state.actionLog.map((item) => ({ ...item })),
    result: state.result
      ? {
          ...state.result,
          board: state.result.board.map(cloneCard),
          payouts: state.result.payouts.map((item) => ({ ...item })),
          pots: state.result.pots.map((pot) => ({
            ...pot,
            contributors: pot.contributors.slice(),
            winners: pot.winners.slice(),
            shares: pot.shares.map((share) => ({ ...share })),
          })),
          folded: state.result.folded.slice(),
          stacks: state.result.stacks.slice(),
          handNames: { ...state.result.handNames },
          bestFive: Object.fromEntries(
            Object.entries(state.result.bestFive).map(([seat, cards]) => [
              seat,
              cards.map(cloneCard),
            ]),
          ),
          oddChips: state.result.oddChips.map((item) => ({ ...item })),
        }
      : null,
  };
}

function seatCount(state: GameState): number {
  return state.players.length;
}

function nextSeat(seat: number, count: number): number {
  return (seat + 1) % count;
}

function canActNow(player: PlayerState | undefined): boolean {
  return Boolean(player && !player.folded && !player.allIn && player.stack > 0);
}

function liveSeats(state: GameState): number[] {
  const seats: number[] = [];
  state.players.forEach((player, seat) => {
    if (!player.folded) seats.push(seat);
  });
  return seats;
}

function seatsWithChips(state: GameState): number[] {
  const seats: number[] = [];
  state.players.forEach((player, seat) => {
    if (player.stack > 0) seats.push(seat);
  });
  return seats;
}

export function totalPot(state: GameState): number {
  return state.players.reduce((sum, player) => sum + player.totalBet, 0);
}

function orderFrom(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (start + index) % count);
}

function beginHand(
  base: GameState,
  rng: Rng,
  button: number,
  handNumber: number,
): GameState {
  const state = cloneState(base);
  state.handNumber = handNumber;
  state.board = [];
  state.burned = [];
  state.actionLog = [];
  state.result = null;
  state.sessionOver = false;
  state.champion = null;
  state.sbSeat = -1;
  state.bbSeat = -1;
  state.turn = -1;
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.version += 1;

  state.players.forEach((player) => {
    player.hand = [];
    player.folded = player.stack <= 0;
    player.allIn = false;
    player.streetBet = 0;
    player.totalBet = 0;
    player.acted = false;
    player.canRaise = true;
    player.lastAction = null;
  });

  const participants = seatsWithChips(state);
  if (participants.length < 2) {
    state.phase = 'session-over';
    state.champion = participants[0] ?? null;
    state.sessionOver = true;
    return state;
  }

  const count = seatCount(state);
  state.button = participants.includes(button) ? button : participants[0];
  state.deck = shuffle(makeDeck(), rng);

  const dealOrder = orderFrom(nextSeat(state.button, count), count).filter((seat) =>
    participants.includes(seat),
  );
  for (let round = 0; round < 2; round += 1) {
    for (const seat of dealOrder) {
      const card = state.deck.pop();
      if (card) state.players[seat].hand.push(card);
    }
  }
  for (const seat of participants) {
    state.players[seat].hand = sortHand(state.players[seat].hand);
  }

  const headsUp = participants.length === 2;
  const smallBlindSeat = headsUp
    ? state.button
    : orderFrom(nextSeat(state.button, count), count).find((seat) =>
        participants.includes(seat),
      ) ?? participants[0];
  const bigBlindSeat = headsUp
    ? participants.find((seat) => seat !== smallBlindSeat) ?? participants[0]
    : orderFrom(nextSeat(smallBlindSeat, count), count).find((seat) =>
        participants.includes(seat),
      ) ?? participants[0];

  state.sbSeat = smallBlindSeat;
  state.bbSeat = bigBlindSeat;

  const post = (seat: number, amount: number) => {
    const player = state.players[seat];
    const paid = Math.min(amount, player.stack);
    player.stack -= paid;
    player.streetBet += paid;
    player.totalBet += paid;
    player.allIn = player.stack === 0;
  };
  post(smallBlindSeat, state.smallBlind);
  post(bigBlindSeat, state.bigBlind);

  state.currentBet = state.bigBlind;
  state.minRaise = state.bigBlind;
  state.phase = 'preflop';
  state.turn = firstPreflopActor(state, participants);
  state.players.forEach((player) => {
    player.acted = false;
    player.canRaise = true;
  });
  return progress(state);
}

function firstPreflopActor(state: GameState, participants: number[]): number {
  const count = seatCount(state);
  for (let offset = 1; offset <= count; offset += 1) {
    const seat = (state.bbSeat + offset) % count;
    if (participants.includes(seat) && canActNow(state.players[seat])) return seat;
  }
  return -1;
}

function firstPostflopActor(state: GameState): number {
  const count = seatCount(state);
  for (let offset = 1; offset <= count; offset += 1) {
    const seat = (state.button + offset) % count;
    const player = state.players[seat];
    if (canActNow(player)) return seat;
  }
  return -1;
}

export function setup(options: SetupOptions): GameState {
  const seats = clampSeats(options.seats);
  const smallBlind = Math.max(1, Math.round(options.smallBlind ?? DEFAULT_SMALL_BLIND));
  const bigBlind = Math.max(smallBlind + 1, Math.round(options.bigBlind ?? DEFAULT_BIG_BLIND));
  const startingStack = Math.max(
    bigBlind,
    Math.round(options.startingStack ?? DEFAULT_STACK),
  );
  const players: PlayerState[] = Array.from({ length: seats }, (_, seat) => ({
    stack:
      options.stacks && Number.isFinite(options.stacks[seat])
        ? Math.max(0, Math.round(options.stacks[seat]))
        : startingStack,
    hand: [],
    folded: false,
    allIn: false,
    streetBet: 0,
    totalBet: 0,
    acted: false,
    canRaise: true,
    lastAction: null,
  }));
  const base: GameState = {
    version: 0,
    handNumber: 0,
    phase: 'preflop',
    button: Math.max(0, Math.min(seats - 1, Math.round(options.button ?? defaultButton(seats)))),
    smallBlind,
    bigBlind,
    sbSeat: -1,
    bbSeat: -1,
    turn: -1,
    players,
    deck: [],
    burned: [],
    board: [],
    currentBet: 0,
    minRaise: bigBlind,
    actionLog: [],
    result: null,
    sessionOver: false,
    champion: null,
  };
  return beginHand(base, options.rng, base.button, 1);
}

export function nextHand(state: GameState, rng: Rng): ActionResult {
  if (state.phase !== 'showdown') return { ok: false, state, error: 'bad-phase' };
  if (state.sessionOver) return { ok: false, state, error: 'session-over' };
  const participants = seatsWithChips(state);
  if (participants.length < 2) return { ok: false, state, error: 'session-over' };
  const count = seatCount(state);
  let button = state.button;
  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = (state.button + offset) % count;
    if (participants.includes(candidate)) {
      button = candidate;
      break;
    }
  }
  return {
    ok: true,
    state: beginHand(state, rng, button, state.handNumber + 1),
  };
}

export function legalActions(state: GameState, seat: number): ActionOptions {
  const empty: ActionOptions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    minBetTo: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxTo: 0,
    canAllIn: false,
    allInTo: 0,
    allInIsRaise: false,
    toCall: 0,
  };
  if (state.phase === 'showdown' || state.phase === 'session-over') return empty;
  if (state.turn !== seat) return empty;
  const player = state.players[seat];
  if (!canActNow(player)) return empty;

  const maxTo = player.streetBet + player.stack;
  const toCall = Math.max(0, state.currentBet - player.streetBet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && player.stack > 0;
  const canBet = state.currentBet === 0 && player.stack > 0;
  const minBetTo =
    state.currentBet === 0
      ? Math.min(maxTo, Math.max(1, Math.min(state.bigBlind, maxTo)))
      : 0;
  const canRaise =
    state.currentBet > 0 &&
    player.canRaise &&
    player.stack > 0 &&
    maxTo > state.currentBet;
  const minRaiseTo = canRaise
    ? Math.min(maxTo, state.currentBet + Math.max(1, state.minRaise))
    : 0;

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount: canCall ? Math.min(toCall, player.stack) : 0,
    canBet,
    minBetTo,
    canRaise,
    minRaiseTo,
    maxTo,
    canAllIn: player.stack > 0,
    allInTo: maxTo,
    allInIsRaise:
      maxTo > state.currentBet && (state.currentBet === 0 || player.canRaise),
    toCall,
  };
}

export function applyAction(state: GameState, seat: number, action: Action): ActionResult {
  if (state.phase === 'showdown' || state.phase === 'session-over') {
    return { ok: false, state, error: 'bad-phase' };
  }
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  const current = state.players[seat];
  if (current.hand.length === 0) return { ok: false, state, error: 'not-dealt' };
  if (current.folded) return { ok: false, state, error: 'folded' };
  if (current.allIn) return { ok: false, state, error: 'all-in' };
  const options = legalActions(state, seat);
  if (!action || typeof action.type !== 'string') {
    return { ok: false, state, error: 'bad-action' };
  }

  const next = cloneState(state);
  const player = next.players[seat];
  let paid = 0;
  let recordType: ActionType = action.type;

  const payTo = (target: number): boolean => {
    if (!Number.isInteger(target)) return false;
    const delta = target - player.streetBet;
    if (delta < 0 || delta > player.stack) return false;
    player.stack -= delta;
    player.streetBet = target;
    player.totalBet += delta;
    player.allIn = player.stack === 0;
    paid = delta;
    return true;
  };

  const finishAggression = (target: number, wasOpening: boolean) => {
    if (wasOpening) {
      next.currentBet = target;
      next.minRaise =
        target >= next.bigBlind ? target : Math.max(1, next.bigBlind - target);
      for (let other = 0; other < next.players.length; other += 1) {
        if (other === seat) continue;
        const otherPlayer = next.players[other];
        if (canActNow(otherPlayer)) {
          otherPlayer.acted = false;
          otherPlayer.canRaise = true;
        }
      }
    } else {
      const raiseSize = target - next.currentBet;
      next.currentBet = target;
      if (raiseSize >= next.minRaise) {
        next.minRaise = raiseSize;
        for (let other = 0; other < next.players.length; other += 1) {
          if (other === seat) continue;
          const otherPlayer = next.players[other];
          if (canActNow(otherPlayer)) {
            otherPlayer.acted = false;
            otherPlayer.canRaise = true;
          }
        }
      }
    }
  };

  switch (action.type) {
    case 'fold': {
      player.folded = true;
      player.acted = true;
      player.canRaise = false;
      recordType = 'fold';
      break;
    }
    case 'check': {
      if (!options.canCheck) return { ok: false, state, error: 'cannot-check' };
      player.acted = true;
      player.canRaise = false;
      recordType = 'check';
      break;
    }
    case 'call': {
      if (!options.canCall) return { ok: false, state, error: 'cannot-call' };
      if (!payTo(player.streetBet + options.callAmount)) {
        return { ok: false, state, error: 'insufficient-stack' };
      }
      player.acted = true;
      player.canRaise = false;
      recordType = player.allIn ? 'all-in' : 'call';
      break;
    }
    case 'bet': {
      if (!options.canBet) return { ok: false, state, error: 'cannot-bet' };
      const target = Number(action.amount);
      if (!Number.isInteger(target) || target < options.minBetTo || target > options.maxTo) {
        return { ok: false, state, error: target > options.maxTo ? 'insufficient-stack' : 'bad-amount' };
      }
      if (!payTo(target)) return { ok: false, state, error: 'insufficient-stack' };
      player.acted = true;
      player.canRaise = false;
      finishAggression(target, true);
      recordType = player.allIn ? 'all-in' : 'bet';
      break;
    }
    case 'raise': {
      if (!options.canRaise) {
        return {
          ok: false,
          state,
          error: options.maxTo > state.currentBet ? 'no-raise-right' : 'cannot-raise',
        };
      }
      const target = Number(action.amount);
      if (!Number.isInteger(target) || target <= state.currentBet) {
        return { ok: false, state, error: 'bad-amount' };
      }
      if (target > options.maxTo) return { ok: false, state, error: 'insufficient-stack' };
      if (target < options.minRaiseTo && target !== options.maxTo) {
        return { ok: false, state, error: 'bad-amount' };
      }
      if (!payTo(target)) return { ok: false, state, error: 'insufficient-stack' };
      player.acted = true;
      player.canRaise = false;
      finishAggression(target, false);
      recordType = player.allIn ? 'all-in' : 'raise';
      break;
    }
    case 'all-in': {
      if (!options.canAllIn) return { ok: false, state, error: 'all-in' };
      const target = options.allInTo;
      if (target > state.currentBet) {
        if (state.currentBet > 0 && !player.canRaise) {
          return { ok: false, state, error: 'no-raise-right' };
        }
        if (state.currentBet > 0 && target - state.currentBet < state.minRaise) {
          // Short all-in raise: legal, but it does not reopen the betting.
          if (!payTo(target)) return { ok: false, state, error: 'insufficient-stack' };
          player.acted = true;
          player.canRaise = false;
          finishAggression(target, false);
          recordType = 'all-in';
          break;
        }
      }
      if (!payTo(target)) return { ok: false, state, error: 'insufficient-stack' };
      player.acted = true;
      player.canRaise = false;
      if (target > state.currentBet) {
        finishAggression(target, state.currentBet === 0);
      }
      recordType = 'all-in';
      break;
    }
    default:
      return { ok: false, state, error: 'bad-action' };
  }

  const record: ActionRecord = {
    seat,
    street: state.phase,
    type: recordType,
    amount: paid,
    to: player.streetBet,
    allIn: player.allIn,
  };
  player.lastAction = record;
  next.actionLog.push(record);
  next.turn = nextToAct(next, seat);
  next.version += 1;
  return { ok: true, state: progress(next) };
}

export function applySeatAction(state: GameState, seat: number, action: Action): ActionResult {
  return applyAction(state, seat, action);
}

function canRaiseStill(player: PlayerState): boolean {
  return player.canRaise;
}

function nextToAct(state: GameState, from: number): number {
  const count = seatCount(state);
  for (let offset = 1; offset <= count; offset += 1) {
    const seat = (from + offset + count) % count;
    const player = state.players[seat];
    if (!canActNow(player)) continue;
    if (!player.acted || player.streetBet < state.currentBet) return seat;
  }
  return -1;
}

function bettingComplete(state: GameState): boolean {
  const live = liveSeats(state);
  if (live.length <= 1) return true;
  const actors = live.filter((seat) => canActNow(state.players[seat]));
  if (actors.length === 0) return true;
  if (actors.length === 1) {
    return state.players[actors[0]].streetBet >= state.currentBet;
  }
  return actors.every((seat) => {
    const player = state.players[seat];
    return player.acted && player.streetBet >= state.currentBet;
  });
}

function dealNextStreet(state: GameState): GameState {
  const next = cloneState(state);
  const nextPhase: Phase =
    next.phase === 'preflop' ? 'flop' : next.phase === 'flop' ? 'turn' : 'river';
  const burn = next.deck.pop();
  if (burn) next.burned.push(burn);
  const count = nextPhase === 'flop' ? 3 : 1;
  for (let index = 0; index < count; index += 1) {
    const card = next.deck.pop();
    if (card) next.board.push(card);
  }
  next.phase = nextPhase;
  next.currentBet = 0;
  next.minRaise = next.bigBlind;
  next.players.forEach((player) => {
    player.streetBet = 0;
    player.acted = false;
    player.canRaise = true;
  });
  next.turn = firstPostflopActor(next);
  next.version += 1;
  return next;
}

function progress(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 12; guard += 1) {
    if (next.phase === 'showdown' || next.phase === 'session-over') return next;
    const live = liveSeats(next);
    if (live.length <= 1) return finishFold(next);
    if (!bettingComplete(next)) {
      if (!canActNow(next.players[next.turn])) {
        next = cloneState(next);
        next.turn = nextToAct(next, next.turn < 0 ? next.button : next.turn);
        next.version += 1;
      }
      return next;
    }
    if (next.phase === 'river') return finishShowdown(next);
    next = dealNextStreet(next);
  }
  return next;
}

function seatOrderLeftOfButton(state: GameState): number[] {
  return orderFrom(nextSeat(state.button, seatCount(state)), seatCount(state));
}

function buildPots(
  state: GameState,
  scores: Record<number, number>,
  live: number[],
): PotResult[] {
  const levels = Array.from(
    new Set(state.players.map((player) => player.totalBet).filter((value) => value > 0)),
  ).sort((a, b) => a - b);
  const pots: PotResult[] = [];
  let previous = 0;
  const order = seatOrderLeftOfButton(state);

  for (const level of levels) {
    const amount = (level - previous) * state.players.filter((p) => p.totalBet >= level).length;
    previous = level;
    if (amount <= 0) continue;
    const contributors = state.players
      .map((player, seat) => (player.totalBet >= level ? seat : -1))
      .filter((seat) => seat >= 0);
    const eligible = contributors.filter((seat) => live.includes(seat));

    if (eligible.length === 0) {
      const refundSeat = contributors.reduce((best, seat) =>
        state.players[seat].totalBet > state.players[best].totalBet ? seat : best,
      );
      pots.push({
        amount,
        contributors,
        winners: [refundSeat],
        shares: [{ seat: refundSeat, amount, refund: true }],
        oddChipSeat: null,
        oddChipAmount: 0,
        uncalled: contributors.length === 1,
      });
      continue;
    }

    const bestScore = Math.max(...eligible.map((seat) => scores[seat] ?? -1));
    const winners = eligible.filter((seat) => (scores[seat] ?? -1) === bestScore);
    const base = Math.floor(amount / winners.length);
    const remainder = amount - base * winners.length;
    const orderedWinners = order.filter((seat) => winners.includes(seat));
    const oddSeat = remainder > 0 ? orderedWinners[0] : null;
    const shares: PotShare[] = winners.map((seat) => ({
      seat,
      amount: base + (seat === oddSeat ? remainder : 0),
      refund: false,
    }));
    pots.push({
      amount,
      contributors,
      winners,
      shares,
      oddChipSeat: oddSeat,
      oddChipAmount: remainder,
      uncalled: contributors.length === 1,
    });
  }
  return pots;
}

function settle(
  state: GameState,
  pots: PotResult[],
  showdown: boolean,
  handNames: Record<number, HandCategory>,
  bestFive: Record<number, Card[]>,
  folded: number[],
): GameState {
  const next = cloneState(state);
  const payoutMap = new Map<number, number>();
  const refundSeats = new Set<number>();
  for (const pot of pots) {
    for (const share of pot.shares) {
      payoutMap.set(share.seat, (payoutMap.get(share.seat) ?? 0) + share.amount);
      if (share.refund) refundSeats.add(share.seat);
    }
  }
  const payouts: Payout[] = [];
  for (const [seat, amount] of payoutMap) {
    if (amount <= 0) continue;
    next.players[seat].stack += amount;
    payouts.push({
      seat,
      amount,
      hand: handNames[seat] ?? null,
      refund: refundSeats.has(seat),
    });
  }
  const potTotal = pots.reduce((sum, pot) => sum + pot.amount, 0);
  const winners = Array.from(payoutMap.keys()).filter((seat) => {
    return pots.some(
      (pot) => !pot.uncalled && pot.winners.includes(seat) && pot.shares.some((s) => s.seat === seat && !s.refund),
    );
  });
  const oddChips = pots
    .filter((pot) => pot.oddChipSeat !== null && pot.oddChipAmount > 0)
    .map((pot) => ({ seat: pot.oddChipSeat as number, amount: pot.oddChipAmount }));
  const stacks = next.players.map((player) => player.stack);
  const remaining = stacks.filter((value) => value > 0).length;
  const sessionOver = remaining <= 1;
  const champion = sessionOver
    ? next.players.findIndex((player) => player.stack > 0)
    : -1;
  next.phase = 'showdown';
  next.turn = -1;
  next.sessionOver = sessionOver;
  next.champion = champion >= 0 ? champion : null;
  next.result = {
    handNumber: next.handNumber,
    button: next.button,
    board: next.board.map(cloneCard),
    pot: potTotal,
    payouts,
    pots,
    winners,
    showdown,
    folded: folded.slice(),
    stacks,
    handNames,
    bestFive,
    oddChips,
    sessionOver,
    champion: next.champion,
  };
  next.version += 1;
  return next;
}

function finishFold(state: GameState): GameState {
  const live = liveSeats(state);
  const winner = live[0];
  if (winner === undefined) {
    return settle(state, [], false, {}, {}, state.players.map((_, seat) => seat));
  }
  const folded = state.players
    .map((player, seat) => (player.folded ? seat : -1))
    .filter((seat) => seat >= 0);
  // Even when everyone else folded, an all-in caller may have committed less
  // than a folded bettor. Build the layers so the uncalled excess goes back to
  // the player who put it in, instead of handing it to the last live seat.
  const layers = buildPots(state, { [winner]: 0 }, [winner]);
  const wonLayers = layers.filter((pot) => pot.shares.every((share) => !share.refund));
  const refundLayers = layers.filter((pot) => pot.shares.some((share) => share.refund));
  const wonAmount = wonLayers.reduce((sum, pot) => sum + pot.amount, 0);
  const merged: PotResult[] =
    wonAmount > 0
      ? [
          {
            amount: wonAmount,
            contributors: [],
            winners: [winner],
            shares: [{ seat: winner, amount: wonAmount, refund: false }],
            oddChipSeat: null,
            oddChipAmount: 0,
            uncalled: false,
          },
        ]
      : [];
  return settle(state, [...merged, ...refundLayers], false, {}, {}, folded);
}

function finishShowdown(state: GameState): GameState {
  const live = liveSeats(state);
  if (live.length <= 1) return finishFold(state);
  const handNames: Record<number, HandCategory> = {};
  const bestFive: Record<number, Card[]> = {};
  const scores: Record<number, number> = {};
  for (const seat of live) {
    const cards = [...state.players[seat].hand, ...state.board];
    const evaluated = evaluate(cards);
    scores[seat] = evaluated.score;
    handNames[seat] = evaluated.category;
    bestFive[seat] = evaluated.cards.map(cloneCard);
  }
  const folded = state.players
    .map((player, seat) => (player.folded ? seat : -1))
    .filter((seat) => seat >= 0);
  const pots = state.board.length === 5 ? buildPots(state, scores, live) : [];
  return settle(state, pots, true, handNames, bestFive, folded);
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat =
    Number.isInteger(seat) && seat >= 0 && seat < state.players.length ? seat : 0;
  const player = state.players[safeSeat];
  const options = legalActions(state, safeSeat);
  const pot = totalPot(state);
  const toCall = Math.max(0, state.currentBet - (player?.streetBet ?? 0));
  const canAct = state.turn === safeSeat && options.canFold;
  const ownCards = player ? player.hand.map(cloneCard) : [];
  let handName: HandCategory | null = null;
  let bestFive: Card[] = [];
  if (ownCards.length === 2 && state.board.length >= 3) {
    const evaluated = evaluate([...ownCards, ...state.board]);
    handName = evaluated.category;
    bestFive = evaluated.cards.map(cloneCard);
  }
  const revealed: { seat: number; cards: Card[] }[] = [];
  if (state.phase === 'showdown' && state.result?.showdown) {
    state.players.forEach((item, index) => {
      if (!item.folded && item.hand.length === 2) {
        revealed.push({ seat: index, cards: item.hand.map(cloneCard) });
      }
    });
  }
  const publicPlayers: PublicPlayerView[] = state.players.map((item, index) => ({
    seat: index,
    stack: item.stack,
    folded: item.folded,
    allIn: item.allIn,
    streetBet: item.streetBet,
    totalBet: item.totalBet,
    acted: item.acted,
    cardCount: item.hand.length,
    dealer: index === state.button,
    smallBlind: index === state.sbSeat,
    bigBlind: index === state.bbSeat,
    lastAction: cloneAction(item.lastAction),
  }));
  return {
    seat: safeSeat,
    version: state.version,
    handNumber: state.handNumber,
    phase: state.phase,
    button: state.button,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    turn: state.turn,
    board: state.board.map(cloneCard),
    pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    hand: ownCards,
    handName,
    bestFive,
    players: publicPlayers,
    canAct,
    legal: options,
    toCall: canAct ? Math.min(toCall, player?.stack ?? 0) : 0,
    potOdds: canAct && options.callAmount > 0
      ? options.callAmount / (pot + options.callAmount)
      : 0,
    revealed,
    result: state.result
      ? {
          ...state.result,
          board: state.result.board.map(cloneCard),
          payouts: state.result.payouts.map((item) => ({ ...item })),
          pots: state.result.pots.map((potResult) => ({
            ...potResult,
            contributors: potResult.contributors.slice(),
            winners: potResult.winners.slice(),
            shares: potResult.shares.map((share) => ({ ...share })),
          })),
          folded: state.result.folded.slice(),
          stacks: state.result.stacks.slice(),
          handNames: { ...state.result.handNames },
          bestFive: Object.fromEntries(
            Object.entries(state.result.bestFive).map(([key, cards]) => [
              key,
              cards.map(cloneCard),
            ]),
          ),
          oddChips: state.result.oddChips.map((item) => ({ ...item })),
        }
      : null,
    sessionOver: state.sessionOver,
    champion: state.champion,
    actionLog: state.actionLog.map((item) => ({ ...item })),
  };
}

export function seatNameKey(seat: number): string {
  return `seat${seat + 1}`;
}

export { canRaiseStill };
