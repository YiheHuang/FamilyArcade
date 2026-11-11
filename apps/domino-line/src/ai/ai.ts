import {
  ALL_TILES,
  applyAction,
  legalPlays,
  makeRng,
  matchesInHand,
  pipTotal,
  playableTilesInHand,
  shuffle,
  stateHash,
  tileKey,
  unseenPipCounts,
  unseenTiles,
  type Action,
  type GameState,
  type LegalPlay,
  type Tile,
} from '../game/domino';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'only'
  | 'draw'
  | 'pass'
  | 'shed'
  | 'keep'
  | 'block'
  | 'gentle'
  | 'finish'
  | 'control';

export interface AiChoice {
  action: Action;
  reason: HintReason;
}

type Rng = () => number;

const uniqueEnds = (left: number | null, right: number | null): number[] => {
  if (left === null || right === null) return [];
  return left === right ? [left] : [left, right];
};

const handPlayable = (hand: readonly Tile[], left: number | null, right: number | null): number =>
  playableTilesInHand(hand, left, right).length;

function bestIndex(values: number[], rng: Rng): number {
  let best = -Infinity;
  let picks: number[] = [];
  values.forEach((value, index) => {
    if (value > best + 1e-9) {
      best = value;
      picks = [index];
    } else if (Math.abs(value - best) <= 1e-9) {
      picks.push(index);
    }
  });
  return picks[Math.floor(rng() * picks.length)] ?? picks[0] ?? 0;
}

function tryPlay(state: GameState, seat: number, play: LegalPlay): GameState {
  const result = applyAction(state, {
    type: 'play',
    seat,
    tile: play.tile,
    end: play.end,
  });
  return result.ok ? result.state : state;
}

function pressureFor(
  state: GameState,
  seat: number,
  after: GameState,
): { pressure: number; future: number; ends: number[] } {
  const ends = uniqueEnds(after.left, after.right);
  const unseen = unseenPipCounts(unseenTiles(state, seat));
  const pressure = ends.reduce((sum, pip) => sum + unseen[pip], 0);
  const future = matchesInHand(after.hands[seat], after.left, after.right);
  return { pressure, future, ends };
}

function heuristicScore(state: GameState, seat: number, play: LegalPlay): number {
  const after = tryPlay(state, seat, play);
  if (after.phase !== 'playing') return 1000 + after.roundPoints;
  const { pressure, future } = pressureFor(state, seat, after);
  const next = (seat + 1) % state.players;
  const nextCount = after.hands[next].length;
  const pressureWeight = nextCount <= 2 ? 2.2 : 1.35;
  const pips = play.tile.a + play.tile.b;
  return future * 1.7 - pressure * pressureWeight - pips * 0.18;
}

/**
 * Hard samples the unseen tiles to guess what opponents can answer with. The
 * sampling is seeded by the injected RNG, so the same state + RNG + level always
 * chooses the same tile.
 */
function sampledScore(state: GameState, seat: number, play: LegalPlay, rng: Rng): number {
  const after = tryPlay(state, seat, play);
  if (after.phase !== 'playing') return 10_000 + after.roundPoints;
  const unseen = unseenTiles(state, seat);
  const future = matchesInHand(after.hands[seat], after.left, after.right);
  const opponents = Array.from({ length: state.players }, (_, index) => index).filter(
    (index) => index !== seat,
  );
  const samples = 14;
  let total = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const pool = shuffle(unseen, rng);
    let cursor = 0;
    let mobility = 0;
    let shed = 0;
    for (const opponent of opponents) {
      const size = after.hands[opponent].length;
      const guessed = pool.slice(cursor, cursor + size);
      cursor += size;
      mobility += handPlayable(guessed, after.left, after.right);
      shed += playableTilesInHand(guessed, after.left, after.right).reduce(
        (sum, tile) => sum + tile.a + tile.b,
        0,
      );
    }
    total += future * 2.1 - mobility * 0.95 - shed * 0.11;
  }
  const pips = play.tile.a + play.tile.b;
  const next = (seat + 1) % state.players;
  const urgency = after.hands[next].length <= 2 ? 1.25 : 1;
  return (total / samples) * urgency - pips * 0.12 + rng() * 0.01;
}

function companionScore(state: GameState, seat: number, play: LegalPlay): number {
  const after = tryPlay(state, seat, play);
  if (after.phase !== 'playing') return 1000 + after.roundPoints;
  const { pressure, future } = pressureFor(state, seat, after);
  // A gentle opponent leaves ends the next player is likely to match.
  return pressure * 0.9 + future * 0.7 - (play.tile.a + play.tile.b) * 0.12;
}

