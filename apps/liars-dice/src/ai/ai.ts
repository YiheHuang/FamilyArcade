/**
 * Four Liar's Dice opponents.
 *
 * Every level sees only its own dice, public dice counts, public bids and public
 * behavioural counters. Hard samples a probability distribution of unseen dice
 * using bids as evidence; it never reads another seat's actual dice. All
 * decisions are deterministic with the injected RNG.
 */
import {
  bidOptions,
  countFace,
  totalDice,
  type Bid,
  type BidValue,
  type GameState,
  type PlayerAction,
} from '../game/liars-dice';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

export interface BidEstimate {
  trueChance: number;
  exactChance: number;
  expected: number;
  known: number;
  unknown: number;
}

export type HintKind =
  | 'safe'
  | 'pressure'
  | 'risk'
  | 'challenge'
  | 'read'
  | 'spot';

export interface Hint {
  action: PlayerAction;
  kind: HintKind;
  /** Chance the suggested bid is true, or chance the call succeeds. */
  chance: number;
  /** Expected matching dice at the table, useful in the reason line. */
  expected: number;
  quantity?: number;
  face?: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bluffRate(state: GameState, seat: number): number {
  const tendency = state.tendencies[seat];
  if (!tendency || tendency.bids === 0) return 0.18;
  return clamp01(tendency.falseBids / Math.max(1, tendency.bids));
}

function challengeRate(state: GameState, seat: number): number {
  const tendency = state.tendencies[seat];
  if (!tendency) return 0.2;
  return clamp01(tendency.challenges / Math.max(1, tendency.bids + tendency.challenges));
}

function matchChance(face: number, onesWild: boolean): number {
  return onesWild && face !== 1 ? 2 / 6 : 1 / 6;
}

/**
 * Build one match probability per unseen die. A player's most recent bid is
 * weak evidence that their own hand contains that face; the evidence shrinks
 * for players who have been caught bluffing.
 */
function unseenProbabilities(
  state: GameState,
  seat: number,
  face: number,
  model: boolean,
): number[] {
  const base = matchChance(face, state.onesWild);
  const probabilities: number[] = [];
  for (let other = 0; other < state.playerCount; other += 1) {
    if (other === seat) continue;
    const handSize = state.dice[other].length;
    if (handSize === 0) continue;
    let evidenceFace = 0;
    let evidenceCount = 0;
    if (model) {
      for (let index = state.bids.length - 1; index >= 0; index -= 1) {
        const entry = state.bids[index];
        if (entry.seat !== other) continue;
        if (entry.face === face) {
          evidenceFace = entry.face;
          evidenceCount += 1;
        }
        break;
      }
    }
    for (let die = 0; die < handSize; die += 1) {
      let chance = base;
      if (evidenceFace === face && die < 2) {
        const trust = 1 - bluffRate(state, other);
        chance = clamp01(base + (0.18 + Math.min(0.08, evidenceCount * 0.03)) * trust);
      }
      probabilities.push(chance);
    }
  }
  return probabilities;
}

function distribution(probabilities: number[]): number[] {
  let dist = [1];
  for (const chance of probabilities) {
    const next = Array.from({ length: dist.length + 1 }, () => 0);
    for (let count = 0; count < dist.length; count += 1) {
      next[count] += dist[count] * (1 - chance);
      next[count + 1] += dist[count] * chance;
    }
    dist = next;
  }
  return dist;
}

export function evaluateBid(
  state: GameState,
  seat: number,
  quantity: number,
  face: number,
  model = false,
): BidEstimate {
  const known = countFace([state.dice[seat] ?? []], face, state.onesWild);
  const probabilities = unseenProbabilities(state, seat, face, model);
  const unknown = probabilities.length;
  const dist = distribution(probabilities);
  const needed = quantity - known;
  let trueChance = 1;
  if (needed > 0) {
    trueChance = 0;
    for (let count = needed; count < dist.length; count += 1) trueChance += dist[count];
  }
  const exactChance =
    needed >= 0 && needed < dist.length
      ? dist[needed]
      : 0;
  const expected =
    known + probabilities.reduce((sum, chance) => sum + chance, 0);
  return {
    trueChance: clamp01(trueChance),
    exactChance: clamp01(exactChance),
    expected,
    known,
    unknown,
  };
}

interface ScoredBid extends BidValue {
  pressure: number;
  estimate: BidEstimate;
  support: number;
}

function scoreOptions(state: GameState, seat: number, model: boolean): ScoredBid[] {
  const supportFace = (face: number) =>
    countFace([state.dice[seat] ?? []], face, state.onesWild);
  return bidOptions(state).map((option) => ({
    ...option,
    pressure: option.quantity * 10 + option.face,
    estimate: evaluateBid(state, seat, option.quantity, option.face, model),
    support: supportFace(option.face),
  }));
}

function pick<T>(items: T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[Math.max(0, index)] ?? null;
}

function bestBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value > bestScore + 1e-9) {
      bestScore = value;
      best = item;
    }
  }
  return best;
}

