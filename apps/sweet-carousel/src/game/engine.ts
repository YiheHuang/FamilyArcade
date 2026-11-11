import { CARD_COUNT, CARD_IDS, HAND_SIZE, ROUNDS } from './data';
import { mulberry32, seedFromString, shuffle } from './rng';
import { buildScoreRows, computeCrowns, scoreCards } from './scoring';
import {
  DESSERT_IDS,
  type ApplyResult,
  type Combo,
  type Crown,
  type DessertId,
  type ErrorCode,
  type GameConfig,
  type GameEvent,
  type GameResult,
  type GameState,
  type GameView,
  type Move,
  type Pick,
  type PickRound,
  type PlayerCount,
  type PublicSeatView,
  type RoundBreakdown,
  type Rng,
  type ScoreRow,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const PICKS_PER_ROUND = HAND_SIZE;
export const TOTAL_ROUNDS = ROUNDS;

const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4, 5];
const PHASES = ['choosing', 'reveal', 'round-end', 'ended'] as const;

export function roundDirection(round: number): 'left' | 'right' {
  return round === 2 ? 'right' : 'left';
}

export function isPlayerCount(value: number): value is PlayerCount {
  return (PLAYER_COUNTS as readonly number[]).includes(value);
}

function validateConfig(config: GameConfig): void {
  if (!isPlayerCount(config.playerCount)) {
    throw new Error('invalid-config: playerCount must be 2, 3, 4 or 5');
  }
  if (!Array.isArray(config.seats) || config.seats.length !== config.playerCount) {
    throw new Error('invalid-config: seat count mismatch');
  }
  for (const seat of config.seats) {
    if (!seat || typeof seat.name !== 'string' || seat.name.trim().length === 0) {
      throw new Error('invalid-config: every seat needs a name');
    }
    if (seat.kind !== 'human' && seat.kind !== 'ai') {
      throw new Error('invalid-config: seat kind must be human or ai');
    }
    if (!['companion', 'easy', 'normal', 'hard'].includes(seat.level)) {
      throw new Error('invalid-config: unknown AI level');
    }
  }
  if (typeof config.seed !== 'string') {
    throw new Error('invalid-config: seed must be a string');
  }
}

function emptyHands(playerCount: number): number[][] {
  return Array.from({ length: playerCount }, () => []);
}

function dealAllRounds(playerCount: number, rng: Rng): number[][][] {
  const deals: number[][][] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const deck = shuffle(CARD_IDS, rng);
    const hands: number[][] = [];
    let cursor = 0;
    for (let seat = 0; seat < playerCount; seat++) {
      hands.push(deck.slice(cursor, cursor + HAND_SIZE));
      cursor += HAND_SIZE;
    }
    deals.push(hands);
  }
  return deals;
}

export function setup(config: GameConfig, rng: Rng): GameState {
  validateConfig(config);
  const deals = dealAllRounds(config.playerCount, rng);
  return {
    version: 1,
    config: {
      ...config,
      seats: config.seats.map((seat) => ({ ...seat, name: seat.name.trim() })),
    },
    phase: 'choosing',
    round: 1,
    pickIndex: 0,
    passDirection: 'left',
    hands: deals[0].map((hand) => [...hand]),
    pending: Array.from({ length: config.playerCount }, () => null),
    roundCollected: emptyHands(config.playerCount),
    collected: emptyHands(config.playerCount),
    roundPicks: [],
    rounds: [],
    revealed: [],
    deals,
    crowns: [],
    lastEvents: [],
  };
}

export function setupFromSeed(config: GameConfig): GameState {
  return setup(config, mulberry32(seedFromString(config.seed)));
}

function cloneBreakdown(breakdown: RoundBreakdown): RoundBreakdown {
  return {
    ...breakdown,
    combos: breakdown.combos.map((combo) => ({ ...combo, cards: [...combo.cards] })),
    sampler: breakdown.sampler
      ? { ...breakdown.sampler, cards: [...breakdown.sampler.cards], desserts: [...breakdown.sampler.desserts] }
      : null,
    leftovers: [...breakdown.leftovers],
  };
}

