import {
  BALLOONS,
  BALLOON_COUNT,
  COURSE,
  ROUNDS,
  SCORING,
  TAILWIND_PER_PLAYER,
  TRACK_LENGTH,
  WIND_CARDS,
} from './data';
import { shuffled, type Rng } from './rng';
import type {
  ApplyResult,
  ErrorCode,
  GameConfig,
  GameResult,
  GameState,
  GameView,
  Move,
  RoundRecord,
  ScoreRow,
} from './types';

function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config, seats: state.config.seats.map((s) => ({ ...s })) },
    positions: [...state.positions],
    supports: [...state.supports],
    tailwinds: [...state.tailwinds],
    tokensLeft: [...state.tokensLeft],
    windPlan: state.windPlan.map((row) => [...row]),
    history: state.history.map((r) => ({
      ...r,
      supports: [...r.supports],
      tailwinds: [...r.tailwinds],
      wind: [...r.wind],
      positionsBefore: [...r.positionsBefore],
      positionsAfter: [...r.positionsAfter],
      leaders: [...r.leaders],
      seconds: [...r.seconds],
      points: [...r.points],
      overallLeaders: r.overallLeaders ? [...r.overallLeaders] : null,
      overallPoints: r.overallPoints ? [...r.overallPoints] : null,
    })),
    moves: state.moves.map((m) => ({ ...m })),
    overallLeaders: [...state.overallLeaders],
  };
}

export function setup(config: GameConfig, rng: Rng): GameState {
  if (!Number.isInteger(config.playerCount) || config.playerCount < 2 || config.playerCount > 6) {
    throw new Error('playerCount must be between 2 and 6');
  }
  if (config.seats.length !== config.playerCount) throw new Error('seat count mismatch');
  if (!config.seats.some((s) => s.kind === 'human')) {
    throw new Error('at least one human seat is required');
  }

  const seats = config.seats.map((seat, index) => {
    const name = seat.name.trim().slice(0, 20) || `Player ${index + 1}`;
    return { ...seat, name };
  });

  return {
    version: 1,
    config: { ...config, seats },
    round: 1,
    phase: 'support',
    current: 0,
    positions: BALLOONS.map(() => 0),
    supports: seats.map(() => null),
    tailwinds: seats.map(() => false),
    tokensLeft: seats.map(() => TAILWIND_PER_PLAYER),
    windPlan: Array.from({ length: ROUNDS }, () => shuffled(WIND_CARDS, rng)),
    history: [],
    moves: [],
    overallLeaders: [],
  };
}

function error(reason: ErrorCode): ApplyResult {
  return { ok: false, reason };
}

export function legalMoves(state: GameState, seat: number): Move[] {
  if (state.phase === 'ended') return [];
  if (state.phase === 'summary') return [{ kind: 'advance' }];
  if (state.current !== seat) return [];
  if (seat < 0 || seat >= state.config.playerCount) return [];
  const out: Move[] = [];
  for (let balloon = 0; balloon < BALLOON_COUNT; balloon++) {
    out.push({ kind: 'support', seat, balloon, tailwind: false });
    if (state.tokensLeft[seat] > 0) {
      out.push({ kind: 'support', seat, balloon, tailwind: true });
    }
  }
  return out;
}

