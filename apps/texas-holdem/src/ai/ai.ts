/**
 * Four no-limit Hold'em opponents.
 *
 * Every level sees only its own hole cards, the public board, public stacks and
 * public betting. Equity is estimated by sampling unseen cards, never by reading
 * another seat's hand or the deck. Bluffs are deliberate and level-dependent.
 */

import {
  legalActions,
  makeRng,
  makeDeck,
  scoreCards,
  totalPot,
  type Action,
  type ActionOptions,
  type Card,
  type GameState,
  type Rng,
} from '../game/texas-holdem';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'strong-hand'
  | 'pot-odds'
  | 'position'
  | 'stack-pressure'
  | 'bluff'
  | 'weak-hand'
  | 'check'
  | 'call'
  | 'all-in'
  | 'value';

export interface AiDecision {
  action: Action;
  reason: HintReason;
  equity: number;
  potOdds: number;
  samples: number;
}

interface LevelProfile {
  samples: number;
  aggression: number;
  bluff: number;
  looseness: number;
  mistake: number;
  valueMargin: number;
}

const PROFILES: Record<AiLevel, LevelProfile> = {
  companion: {
    samples: 40,
    aggression: 0.16,
    bluff: 0.01,
    looseness: 0.14,
    mistake: 0.05,
    valueMargin: 0.1,
  },
  easy: {
    samples: 60,
    aggression: 0.3,
    bluff: 0.04,
    looseness: 0.06,
    mistake: 0.22,
    valueMargin: 0.12,
  },
  normal: {
    samples: 110,
    aggression: 0.46,
    bluff: 0.09,
    looseness: 0.0,
    mistake: 0.04,
    valueMargin: 0.07,
  },
  hard: {
    samples: 180,
    aggression: 0.54,
    bluff: 0.13,
    looseness: -0.01,
    mistake: 0,
    valueMargin: 0.05,
  },
};

function activeOpponents(state: GameState, seat: number): number[] {
  return state.players
    .map((player, index) => (!player.folded && index !== seat ? index : -1))
    .filter((index) => index >= 0);
}

export function estimateEquity(
  state: GameState,
  seat: number,
  samples: number,
  rng: Rng,
): number {
  const player = state.players[seat];
  if (!player || player.hand.length !== 2) return 0;
  const opponents = activeOpponents(state, seat);
  if (opponents.length === 0) return 1;

  const known = new Set([...player.hand, ...state.board].map((card) => `${card.rank}${card.suit}`));
  const unknown = makeDeck().filter((card) => !known.has(`${card.rank}${card.suit}`));
  const boardNeed = 5 - state.board.length;
  const need = opponents.length * 2 + boardNeed;
  let equity = 0;
  let counted = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    let enough = true;
    for (let index = 0; index < need; index += 1) {
      const j = index + Math.floor(rng() * (unknown.length - index));
      const value = Math.min(unknown.length - 1, Math.max(index, j));
      [unknown[index], unknown[value]] = [unknown[value], unknown[index]];
    }
    if (unknown.length < need) {
      enough = false;
    }
    if (!enough) break;
    let cursor = 0;
    const opponentHands: Card[][] = [];
    for (let index = 0; index < opponents.length; index += 1) {
      opponentHands.push([unknown[cursor], unknown[cursor + 1]]);
      cursor += 2;
    }
    const runout = unknown.slice(cursor, cursor + boardNeed);
    const fullBoard = [...state.board, ...runout];
    const mine = scoreCards([...player.hand, ...fullBoard]);
    let bestOpponent = -1;
    let ties = 0;
    for (const hole of opponentHands) {
      const score = scoreCards([...hole, ...fullBoard]);
      if (score > bestOpponent) {
        bestOpponent = score;
        ties = 1;
      } else if (score === bestOpponent) {
        ties += 1;
      }
    }
    if (mine > bestOpponent) equity += 1;
    else if (mine === bestOpponent) equity += 1 / (ties + 1);
    counted += 1;
  }

  return counted > 0 ? equity / counted : 0;
}

function positionValue(state: GameState, seat: number): number {
  const live = state.players
    .map((player, index) => (!player.folded ? index : -1))
    .filter((index) => index >= 0);
  if (live.length === 0) return 0.5;
  const count = state.players.length;
  const order: number[] = [];
  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = (state.button + offset) % count;
    if (live.includes(candidate)) order.push(candidate);
  }
  const index = order.indexOf(seat);
  if (index < 0) return 0.5;
  return 1 - index / order.length;
}

function targetForRaise(
  state: GameState,
  options: ActionOptions,
  fraction: number,
  pot: number,
): number {
  if (!options.canBet && !options.canRaise) return options.maxTo;
  if (options.canBet) {
    const raw = Math.round(pot * fraction);
    return Math.max(options.minBetTo, Math.min(options.maxTo, raw));
  }
  const raw = state.currentBet + Math.max(state.minRaise, Math.round(pot * fraction));
  return Math.max(options.minRaiseTo, Math.min(options.maxTo, raw));
}

function aggressiveAction(
  options: ActionOptions,
  target: number,
  canOpen: boolean,
): Action {
  if (!options.canBet && !options.canRaise) {
    return options.canAllIn ? { type: 'all-in' } : { type: 'call' };
  }
  if (target >= options.maxTo && options.canAllIn) {
    return { type: 'all-in' };
  }
  if (canOpen && options.canBet) {
    return {
      type: 'bet',
      amount: Math.max(options.minBetTo, Math.min(options.maxTo, Math.round(target))),
    };
  }
  if (options.canRaise) {
    return {
      type: 'raise',
      amount: Math.max(options.minRaiseTo, Math.min(options.maxTo, Math.round(target))),
    };
  }
  return options.canCall ? { type: 'call' } : { type: 'check' };
}