function cloneRound(round: PickRound): PickRound {
  return {
    ...round,
    picks: round.picks.map((group) => group.map((pick) => ({ ...pick }))),
    breakdowns: round.breakdowns.map(cloneBreakdown),
  };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config, seats: state.config.seats.map((seat) => ({ ...seat })) },
    hands: state.hands.map((hand) => [...hand]),
    pending: [...state.pending],
    roundCollected: state.roundCollected.map((cards) => [...cards]),
    collected: state.collected.map((cards) => [...cards]),
    roundPicks: state.roundPicks.map((group) => group.map((pick) => ({ ...pick }))),
    rounds: state.rounds.map(cloneRound),
    revealed: state.revealed.map((pick) => ({ ...pick })),
    deals: state.deals.map((round) => round.map((hand) => [...hand])),
    crowns: state.crowns.map((crown) => ({ ...crown })),
    lastEvents: state.lastEvents.map((event) => ({ ...event })),
  };
}

export function legal(state: GameState, seat: number): Move[] {
  if (state.phase !== 'choosing') return [];
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.config.playerCount) return [];
  if (state.pending[seat] !== null) return [];
  return state.hands[seat].map((cardId) => ({ kind: 'pick', seat, cardId }));
}

function allPicked(state: GameState): boolean {
  return state.pending.every((cardId) => cardId !== null);
}

function removeCard(hand: number[], cardId: number): number[] {
  const index = hand.indexOf(cardId);
  if (index < 0) return hand;
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function passedHands(hands: number[][], direction: 'left' | 'right'): number[][] {
  const count = hands.length;
  const step = direction === 'left' ? 1 : -1;
  const next: number[][] = Array.from({ length: count }, () => []);
  for (let seat = 0; seat < count; seat++) {
    const target = (seat + step + count) % count;
    next[target] = [...hands[seat]];
  }
  return next;
}

function applyPick(state: GameState, move: Extract<Move, { kind: 'pick' }>): ApplyResult {
  if (state.phase !== 'choosing') {
    return { ok: false, reason: 'wrong-phase', params: { phase: state.phase } };
  }
  if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= state.config.playerCount) {
    return { ok: false, reason: 'bad-seat', params: { seat: move.seat } };
  }
  if (state.pending[move.seat] !== null) {
    return { ok: false, reason: 'already-picked', params: { seat: move.seat } };
  }
  if (!state.hands[move.seat].includes(move.cardId)) {
    return { ok: false, reason: 'card-not-in-hand', params: { cardId: move.cardId } };
  }

  const next = cloneState(state);
  next.pending[move.seat] = move.cardId;
  const events: GameEvent[] = [{ type: 'picked', seat: move.seat, cardId: move.cardId }];

  if (allPicked(next)) {
    next.phase = 'reveal';
    const picks: Pick[] = next.pending.map((cardId, seat) => ({ seat, cardId: cardId! }));
    next.revealed = picks;
    next.roundPicks.push(picks);
    for (let seat = 0; seat < next.config.playerCount; seat++) {
      const cardId = picks[seat].cardId;
      next.hands[seat] = removeCard(next.hands[seat], cardId);
      next.roundCollected[seat].push(cardId);
      next.collected[seat].push(cardId);
    }
    events.push({ type: 'revealed', picks });
  }

  next.lastEvents = events;
  return { ok: true, state: next, events };
}