function resolveRound(state: GameState): void {
  const roundIndex = state.round - 1;
  const wind = state.windPlan[roundIndex];
  if (!wind) throw new Error('missing wind assignment');
  const supports = state.supports.map((s) => s ?? 0);
  const positionsBefore = [...state.positions];
  const positionsAfter = state.positions.map((position, balloon) => {
    const tailwinds = state.tailwinds.reduce(
      (count, spent, seat) => count + (spent && supports[seat] === balloon ? 1 : 0),
      0,
    );
    return Math.min(TRACK_LENGTH, position + wind[balloon] + tailwinds);
  });

  const max = Math.max(...positionsAfter);
  const leaders = positionsAfter.map((p, i) => (p === max ? i : -1)).filter((i) => i >= 0);
  let second = -1;
  for (const p of positionsAfter) if (p < max && p > second) second = p;
  const seconds = second < 0 ? [] : positionsAfter.map((p, i) => (p === second ? i : -1)).filter((i) => i >= 0);

  const points = state.config.seats.map((_, seat) => {
    const supported = supports[seat];
    if (leaders.includes(supported)) return SCORING.roundLeader;
    if (seconds.includes(supported)) return SCORING.roundSecond;
    return 0;
  });

  const isFinalRound = state.round === ROUNDS;
  const overallLeaders = isFinalRound ? leadersOf(positionsAfter) : null;
  const overallPoints = isFinalRound
    ? state.config.seats.map((_, seat) => (overallLeaders?.includes(supports[seat]) ? SCORING.overallLeader : 0))
    : null;

  const record: RoundRecord = {
    round: state.round,
    supports,
    tailwinds: [...state.tailwinds],
    wind: [...wind],
    positionsBefore,
    positionsAfter,
    leaders,
    seconds,
    points,
    overallLeaders,
    overallPoints,
  };

  state.positions = positionsAfter;
  state.history.push(record);
  state.overallLeaders = overallLeaders ? [...overallLeaders] : [];
  state.phase = 'summary';
  state.current = -1;
}

function leadersOf(positions: number[]): number[] {
  const max = Math.max(...positions);
  return positions.map((p, i) => (p === max ? i : -1)).filter((i) => i >= 0);
}

export function apply(state: GameState, move: Move): ApplyResult {
  if (!state || !move || (move.kind !== 'support' && move.kind !== 'advance')) {
    return error('bad-move');
  }
  if (state.phase === 'ended') return error('game-over');

  if (move.kind === 'support') {
    if (state.phase !== 'support') return error('wrong-phase');
    if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= state.config.playerCount) {
      return error('bad-seat');
    }
    if (move.seat !== state.current) return error('not-your-turn');
    if (!Number.isInteger(move.balloon) || move.balloon < 0 || move.balloon >= BALLOON_COUNT) {
      return error('bad-balloon');
    }
    if (state.supports[move.seat] !== null) return error('already-supported');
    if (typeof move.tailwind !== 'boolean') return error('bad-move');
    if (move.tailwind && state.tokensLeft[move.seat] <= 0) return error('no-tailwind');

    const next = cloneState(state);
    next.supports[move.seat] = move.balloon;
    next.tailwinds[move.seat] = move.tailwind;
    next.moves.push({ ...move });
    if (move.tailwind) next.tokensLeft[move.seat] -= 1;
    if (move.seat === next.config.playerCount - 1) resolveRound(next);
    else next.current = move.seat + 1;
    return { ok: true, state: next };
  }

  if (state.phase !== 'summary') return error('wrong-phase');
  const next = cloneState(state);
  next.moves.push({ kind: 'advance' });
  if (state.round >= ROUNDS) {
    next.phase = 'ended';
    next.current = -1;
  } else {
    next.round = state.round + 1;
    next.phase = 'support';
    next.current = 0;
    next.supports = next.config.seats.map(() => null);
    next.tailwinds = next.config.seats.map(() => false);
  }
  return { ok: true, state: next };
}