function randomLegalAction(options: ActionOptions, rng: Rng): Action {
  const choices: Action[] = [];
  if (options.canCheck) choices.push({ type: 'check' });
  if (options.canCall) choices.push({ type: 'call' });
  if (options.canBet) choices.push({ type: 'bet', amount: options.minBetTo });
  if (options.canRaise) choices.push({ type: 'raise', amount: options.minRaiseTo });
  if (options.canAllIn) choices.push({ type: 'all-in' });
  choices.push({ type: 'fold' });
  return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
}

export function chooseAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): AiDecision {
  const profile = PROFILES[level];
  const options = legalActions(state, seat);
  const player = state.players[seat];
  if (!options.canFold || !player) {
    return {
      action: { type: 'fold' },
      reason: 'weak-hand',
      equity: 0,
      potOdds: 0,
      samples: 0,
    };
  }
  const pot = totalPot(state);
  const potOdds = options.callAmount > 0 ? options.callAmount / (pot + options.callAmount) : 0;
  const equity = estimateEquity(state, seat, profile.samples, rng);
  const opponents = activeOpponents(state, seat).length;
  const position = positionValue(state, seat);
  const stackPressure = player.stack / Math.max(1, pot);
  const strong = equity >= Math.min(0.88, 0.58 + opponents * 0.04);
  const value = equity >= Math.max(0.5, 0.45 + opponents * 0.035);
  const shortStack = stackPressure < 0.9;

  if (level === 'easy' && rng() < profile.mistake) {
    const mistake = randomLegalAction(options, rng);
    return {
      action: mistake,
      reason: mistake.type === 'fold' ? 'weak-hand' : 'call',
      equity,
      potOdds,
      samples: profile.samples,
    };
  }

  if (options.canCheck) {
    if (options.canBet) {
      if (strong && rng() < 0.82) {
        const target = shortStack
          ? options.maxTo
          : targetForRaise(state, options, 0.62, pot);
        return {
          action: aggressiveAction(options, target, true),
          reason: shortStack ? 'stack-pressure' : 'strong-hand',
          equity,
          potOdds,
          samples: profile.samples,
        };
      }
      if (value && rng() < profile.aggression * (0.6 + position * 0.5)) {
        const target = targetForRaise(state, options, 0.42, pot);
        return {
          action: aggressiveAction(options, target, true),
          reason: 'value',
          equity,
          potOdds,
          samples: profile.samples,
        };
      }
      const bluffChance = profile.bluff * (0.55 + position * 1.3);
      if (opponents <= 2 && rng() < bluffChance) {
        const target = targetForRaise(state, options, 0.5, pot);
        return {
          action: aggressiveAction(options, target, true),
          reason: 'bluff',
          equity,
          potOdds,
          samples: profile.samples,
        };
      }
    }
    return {
      action: { type: 'check' },
      reason: value ? 'position' : 'check',
      equity,
      potOdds,
      samples: profile.samples,
    };
  }

  const raiseThreshold = Math.max(0.52, 0.48 + opponents * 0.045);
  const canPressure = options.canRaise || (options.canAllIn && options.allInIsRaise);
  if (canPressure && equity >= raiseThreshold) {
    const chance = profile.aggression + (strong ? 0.25 : 0);
    if (rng() < chance) {
      const target = shortStack
        ? options.maxTo
        : targetForRaise(state, options, strong ? 0.8 : 0.55, pot);
      return {
        action: aggressiveAction(options, target, false),
        reason: shortStack ? 'stack-pressure' : strong ? 'strong-hand' : 'value',
        equity,
        potOdds,
        samples: profile.samples,
      };
    }
  }

  if (canPressure && opponents <= 2 && position > 0.55) {
    const bluffChance = profile.bluff * (0.45 + position);
    if (options.callAmount <= Math.max(1, pot * 0.35) && rng() < bluffChance) {
      const target = targetForRaise(state, options, 0.75, pot);
      return {
        action: aggressiveAction(options, target, false),
        reason: 'bluff',
        equity,
        potOdds,
        samples: profile.samples,
      };
    }
  }

  const callThreshold = potOdds + profile.valueMargin - profile.looseness;
  if (equity >= callThreshold) {
    return {
      action: options.canCall ? { type: 'call' } : { type: 'check' },
      reason: 'pot-odds',
      equity,
      potOdds,
      samples: profile.samples,
    };
  }
  if (shortStack && equity >= potOdds - 0.05 && options.canCall) {
    return {
      action: { type: 'call' },
      reason: 'stack-pressure',
      equity,
      potOdds,
      samples: profile.samples,
    };
  }
  return {
    action: { type: 'fold' },
    reason: 'weak-hand',
    equity,
    potOdds,
    samples: profile.samples,
  };
}

/** A deterministic, legal, reasoned recommendation for the human seat. */
export function hintFor(state: GameState, seat: number): AiDecision {
  const seed =
    (state.version * 2654435761 + seat * 40503 + state.handNumber * 7919 + state.button) >>> 0;
  return chooseAction(state, seat, 'hard', makeRng(seed));
}

export { makeRng };