function applyAdvance(state: GameState): ApplyResult {
  if (state.phase !== 'reveal') {
    return { ok: false, reason: 'wrong-phase', params: { phase: state.phase } };
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.hands = passedHands(next.hands, next.passDirection);
  next.pickIndex += 1;
  next.pending = Array.from({ length: next.config.playerCount }, () => null);
  next.revealed = [];

  if (next.pickIndex >= PICKS_PER_ROUND) {
    const breakdowns = next.roundCollected.map((cards, seat) => scoreCards(cards, seat));
    next.rounds.push({
      round: next.round,
      passDirection: next.passDirection,
      picks: next.roundPicks.map((group) => group.map((pick) => ({ ...pick }))),
      breakdowns,
    });
    next.phase = 'round-end';
    events.push({ type: 'round-ended', round: next.round, breakdowns });
  } else {
    next.phase = 'choosing';
    events.push({ type: 'passed', direction: next.passDirection, round: next.round });
  }

  next.lastEvents = events;
  return { ok: true, state: next, events };
}

function applyNextRound(state: GameState): ApplyResult {
  if (state.phase !== 'round-end') {
    return { ok: false, reason: 'wrong-phase', params: { phase: state.phase } };
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];

  if (next.round >= ROUNDS) {
    next.phase = 'ended';
    next.crowns = computeCrowns(next.collected);
    const final = result(next);
    events.push({ type: 'game-ended', winner: final?.winner ?? null });
  } else {
    next.round = (next.round + 1) as 1 | 2 | 3;
    next.phase = 'choosing';
    next.pickIndex = 0;
    next.pending = Array.from({ length: next.config.playerCount }, () => null);
    next.roundCollected = emptyHands(next.config.playerCount);
    next.roundPicks = [];
    next.revealed = [];
    next.hands = next.deals[next.round - 1].map((hand) => [...hand]);
    next.passDirection = roundDirection(next.round);
  }

  next.lastEvents = events;
  return { ok: true, state: next, events };
}

export function apply(state: GameState, move: Move): ApplyResult {
  if (state.phase === 'ended') return { ok: false, reason: 'game-over' };
  if (!move || typeof move !== 'object') return { ok: false, reason: 'bad-move' };
  switch (move.kind) {
    case 'pick':
      return applyPick(state, move);
    case 'advance':
      return applyAdvance(state);
    case 'next-round':
      return applyNextRound(state);
    default:
      return { ok: false, reason: 'bad-move' };
  }
}

export function score(state: GameState): ScoreRow[] {
  const names = state.config.seats.map((seat) => seat.name);
  const live = state.phase === 'choosing' || state.phase === 'reveal';
  const partial = live && state.roundCollected.some((cards) => cards.length > 0)
    ? state.roundCollected.map((cards, seat) => scoreCards(cards, seat))
    : null;
  return buildScoreRows(names, state.rounds, partial, state.collected, state.crowns);
}

export function result(state: GameState): GameResult | null {
  if (state.phase !== 'ended') return null;
  const rows = score(state);
  const ranking = [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.majorities !== a.majorities) return b.majorities - a.majorities;
    if (b.types !== a.types) return b.types - a.types;
    return a.seat - b.seat;
  });
  let tieBreak: GameResult['tieBreak'] = 'score';
  if (ranking.length > 1 && ranking[0].total === ranking[1].total) {
    if (ranking[0].majorities !== ranking[1].majorities) tieBreak = 'majorities';
    else if (ranking[0].types !== ranking[1].types) tieBreak = 'types';
    else tieBreak = 'seat';
  }
  return {
    winner: ranking[0]?.seat ?? null,
    ranking,
    crowns: state.crowns.map((crown) => ({ ...crown })),
    tieBreak,
    reason: 'three-rounds',
  };
}

function publicSeat(state: GameState, seat: number, rows: ScoreRow[]): PublicSeatView {
  const config = state.config.seats[seat];
  const row = rows[seat];
  return {
    seat,
    name: config.name,
    kind: config.kind,
    level: config.level,
    handCount: state.hands[seat].length,
    hasPicked: state.pending[seat] !== null,
    roundCollected: [...state.roundCollected[seat]],
    collected: [...state.collected[seat]],
    total: row.total,
    majorities: row.majorities,
    types: row.types,
  };
}

function currentBreakdowns(state: GameState): RoundBreakdown[] | null {
  if (state.phase === 'round-end' && state.rounds.length > 0) {
    return state.rounds[state.rounds.length - 1].breakdowns.map(cloneBreakdown);
  }
  if (state.phase === 'reveal') {
    return state.roundCollected.map((cards, seat) => scoreCards(cards, seat));
  }
  return null;
}

export function view(state: GameState, seat: number | null): GameView {
  const validSeat = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < state.config.playerCount ? seat : null;
  const rows = score(state);
  return {
    phase: state.phase,
    round: state.round,
    pickIndex: state.pickIndex,
    playerCount: state.config.playerCount,
    passDirection: state.passDirection,
    seats: state.config.seats.map((_, index) => publicSeat(state, index, rows)),
    mySeat: validSeat,
    myHand: validSeat !== null && state.phase === 'choosing' ? [...state.hands[validSeat]] : [],
    myPending: validSeat !== null ? state.pending[validSeat] : null,
    revealed: state.revealed.map((pick) => ({ ...pick })),
    roundPicks: state.roundPicks.map((group) => group.map((pick) => ({ ...pick }))),
    roundBreakdowns: currentBreakdowns(state),
    rounds: state.rounds.map(cloneRound),
    score: rows,
    crowns: state.crowns.map((crown) => ({ ...crown })),
    result: result(state),
    remainingPicks: Math.max(0, PICKS_PER_ROUND - state.pickIndex),
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function isCardArray(value: unknown, expectedLength?: number): value is number[] {
  return (
    Array.isArray(value) &&
    (expectedLength === undefined || value.length === expectedLength) &&
    value.every((id) => Number.isInteger(id) && id >= 0 && id < CARD_COUNT)
  );
}

function isSeatArrayOfCards(value: unknown, playerCount: number, expectedLength?: number): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length === playerCount &&
    value.every((cards) => isCardArray(cards, expectedLength))
  );
}