function scoresRaw(state: GameState): ScoreRow[] {
  const rows = state.config.seats.map((seat, index) => {
    const roundPoints = state.history.reduce((sum, r) => sum + (r.points[index] ?? 0), 0);
    const overallPoints = state.history.reduce((sum, r) => sum + (r.overallPoints?.[index] ?? 0), 0);
    const tailwindPoints = state.tokensLeft[index];
    const correctSupports = state.history.filter((r) => r.leaders.includes(r.supports[index])).length;
    return {
      seat: index,
      name: seat.name,
      roundPoints,
      overallPoints,
      tailwindPoints,
      total: roundPoints + overallPoints + tailwindPoints,
      correctSupports,
      tokensLeft: state.tokensLeft[index],
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.correctSupports !== a.correctSupports) return b.correctSupports - a.correctSupports;
    if (b.tokensLeft !== a.tokensLeft) return b.tokensLeft - a.tokensLeft;
    return a.seat - b.seat;
  });

  let rank = 0;
  let previous: ScoreRow | null = null;
  rows.forEach((row, index) => {
    if (
      !previous ||
      row.total !== previous.total ||
      row.correctSupports !== previous.correctSupports ||
      row.tokensLeft !== previous.tokensLeft
    ) {
      rank = index + 1;
    }
    row.rank = rank;
    previous = row;
  });
  return rows;
}

export function score(state: GameState): ScoreRow[] {
  return scoresRaw(state);
}

export function result(state: GameState): GameResult | null {
  if (state.phase !== 'ended') return null;
  const ranking = scoresRaw(state);
  return {
    winners: ranking.filter((r) => r.rank === 1).map((r) => r.seat),
    reason: 'four-rounds',
    ranking,
  };
}

export function view(state: GameState, seat: number | null): GameView {
  const mySeat =
    seat !== null && Number.isInteger(seat) && seat >= 0 && seat < state.config.playerCount ? seat : null;
  const history = state.history.map((r) => ({
    ...r,
    supports: [...r.supports],
    tailwinds: [...r.tailwinds],
    wind: [...r.wind],
    positionsBefore: [...r.positionsBefore],
    positionsAfter: [...r.positionsAfter],
    leaders: [...r.leaders],
    seconds: [...r.seconds],
    points: [...r.points],
    overallLeaders: r.overallLeaders ? [...r.overallLeaders] : null,
    overallPoints: r.overallPoints ? [...r.overallPoints] : null,
  }));
  return {
    version: 1,
    phase: state.phase,
    round: state.round,
    current: state.current,
    playerCount: state.config.playerCount,
    seats: state.config.seats.map((s, i) => ({ seat: i, name: s.name, kind: s.kind, level: s.level })),
    positions: [...state.positions],
    tokensLeft: [...state.tokensLeft],
    submitted: state.supports.map((s) => s !== null),
    mySeat,
    mySupport: mySeat === null ? null : state.supports[mySeat],
    myTailwind: mySeat === null ? false : state.tailwinds[mySeat],
    canTailwind: mySeat !== null && state.tokensLeft[mySeat] > 0,
    balloons: BALLOONS,
    trackLength: TRACK_LENGTH,
    rounds: ROUNDS,
    history,
    overallLeaders: [...state.overallLeaders],
    scores: scoresRaw(state),
    winners:
      state.phase === 'ended'
        ? scoresRaw(state)
            .filter((r) => r.rank === 1)
            .map((r) => r.seat)
        : [],
    lastRound: history.length ? history[history.length - 1] : null,
  };
}