function choosePlay(
  state: GameState,
  seat: number,
  level: AiLevel,
  plays: LegalPlay[],
  rng: Rng,
): { play: LegalPlay; reason: HintReason } {
  if (plays.length === 1) return { play: plays[0], reason: 'only' };
  if (level === 'easy') {
    if (rng() < 0.45) {
      const pick = plays[Math.floor(rng() * plays.length)] ?? plays[0];
      return { play: pick, reason: 'shed' };
    }
    const scores = plays.map((play) => -(play.tile.a + play.tile.b) + rng() * 0.01);
    return { play: plays[bestIndex(scores, rng)], reason: 'shed' };
  }

  if (level === 'companion') {
    if (rng() < 0.14) {
      const pick = plays[Math.floor(rng() * plays.length)] ?? plays[0];
      return { play: pick, reason: 'gentle' };
    }
    const scores = plays.map((play) => companionScore(state, seat, play) + rng() * 0.4);
    return { play: plays[bestIndex(scores, rng)], reason: 'gentle' };
  }

  if (level === 'normal') {
    if (rng() < 0.1) {
      const pick = plays[Math.floor(rng() * plays.length)] ?? plays[0];
      return { play: pick, reason: 'control' };
    }
    const scores = plays.map((play) => heuristicScore(state, seat, play) + rng() * 0.02);
    const index = bestIndex(scores, rng);
    const play = plays[index];
    const after = tryPlay(state, seat, play);
    const { pressure, future } = pressureFor(state, seat, after);
    return {
      play,
      reason:
        after.phase !== 'playing'
          ? 'finish'
          : pressure <= 4
            ? 'block'
            : future >= 2
              ? 'keep'
              : 'shed',
    };
  }

  const scores = plays.map((play) => sampledScore(state, seat, play, rng));
  const index = bestIndex(scores, rng);
  const play = plays[index];
  const after = tryPlay(state, seat, play);
  if (after.phase !== 'playing') return { play, reason: 'finish' };
  const { pressure, future } = pressureFor(state, seat, after);
  return {
    play,
    reason: pressure <= 3 ? 'block' : future >= 2 ? 'keep' : 'control',
  };
}

/** Pick one complete action for an AI seat. Returns null when it is not that seat's turn. */
export function chooseAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): AiChoice | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const plays = legalPlays(state, seat);
  if (plays.length === 0) {
    if (state.boneyard.length > 0) {
      return { action: { type: 'draw', seat }, reason: 'draw' };
    }
    return { action: { type: 'pass', seat }, reason: 'pass' };
  }
  const { play, reason } = choosePlay(state, seat, level, plays, rng);
  return {
    action: { type: 'play', seat, tile: play.tile, end: play.end },
    reason,
  };
}

/**
 * A deterministic hint for the current seat. Uses the Hard policy with a seed
 * derived from the state, so asking twice never gives two different answers.
 */
export function hintFor(state: GameState, seat: number): AiChoice | null {
  const choice = chooseAction(state, seat, 'hard', makeRng(stateHash(state) ^ 0x9e3779b9));
  if (!choice) return null;
  if (choice.action.type !== 'play') return choice;
  const plays = legalPlays(state, seat);
  if (plays.length === 0) return choice;
  const after = tryPlay(state, seat, {
    tile: choice.action.tile,
    end: choice.action.end,
    outer: 0,
  });
  if (after.phase !== 'playing') return { ...choice, reason: 'finish' };
  const { pressure, future } = pressureFor(state, seat, after);
  return {
    ...choice,
    reason: pressure <= 3 ? 'block' : future >= 2 ? 'keep' : 'shed',
  };
}

/** Explain why a particular tile/end is good, for tests and tooltips. */
export function explainPlay(state: GameState, seat: number, play: LegalPlay): HintReason {
  const after = tryPlay(state, seat, play);
  if (after.phase !== 'playing') return 'finish';
  const { pressure, future } = pressureFor(state, seat, after);
  if (pressure <= 3) return 'block';
  if (future >= 2) return 'keep';
  return 'shed';
}

/** All tiles that are still unseen by this seat, exposed for the hard AI and tests. */
export function unseenFor(state: GameState, seat: number): Tile[] {
  return unseenTiles(state, seat);
}

export function unseenCountFor(state: GameState, seat: number): number[] {
  return unseenPipCounts(unseenTiles(state, seat));
}

export function handPips(tiles: readonly Tile[]): number {
  return pipTotal(tiles);
}

export function playableCount(tiles: readonly Tile[], left: number | null, right: number | null): number {
  return playableTilesInHand(tiles, left, right).length;
}

export function allTileKeys(): string[] {
  return ALL_TILES.map(tileKey);
}
