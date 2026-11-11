import {
  HOME,
  LANE_START,
  RING_CELLS,
  currentColor,
  destination,
  legalMoves,
  move,
  ringCell,
  START_CELL,
  type Color,
  type GameState,
  type PawnRef,
} from '../game/race-home';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

function pick<T>(items: T[], rng: Rng): T {
  const raw = rng();
  const index = Math.floor(Math.max(0, Math.min(0.999999, raw)) * items.length);
  return items[index] ?? items[0];
}

function pawnValue(pos: number): number {
  if (pos === HOME) return 100000;
  if (pos === -1) return 0;
  if (pos >= LANE_START) return 1400 + (pos - LANE_START) * 60;
  return 20 + pos * 3;
}

/** How many opponents could land on this pawn on their next roll? */
export function captureRisk(state: GameState, color: Color, pawn: number): number {
  const pos = state.pawns[color][pawn];
  const cell = ringCell(color, pos);
  if (cell === null) return 0;
  let risk = 0;
  for (const other of state.players) {
    if (other === color) continue;
    for (const otherPos of state.pawns[other]) {
      if (otherPos >= 0 && otherPos < RING_CELLS) {
        const otherCell = ringCell(other, otherPos);
        if (otherCell === null) continue;
        const distance = (cell - otherCell + RING_CELLS) % RING_CELLS;
        if (distance >= 1 && distance <= 6) risk += 1;
      } else if (otherPos === -1) {
        // A six brings a base pawn onto its start square.
        if (START_CELL[other] === cell) risk += 0.4;
      }
    }
  }
  return risk;
}

function scoreMove(
  state: GameState,
  pawn: number,
  level: AiLevel,
  rng: Rng,
): { score: number; captured: PawnRef[] } {
  const color = currentColor(state);
  const from = state.pawns[color][pawn];
  const to = destination(state, pawn) ?? 0;
  const next = move(state, pawn).state;
  const event = next.lastEvent;
  const captured =
    event && (event.type === 'move' || event.type === 'win') ? event.captured : [];

  let score = pawnValue(to) - pawnValue(from);

  if (to === HOME) score += 50000;
  if (from === -1) score += 160;
  if (to >= LANE_START && to < HOME) score += 420;

  const captureValue = captured.reduce((sum, ref) => {
    const victimPos = state.pawns[ref.color][ref.pawn];
    return sum + 120 + Math.max(0, victimPos) * 4;
  }, 0);

  if (level === 'companion') {
    // Gentle: it will still win, but it does not enjoy sending a child home.
    score -= captureValue * 1.15;
    score -= captureRisk(next, color, pawn) * 16;
  } else if (level === 'easy') {
    score += captureValue * 0.5;
    score += rng() * 30;
  } else {
    score += captureValue;
    const risk = captureRisk(next, color, pawn);
    score -= risk * (level === 'hard' ? 65 : 18);
    if (level === 'hard') {
      // A pawn that is close to home is worth covering.
      const homeward = to >= 40 && to < LANE_START ? 18 : 0;
      score += homeward;
      // Mildly prefer leaving a threatening ring square for the lane.
      if (from >= 40 && from < LANE_START && to >= LANE_START) score += 40;
    }
  }

  return { score, captured };
}

function bestMove(state: GameState, level: AiLevel, rng: Rng): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  let best = -Infinity;
  let choice = moves[0];
  for (const pawn of moves) {
    const { score } = scoreMove(state, pawn, level, rng);
    if (score > best + 1e-9) {
      best = score;
      choice = pawn;
    }
  }
  return choice;
}

/** A move that brings all four pawns home right now, if one exists. */
function winningMove(state: GameState): number {
  for (const pawn of legalMoves(state)) {
    const next = move(state, pawn).state;
    if (next.winner === currentColor(state)) return pawn;
  }
  return -1;
}

/**
 * Pick a pawn index. All levels are deterministic when given the same RNG.
 * Companion is deliberately gentle about captures; Hard weighs the risk of
 * being captured on the opponent's reply.
 */
export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;

  const win = winningMove(state);
  if (win >= 0) return win;

  if (level === 'easy') {
    if (rng() < 0.62) return pick(moves, rng);
    return bestMove(state, level, rng);
  }

  if (level === 'companion') {
    if (rng() < 0.12) {
      const gentle = moves.filter((pawn) => {
        const next = move(state, pawn).state;
        const event = next.lastEvent;
        return !(event && (event.type === 'move' || event.type === 'win') && event.captured.length > 0);
      });
      return pick(gentle.length > 0 ? gentle : moves, rng);
    }
    return bestMove(state, level, rng);
  }

  if (level === 'normal') {
    if (rng() < 0.1) return pick(moves, rng);
    return bestMove(state, level, rng);
  }

  return bestMove(state, level, rng);
}

export type HintKey = 'finish' | 'capture' | 'lane' | 'base' | 'safe' | 'advance';

export interface Hint {
  pawn: number;
  key: HintKey;
  from: number;
  to: number;
  captured: PawnRef[];
}

/** Explain why the Hard AI would choose this pawn. */
export function explainMove(state: GameState, pawn: number): Hint | null {
  if (!legalMoves(state).includes(pawn)) return null;
  const color = currentColor(state);
  const from = state.pawns[color][pawn];
  const to = destination(state, pawn) ?? from;
  const next = move(state, pawn).state;
  const event = next.lastEvent;
  const captured =
    event && (event.type === 'move' || event.type === 'win') ? event.captured : [];
  let key: HintKey = 'advance';
  if (to === HOME) key = 'finish';
  else if (captured.length > 0) key = 'capture';
  else if (to >= LANE_START) key = 'lane';
  else if (from === -1) key = 'base';
  else if (captureRisk(next, color, pawn) === 0) key = 'safe';
  return { pawn, key, from, to, captured };
}