export function invariants(state: GameState): string[] {
  const errors: string[] = [];
  const n = state.config.playerCount;
  const seats = state.config.seats.length;
  if (seats !== n) errors.push(`seat count ${seats} != playerCount ${n}`);
  if (n < 2 || n > 6) errors.push('playerCount out of range');
  if (!state.config.seats.some((seat) => seat.kind === 'human')) errors.push('no human seat');
  if (state.positions.length !== BALLOON_COUNT) errors.push('positions length');
  if (state.supports.length !== n) errors.push('supports length');
  if (state.tailwinds.length !== n) errors.push('tailwinds length');
  if (state.tokensLeft.length !== n) errors.push('tokens length');
  if (state.windPlan.length !== ROUNDS) errors.push('windPlan rounds');
  if (state.history.length > ROUNDS) errors.push('too much history');

  for (const p of state.positions) {
    if (!Number.isInteger(p) || p < 0 || p > TRACK_LENGTH) errors.push(`bad position ${p}`);
  }
  const deckKey = [...WIND_CARDS].sort().join(',');
  state.windPlan.forEach((row, index) => {
    if (row.length !== BALLOON_COUNT) errors.push(`wind row ${index} length`);
    if (row.some((v) => !Number.isInteger(v) || v < 1 || v > 3)) errors.push(`wind row ${index} values`);
    if ([...row].sort().join(',') !== deckKey) errors.push(`wind row ${index} is not the deck`);
  });

  for (let seat = 0; seat < n; seat++) {
    const tokens = state.tokensLeft[seat];
    if (!Number.isInteger(tokens) || tokens < 0 || tokens > TAILWIND_PER_PLAYER) {
      errors.push(`seat ${seat} tokens ${tokens}`);
    }
    const spentInHistory = state.history.filter((r) => r.tailwinds[seat]).length;
    const pendingSpent =
      state.phase === 'support' && state.supports[seat] !== null && state.tailwinds[seat] ? 1 : 0;
    if (TAILWIND_PER_PLAYER - tokens !== spentInHistory + pendingSpent) {
      errors.push(`seat ${seat} tailwind conservation`);
    }
  }

  state.history.forEach((record, index) => {
    if (record.round !== index + 1) errors.push(`history round ${record.round} at ${index}`);
    if (record.supports.length !== n) errors.push(`history ${index} supports length`);
    if (record.wind.length !== BALLOON_COUNT) errors.push(`history ${index} wind length`);
    if (record.points.length !== n) errors.push(`history ${index} points length`);
    for (let b = 0; b < BALLOON_COUNT; b++) {
      const tails = record.supports.reduce(
        (count, supported, seat) => count + (supported === b && record.tailwinds[seat] ? 1 : 0),
        0,
      );
      const expected = Math.min(TRACK_LENGTH, record.positionsBefore[b] + record.wind[b] + tails);
      if (record.positionsAfter[b] !== expected) errors.push(`history ${index} move for balloon ${b}`);
    }
    if (record.leaders.length === 0) errors.push(`history ${index} no leader`);
  });

  if (state.history.length) {
    const last = state.history[state.history.length - 1];
    if (last.positionsAfter.join(',') !== state.positions.join(',')) errors.push('positions drift');
  }

  if (state.phase === 'support') {
    if (state.current < 0 || state.current >= n) errors.push('bad current seat');
    for (let seat = 0; seat < n; seat++) {
      if (seat < state.current && state.supports[seat] === null) errors.push(`seat ${seat} should have chosen`);
      if (seat >= state.current && state.supports[seat] !== null) errors.push(`seat ${seat} should not have chosen`);
    }
    if (state.round < 1 || state.round > ROUNDS) errors.push('round out of range');
    if (state.history.length !== state.round - 1) errors.push('history length != round - 1');
  } else if (state.phase === 'summary') {
    if (state.current !== -1) errors.push('summary current != -1');
    if (state.supports.some((s) => s === null)) errors.push('summary has empty support');
    if (state.history.length !== state.round) errors.push('summary history length');
  } else if (state.phase === 'ended') {
    if (state.current !== -1) errors.push('ended current != -1');
    if (state.round !== ROUNDS) errors.push('ended before round 4');
    if (state.history.length !== ROUNDS) errors.push('ended history length');
    if (state.overallLeaders.length === 0) errors.push('ended without overall leader');
    if (!result(state)) errors.push('ended without result');
  } else {
    errors.push('unknown phase');
  }

  for (const row of scoresRaw(state)) {
    if (row.total < 0) errors.push(`negative score for seat ${row.seat}`);
    if (row.tailwindPoints !== state.tokensLeft[row.seat]) errors.push('tailwind points drift');
  }
  if (state.history.some((r) => r.supports.some((s) => s < 0 || s >= BALLOON_COUNT))) {
    errors.push('bad support balloon');
  }
  return errors;
}

export function errorTextKey(reason: ErrorCode): string {
  return `error.${reason}`;
}

export { COURSE };