export function deserialize(json: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('invalid-save: not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('invalid-save: not an object');
  const state = parsed as Partial<GameState>;
  if (state.version !== 1) {
    throw new Error(`unsupported save version: ${String(state.version)}`);
  }
  if (!state.config || !isPlayerCount(state.config.playerCount)) {
    throw new Error('invalid-save: bad player count');
  }
  const playerCount = state.config.playerCount;
  if (!Array.isArray(state.config.seats) || state.config.seats.length !== playerCount) {
    throw new Error('invalid-save: bad seats');
  }
  if (!PHASES.includes(state.phase as (typeof PHASES)[number])) {
    throw new Error('invalid-save: bad phase');
  }
  if (state.round !== 1 && state.round !== 2 && state.round !== 3) {
    throw new Error('invalid-save: bad round');
  }
  if (typeof state.pickIndex !== 'number' || !Number.isInteger(state.pickIndex) || state.pickIndex < 0 || state.pickIndex > PICKS_PER_ROUND) {
    throw new Error('invalid-save: bad pick index');
  }
  if (!isSeatArrayOfCards(state.hands, playerCount)) throw new Error('invalid-save: bad hands');
  if (!Array.isArray(state.pending) || state.pending.length !== playerCount) throw new Error('invalid-save: bad pending');
  if (!state.pending.every((id) => id === null || (Number.isInteger(id) && id >= 0 && id < CARD_COUNT))) {
    throw new Error('invalid-save: bad pending card');
  }
  if (!isSeatArrayOfCards(state.roundCollected, playerCount)) throw new Error('invalid-save: bad round cards');
  if (!isSeatArrayOfCards(state.collected, playerCount)) throw new Error('invalid-save: bad collected cards');
  if (!Array.isArray(state.roundPicks)) throw new Error('invalid-save: bad round picks');
  if (!Array.isArray(state.rounds)) throw new Error('invalid-save: bad rounds');
  if (!Array.isArray(state.revealed)) throw new Error('invalid-save: bad reveal');
  if (!Array.isArray(state.deals) || state.deals.length !== ROUNDS) throw new Error('invalid-save: bad deals');
  if (!state.deals.every((round) => isSeatArrayOfCards(round, playerCount, HAND_SIZE))) {
    throw new Error('invalid-save: bad deal hands');
  }
  if (!Array.isArray(state.crowns)) throw new Error('invalid-save: bad crowns');
  if (!Array.isArray(state.lastEvents)) throw new Error('invalid-save: bad events');
  if (state.passDirection !== 'left' && state.passDirection !== 'right') {
    throw new Error('invalid-save: bad pass direction');
  }
  const restored = state as GameState;
  const issues = invariants(restored);
  if (issues.length > 0) {
    throw new Error(`invalid-save: ${issues.join('; ')}`);
  }
  return restored;
}

function expectedRoundPicks(state: GameState): number {
  if (state.phase === 'reveal') return state.pickIndex + 1;
  if (state.phase === 'round-end' || state.phase === 'ended') return PICKS_PER_ROUND;
  return state.pickIndex;
}

function expectedCollected(state: GameState, seat: number): number {
  if (state.phase === 'ended') return ROUNDS * PICKS_PER_ROUND;
  if (state.phase === 'round-end') return state.round * PICKS_PER_ROUND;
  return (state.round - 1) * PICKS_PER_ROUND + state.roundCollected[seat].length;
}

export function invariants(state: GameState): string[] {
  const issues: string[] = [];
  if (state.version !== 1) issues.push('version is not 1');
  if (!state.config || !isPlayerCount(state.config.playerCount)) {
    issues.push('invalid player count');
    return issues;
  }
  const n = state.config.playerCount;
  if (!Array.isArray(state.config.seats) || state.config.seats.length !== n) {
    issues.push('seat count mismatch');
    return issues;
  }
  if (!PHASES.includes(state.phase)) issues.push('invalid phase');
  if (state.round !== 1 && state.round !== 2 && state.round !== 3) issues.push('invalid round');
  if (!Number.isInteger(state.pickIndex) || state.pickIndex < 0 || state.pickIndex > PICKS_PER_ROUND) {
    issues.push('invalid pick index');
  }
  if (state.passDirection !== (state.round === 2 ? 'right' : 'left') && state.phase !== 'ended') {
    issues.push('pass direction does not match round');
  }
  if (!Array.isArray(state.hands) || state.hands.length !== n) {
    issues.push('hands length');
    return issues;
  }
  if (!Array.isArray(state.pending) || state.pending.length !== n) issues.push('pending length');
  if (!Array.isArray(state.roundCollected) || state.roundCollected.length !== n) issues.push('roundCollected length');
  if (!Array.isArray(state.collected) || state.collected.length !== n) issues.push('collected length');
  if (!Array.isArray(state.deals) || state.deals.length !== ROUNDS) issues.push('deals length');
  if (issues.length > 0) return issues;

  const expectedHand =
    state.phase === 'choosing'
      ? PICKS_PER_ROUND - state.pickIndex
      : state.phase === 'reveal'
        ? PICKS_PER_ROUND - state.pickIndex - 1
        : 0;
  for (let seat = 0; seat < n; seat++) {
    const hand = state.hands[seat];
    if (!Array.isArray(hand) || !isCardArray(hand)) issues.push(`bad hand ${seat}`);
    else if (hand.length !== expectedHand) issues.push(`hand ${seat} length ${hand.length}, expected ${expectedHand}`);
    if (!isCardArray(state.roundCollected[seat])) issues.push(`bad round cards ${seat}`);
    if (!isCardArray(state.collected[seat])) issues.push(`bad collected cards ${seat}`);
    if (state.collected[seat].length !== expectedCollected(state, seat)) {
      issues.push(`collected ${seat} length ${state.collected[seat].length}, expected ${expectedCollected(state, seat)}`);
    }
    const current = state.roundCollected[seat] ?? [];
    const collected = state.collected[seat] ?? [];
    if (current.length > collected.length || current.some((id, index) => collected[collected.length - current.length + index] !== id)) {
      issues.push(`round cards ${seat} are not the tail of collected`);
    }
    const pending = state.pending[seat];
    if (pending !== null) {
      if (state.phase === 'choosing' && !hand.includes(pending)) {
        issues.push(`pending card ${seat} not in hand`);
      }
      if (state.phase === 'reveal' && !state.roundCollected[seat].includes(pending)) {
        issues.push(`pending card ${seat} not in round cards`);
      }
    }
  }

  if (state.phase === 'choosing') {
    if (state.pending.some((id) => id !== null) && state.pending.every((id) => id !== null)) {
      issues.push('all picks filled but phase is choosing');
    }
    if (state.revealed.length !== 0) issues.push('revealed should be empty while choosing');
  } else if (state.phase === 'reveal') {
    if (state.pending.some((id) => id === null)) issues.push('reveal with missing picks');
    if (state.revealed.length !== n) issues.push('reveal length');
    const pendingPicks = state.pending.map((cardId, seat) => `${seat}:${String(cardId)}`).join(',');
    const revealed = state.revealed.map((pick) => `${pick.seat}:${pick.cardId}`).join(',');
    if (pendingPicks !== revealed) issues.push('revealed does not match pending picks');
  } else if (state.pending.some((id) => id !== null)) {
    issues.push('pending should be empty outside choosing/reveal');
  }

  if (!Array.isArray(state.roundPicks)) issues.push('roundPicks not an array');
  else if (state.roundPicks.length !== expectedRoundPicks(state)) {
    issues.push(`roundPicks length ${state.roundPicks.length}, expected ${expectedRoundPicks(state)}`);
  }
  for (const group of state.roundPicks) {
    if (!Array.isArray(group) || group.length !== n) issues.push('bad pick group');
    for (const pick of group) {
      if (!pick || !Number.isInteger(pick.seat) || pick.seat < 0 || pick.seat >= n) issues.push('bad pick seat');
      if (!Number.isInteger(pick.cardId) || pick.cardId < 0 || pick.cardId >= CARD_COUNT) issues.push('bad pick card');
    }
  }

  const expectedRounds = state.phase === 'round-end' || state.phase === 'ended' ? state.round : state.round - 1;
  if (state.rounds.length !== expectedRounds) {
    issues.push(`rounds length ${state.rounds.length}, expected ${expectedRounds}`);
  }
  for (const round of state.rounds) {
    if (round.picks.length !== PICKS_PER_ROUND) issues.push(`round ${round.round} pick count`);
    if (round.breakdowns.length !== n) issues.push(`round ${round.round} breakdown count`);
    for (const pick of round.picks.flat()) {
      if (!pick || pick.seat < 0 || pick.seat >= n || pick.cardId < 0 || pick.cardId >= CARD_COUNT) {
        issues.push(`round ${round.round} bad pick`);
      }
    }
    for (const breakdown of round.breakdowns) {
      if (breakdown.total < 0) issues.push(`round ${round.round} negative score`);
      for (const combo of breakdown.combos) {
        if (!DESSERT_IDS.includes(combo.dessert)) issues.push(`round ${round.round} bad combo dessert`);
        if (combo.cards.length < 2) issues.push(`round ${round.round} short combo`);
      }
      if (breakdown.sampler && breakdown.sampler.cards.length !== 3) {
        issues.push(`round ${round.round} sampler length`);
      }
    }
  }

  // Within the current round no copy can exist twice. Across rounds the deck is
  // reshuffled, so the same card id may legitimately appear again.
  const seen = new Set<number>();
  for (let seat = 0; seat < n; seat++) {
    for (const id of [...state.hands[seat], ...state.roundCollected[seat]]) {
      if (seen.has(id)) issues.push(`duplicate card ${id} in play`);
      seen.add(id);
    }
  }
  for (const round of state.rounds) {
    const ids = round.picks.flat().map((pick) => pick.cardId);
    if (new Set(ids).size !== ids.length) issues.push(`round ${round.round} has duplicate picks`);
  }

  // Current round's dealt cards must equal hands + current-round collected.
  if (state.deals.length === ROUNDS) {
    const deal = state.deals[state.round - 1];
    if (!deal || deal.length !== n) issues.push('current deal missing');
    else {
      const inPlay = new Set<number>([...state.hands.flat(), ...state.roundCollected.flat()]);
      const dealt = new Set<number>(deal.flat());
      if (inPlay.size !== dealt.size || [...dealt].some((id) => !inPlay.has(id))) {
        issues.push('current round cards do not match the deal');
      }
    }
    for (let r = 0; r < ROUNDS; r++) {
      const flat = state.deals[r].flat();
      if (flat.length !== n * HAND_SIZE) issues.push(`deal ${r + 1} length`);
      if (new Set(flat).size !== flat.length) issues.push(`deal ${r + 1} contains duplicates`);
      if (flat.some((id) => !Number.isInteger(id) || id < 0 || id >= CARD_COUNT)) {
        issues.push(`deal ${r + 1} card out of range`);
      }
    }
  }

  if (state.phase === 'ended') {
    const computed = computeCrowns(state.collected);
    const stored = [...state.crowns].sort((a, b) => DESSERT_IDS.indexOf(a.dessert) - DESSERT_IDS.indexOf(b.dessert));
    const expected = [...computed].sort((a, b) => DESSERT_IDS.indexOf(a.dessert) - DESSERT_IDS.indexOf(b.dessert));
    if (JSON.stringify(stored) !== JSON.stringify(expected)) issues.push('crowns do not match collected cards');
  } else if (state.crowns.length > 0) {
    issues.push('crowns exist before the game ended');
  }

  for (const row of score(state)) {
    if (row.total < 0) issues.push(`negative score for seat ${row.seat}`);
    if (row.cards !== state.collected[row.seat].length) issues.push(`score card count mismatch for seat ${row.seat}`);
  }

  return issues;
}

export function replay(config: GameConfig, moves: readonly Move[]): GameState {
  let state = setupFromSeed(config);
  for (const move of moves) {
    const out = apply(state, move);
    if (!out.ok) throw new Error(`illegal replay move: ${out.reason}`);
    state = out.state;
  }
  return state;
}

export function errorTextKey(reason: ErrorCode): string {
  return `error.${reason}`;
}

export function hintReasonKey(key: string): string {
  return key;
}

export type {
  ApplyResult,
  Combo,
  Crown,
  DessertId,
  GameConfig,
  GameResult,
  GameState,
  GameView,
  Move,
  Pick,
  RoundBreakdown,
  ScoreRow,
};