function safeBid(state: GameState, seat: number, level: AiLevel, rng: Rng): Bid | null {
  const hardModel = level === 'hard';
  const options = scoreOptions(state, seat, hardModel);
  if (options.length === 0) return null;
  const myDice = state.dice[seat]?.length ?? 0;
  const opponents = Array.from({ length: state.playerCount }, (_, item) => item)
    .filter((item) => item !== seat && state.dice[item].length > 0);
  const averageChallenge =
    opponents.length > 0
      ? opponents.reduce((sum, item) => sum + challengeRate(state, item), 0) / opponents.length
      : 0.2;

  const choose = (value: ScoredBid): Bid => ({
    seat,
    quantity: value.quantity,
    face: value.face,
  });

  if (level === 'companion') {
    const safe = options.filter((item) => item.estimate.trueChance >= 0.7);
    if (safe.length > 0) {
      const low = safe.slice().sort(
        (a, b) => a.pressure - b.pressure || a.face - b.face,
      );
      return choose(low[0]);
    }
    const best = bestBy(options, (item) => item.estimate.trueChance - item.pressure * 0.001);
    return best ? choose(best) : null;
  }

  if (level === 'easy') {
    const plausible = options.filter((item) => item.estimate.trueChance >= 0.34);
    const pool = plausible.length > 0 ? plausible : options;
    const random = pick(pool, rng);
    return random ? choose(random) : null;
  }

  if (level === 'normal') {
    const bluffCandidates = options.filter(
      (item) =>
        item.estimate.trueChance >= 0.12 &&
        item.estimate.trueChance <= 0.4 &&
        item.quantity >= Math.max(2, Math.floor(totalDice(state) / 2)),
    );
    if (bluffCandidates.length > 0 && rng() < 0.13) {
      const bluff = bestBy(bluffCandidates, (item) => item.pressure);
      return bluff ? choose(bluff) : null;
    }
    const safe = options.filter((item) => item.estimate.trueChance >= 0.52);
    if (safe.length > 0) {
      const top = safe.slice().sort(
        (a, b) =>
          b.pressure - a.pressure ||
          b.estimate.trueChance - a.estimate.trueChance ||
          b.support - a.support,
      );
      return choose(top[0]);
    }
    const fallback = bestBy(options, (item) => item.estimate.trueChance);
    return fallback ? choose(fallback) : null;
  }

  // Hard: occasional planned bluff, then the strongest bid that survives the
  // table's observed challenge appetite.
  const endgame = myDice <= 2;
  const bluffChance = endgame
    ? 0.07
    : clamp01(0.16 + 0.24 * (1 - averageChallenge));
  const bluffCandidates = options.filter(
    (item) => item.estimate.trueChance >= 0.16 && item.estimate.trueChance <= 0.43,
  );
  if (bluffCandidates.length > 0 && rng() < bluffChance) {
    const bluff = bestBy(
      bluffCandidates,
      (item) => item.pressure + item.estimate.trueChance * 15,
    );
    return bluff ? choose(bluff) : null;
  }
  const threshold = clamp01(0.48 + averageChallenge * 0.2 + (endgame ? 0.08 : 0));
  const safe = options.filter((item) => item.estimate.trueChance >= threshold);
  const pool = safe.length > 0 ? safe : options;
  const best = bestBy(
    pool,
    (item) =>
      item.pressure +
      item.estimate.trueChance * 26 +
      item.support * 3 +
      (safe.length > 0 ? 0 : item.estimate.trueChance * 20),
  );
  return best ? choose(best) : null;
}

export function chooseBid(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): Bid | null {
  if (state.phase !== 'bidding' || state.turn !== seat) return null;
  return safeBid(state, seat, level, rng);
}

export function chooseAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): PlayerAction | null {
  if (state.phase !== 'bidding' || state.turn !== seat) return null;
  if (!state.dice[seat] || state.dice[seat].length === 0) return null;
  const current = state.currentBid;
  if (!current) {
    const choice = safeBid(state, seat, level, rng);
    return choice
      ? { type: 'bid', quantity: choice.quantity, face: choice.face }
      : null;
  }
  if (bidOptions(state).length === 0) return { type: 'challenge' };

  const model = level === 'hard';
  const estimate = evaluateBid(state, seat, current.quantity, current.face, model);
  const risk = 1 - estimate.trueChance;
  const myDice = state.dice[seat].length;
  const bidderBluff = bluffRate(state, current.seat);
  const spotEnabled = state.spotOn;

  if (level === 'companion') {
    if (risk >= 0.8 && rng() < 0.5) return { type: 'challenge' };
    const choice = safeBid(state, seat, level, rng);
    return choice
      ? { type: 'bid', quantity: choice.quantity, face: choice.face }
      : { type: 'challenge' };
  }

  if (level === 'easy') {
    if (spotEnabled && rng() < 0.05) return { type: 'spot-on' };
    if (rng() < 0.28) return { type: 'challenge' };
    const choice = safeBid(state, seat, level, rng);
    return choice
      ? { type: 'bid', quantity: choice.quantity, face: choice.face }
      : { type: 'challenge' };
  }

  if (level === 'normal') {
    if (
      spotEnabled &&
      estimate.exactChance >= 0.2 &&
      estimate.exactChance > risk + 0.02 &&
      rng() < 0.4
    ) {
      return { type: 'spot-on' };
    }
    const riskLine = 0.56 - bidderBluff * 0.16;
    if (risk >= riskLine) return { type: 'challenge' };
    const choice = safeBid(state, seat, level, rng);
    return choice
      ? { type: 'bid', quantity: choice.quantity, face: choice.face }
      : { type: 'challenge' };
  }

  // Hard: protect a short stack, punish a known bluffer, and take a spot-on
  // only when it beats the challenge line.
  let riskLine = 0.6 + (myDice >= 4 ? -0.06 : 0) - bidderBluff * 0.2;
  if (current.quantity >= Math.max(2, Math.ceil(totalDice(state) * 0.75))) {
    riskLine -= 0.04;
  }
  const spotLine = myDice <= 1 ? 0.24 : 0.18;
  if (
    spotEnabled &&
    estimate.exactChance >= spotLine &&
    estimate.exactChance > risk + 0.03
  ) {
    return { type: 'spot-on' };
  }
  if (risk >= riskLine) return { type: 'challenge' };
  const choice = safeBid(state, seat, level, rng);
  return choice
    ? { type: 'bid', quantity: choice.quantity, face: choice.face }
    : { type: 'challenge' };
}

/** A legal, explainable suggestion for the current bidder. */
export function hint(state: GameState, seat: number): Hint | null {
  if (state.phase !== 'bidding' || state.turn !== seat) return null;
  const current = state.currentBid;
  const myDice = state.dice[seat]?.length ?? 0;
  if (myDice === 0) return null;

  if (current) {
    const estimate = evaluateBid(state, seat, current.quantity, current.face, true);
    const risk = 1 - estimate.trueChance;
    const bluff = bluffRate(state, current.seat);
    if (risk >= 0.55) {
      return {
        action: { type: 'challenge' },
        kind: bluff >= 0.3 ? 'read' : 'challenge',
        chance: risk,
        expected: estimate.expected,
      };
    }
    if (
      state.spotOn &&
      estimate.exactChance >= 0.19 &&
      estimate.exactChance > risk + 0.02
    ) {
      return {
        action: { type: 'spot-on' },
        kind: 'spot',
        chance: estimate.exactChance,
        expected: estimate.expected,
      };
    }
  }

  const options = scoreOptions(state, seat, true);
  if (options.length === 0) {
    if (!current) return null;
    const forced = evaluateBid(state, seat, current.quantity, current.face, true);
    return {
      action: { type: 'challenge' },
      kind: 'challenge',
      chance: 1 - forced.trueChance,
      expected: forced.expected,
    };
  }
  const safe = options.filter((item) => item.estimate.trueChance >= 0.58);
  const pool = safe.length > 0 ? safe : options;
  const best = bestBy(
    pool,
    (item) => item.pressure + item.estimate.trueChance * 20 + item.support * 2,
  );
  if (!best) return null;
  const kind: HintKind =
    safe.length === 0 ? 'risk' : best.estimate.trueChance >= 0.72 ? 'safe' : 'pressure';
  return {
    action: { type: 'bid', quantity: best.quantity, face: best.face },
    kind,
    chance: best.estimate.trueChance,
    expected: best.estimate.expected,
    quantity: best.quantity,
    face: best.face,
  };
}

/** A legal action for a connected guest who dropped off the LAN. */
export function fallbackAction(state: GameState, seat: number): PlayerAction | null {
  if (state.phase !== 'bidding' || state.turn !== seat) return null;
  const current = state.currentBid;
  if (current) {
    const estimate = evaluateBid(state, seat, current.quantity, current.face, false);
    if (estimate.trueChance < 0.35) return { type: 'challenge' };
  }
  const choice = safeBid(state, seat, 'normal', () => 0.5);
  return choice
    ? { type: 'bid', quantity: choice.quantity, face: choice.face }
    : current
      ? { type: 'challenge' }
      : null;
}
