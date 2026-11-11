import { describe, expect, it } from 'vitest';
import {
  chooseMove,
  createsThirdSide,
  ENDGAME_EDGES,
  hintFor,
  sacrificeCost,
  type AiLevel,
} from '../src/ai/ai';
import {
  apply,
  applySeat,
  boxEdges,
  boxIndex,
  boxSides,
  boxesTouchingEdge,
  completedBoxes,
  EDGE_COUNT,
  edgePosition,
  hEdge,
  legal,
  legalMoves,
  openBoxes,
  resultText,
  setup,
  vEdge,
  view,
  type GameState,
  type Player,
} from '../src/game/boxes';

function play(edges: readonly number[], first: Player = 0): GameState {
  let state = setup(first);
  for (const edge of edges) {
    const result = apply(state, edge);
    if (!result.ok) throw new Error(`illegal edge ${edge}: ${result.error}`);
    state = result.state;
  }
  return state;
}

function constant(value: number): () => number {
  return () => value;
}

/** A position where edge 31 closes two boxes at once. */
function doubleBoxState(): GameState {
  return play([0, 5, 30, 1, 6, 32]);
}

/** 58 edges drawn; only the two rim sides (29, 59) of the last box are left. */
function lastTwoEdgesState(): GameState {
  return play(
    Array.from({ length: EDGE_COUNT }, (_, edge) => edge).filter(
      (edge) => edge !== 29 && edge !== 59,
    ),
  );
}

describe('Boxes engine · board and geometry', () => {
  it('starts with a 6×6 lattice: 60 edges, 25 boxes and player 0 to draw', () => {
    const state = setup();
    expect(state.edges).toHaveLength(60);
    expect(state.edgeOwners).toHaveLength(60);
    expect(state.owners).toHaveLength(25);
    expect(state.edges.every((drawn) => drawn === false)).toBe(true);
    expect(state.owners.every((owner) => owner === null)).toBe(true);
    expect(state.scores).toEqual([0, 0]);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.moves).toHaveLength(0);
  });

  it('maps horizontal and vertical edge indices in row-major order', () => {
    expect(hEdge(0, 0)).toBe(0);
    expect(hEdge(0, 4)).toBe(4);
    expect(hEdge(5, 0)).toBe(25);
    expect(hEdge(5, 4)).toBe(29);
    expect(vEdge(0, 0)).toBe(30);
    expect(vEdge(0, 5)).toBe(35);
    expect(vEdge(4, 0)).toBe(54);
    expect(vEdge(4, 5)).toBe(59);
    expect(edgePosition(0)).toEqual({ kind: 'h', row: 0, col: 0 });
    expect(edgePosition(29)).toEqual({ kind: 'h', row: 5, col: 4 });
    expect(edgePosition(30)).toEqual({ kind: 'v', row: 0, col: 0 });
    expect(edgePosition(59)).toEqual({ kind: 'v', row: 4, col: 5 });
    expect(edgePosition(-1)).toBeNull();
    expect(edgePosition(60)).toBeNull();
  });

  it('lists the four sides of corner and interior boxes', () => {
    expect(boxEdges(boxIndex(0, 0))).toEqual([0, 5, 30, 31]);
    expect(boxEdges(boxIndex(4, 4))).toEqual([24, 29, 58, 59]);
    expect(boxEdges(boxIndex(2, 3))).toEqual([hEdge(2, 3), hEdge(3, 3), vEdge(2, 3), vEdge(2, 4)]);
  });

  it('finds one box at a rim edge and two boxes in the middle', () => {
    expect(boxesTouchingEdge(0)).toEqual([0]);
    expect(boxesTouchingEdge(29)).toEqual([24]);
    expect(boxesTouchingEdge(30)).toEqual([0]);
    expect(boxesTouchingEdge(59)).toEqual([24]);
    expect(boxesTouchingEdge(5)).toEqual([0, 5]);
    expect(boxesTouchingEdge(31)).toEqual([0, 1]);
    expect(boxesTouchingEdge(-1)).toEqual([]);
  });

  it('counts sides and finds open three-sided boxes', () => {
    const two = play([0, 5]);
    expect(boxSides(two, 0)).toBe(2);
    expect(openBoxes(two)).toEqual([]);
    const three = play([0, 5, 30]);
    expect(boxSides(three, 0)).toBe(3);
    expect(openBoxes(three)).toEqual([0]);
    const claimed = play([0, 5, 30, 31]);
    expect(boxSides(claimed, 0)).toBe(4);
    expect(openBoxes(claimed)).toEqual([]);
  });
});

describe('Boxes engine · moves, claims and turns', () => {
  it('offers all 60 lines, then 59 after one is drawn', () => {
    const state = setup();
    expect(legalMoves(state)).toHaveLength(60);
    expect(legal(state, 0)).toBe(true);
    expect(legal(state, -1)).toBe(false);
    expect(legal(state, 60)).toBe(false);
    expect(legal(state, 1.5)).toBe(false);
    const after = apply(state, 0);
    expect(after.ok).toBe(true);
    expect(legalMoves(after.state)).toHaveLength(59);
    expect(legalMoves(after.state)).not.toContain(0);
  });

  it('draws an edge, records the pencil owner and passes the turn', () => {
    const result = apply(setup(), 18);
    expect(result.ok).toBe(true);
    expect(result.state.edges[18]).toBe(true);
    expect(result.state.edgeOwners[18]).toBe(0);
    expect(result.state.turn).toBe(1);
    expect(result.state.lastEdge).toBe(18);
    expect(result.state.lastClaimed).toEqual([]);
    expect(result.state.moves).toEqual([18]);
  });

  it('rejects bad, repeated and post-game edges', () => {
    const state = setup();
    expect(apply(state, -1).error).toBe('bad-edge');
    expect(apply(state, 60).error).toBe('bad-edge');
    expect(apply(state, 0.5).error).toBe('bad-edge');
    const once = apply(state, 0).state;
    expect(apply(once, 0).error).toBe('drawn');
    const finished = play(Array.from({ length: EDGE_COUNT }, (_, edge) => edge));
    expect(apply(finished, 0).error).toBe('game-over');
  });

  it('claims a completed box and keeps the turn', () => {
    const before = play([0, 5, 30]);
    expect(before.turn).toBe(1);
    const result = apply(before, 31);
    expect(result.ok).toBe(true);
    expect(result.state.owners[0]).toBe(1);
    expect(result.state.scores).toEqual([0, 1]);
    expect(result.state.turn).toBe(1);
    expect(result.state.lastClaimed).toEqual([0]);
    expect(result.state.status).toBe('playing');
  });

  it('claims two boxes with one shared edge and keeps the turn', () => {
    const before = doubleBoxState();
    expect(before.turn).toBe(0);
    expect(completedBoxes(before, 31)).toEqual([0, 1]);
    const result = apply(before, 31);
    expect(result.state.owners[0]).toBe(0);
    expect(result.state.owners[1]).toBe(0);
    expect(result.state.scores).toEqual([2, 0]);
    expect(result.state.turn).toBe(0);
    expect(result.state.lastClaimed).toEqual([0, 1]);
  });

  it('lets the same seat move again after a claim', () => {
    const claimed = play([0, 5, 30, 31]);
    expect(claimed.turn).toBe(1);
    expect(applySeat(claimed, 1, 2).ok).toBe(true);
    expect(applySeat(claimed, 0, 2).error).toBe('wrong-turn');
  });

  it('enforces seat ownership for both seats', () => {
    const start = setup();
    expect(applySeat(start, 1, 0).error).toBe('wrong-turn');
    const first = applySeat(start, 0, 0);
    expect(first.ok).toBe(true);
    expect(applySeat(first.state, 1, 1).ok).toBe(true);
  });

  it('resets lastClaimed on the next non-claiming move', () => {
    const claimed = play([0, 5, 30, 31]);
    const next = apply(claimed, 2);
    expect(next.ok).toBe(true);
    expect(next.state.lastClaimed).toEqual([]);
    expect(next.state.lastEdge).toBe(2);
  });

  it('completes all 60 edges, sums 25 boxes and produces a winner', () => {
    const finished = play(Array.from({ length: EDGE_COUNT }, (_, edge) => edge));
    expect(finished.status).toBe('done');
    expect(finished.moves).toHaveLength(60);
    expect(finished.scores[0] + finished.scores[1]).toBe(25);
    expect(finished.winner).not.toBeNull();
    expect(legalMoves(finished)).toEqual([]);
    expect(resultText(finished)).toBe(finished.winner === 0 ? 'p1' : 'p2');
  });

  it('honours a different starting player', () => {
    const state = setup(1);
    expect(state.turn).toBe(1);
    expect(state.first).toBe(1);
    expect(applySeat(state, 0, 0).error).toBe('wrong-turn');
  });
});

describe('Boxes engine · per-seat view', () => {
  it('gives each seat a view with its own canMove flag', () => {
    const start = setup();
    expect(view(start, 0).canMove).toBe(true);
    expect(view(start, 1).canMove).toBe(false);
    expect(view(start, 0).seat).toBe(0);
    expect(view(start, 1).remaining).toBe(60);
    const after = apply(start, 4).state;
    expect(view(after, 0).canMove).toBe(false);
    expect(view(after, 1).canMove).toBe(true);
    expect(view(after, 1).moveCount).toBe(1);
    expect(view(after, 1).remaining).toBe(59);
  });

  it('copies its arrays so a guest render cannot mutate the host state', () => {
    const state = play([0, 5, 30, 31]);
    const guest = view(state, 1);
    guest.edges[0] = false;
    guest.owners[0] = null;
    guest.scores[0] = 99;
    guest.lastClaimed.push(12);
    expect(state.edges[0]).toBe(true);
    expect(state.owners[0]).toBe(1);
    expect(state.scores[0]).toBe(0);
    expect(state.lastClaimed).toEqual([0]);
  });

  it('shows the winner only after the last edge', () => {
    const state = play([0, 5, 30, 31]);
    expect(view(state, 0).winner).toBeNull();
    expect(view(state, 0).status).toBe('playing');
    const finished = play(Array.from({ length: EDGE_COUNT }, (_, edge) => edge));
    const guest = view(finished, 1);
    expect(guest.status).toBe('done');
    expect(guest.winner).toBe(finished.winner);
    expect(guest.canMove).toBe(false);
  });
});

describe('Boxes AI · all four levels', () => {
  it('returns a legal move from the opening on every level', () => {
    const state = setup();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, constant(0.42));
      expect(legalMoves(state)).toContain(move);
    }
  });

  it('is deterministic for the same state, level and RNG', () => {
    const state = play([0, 5, 30]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const first = chooseMove(state, level, constant(0.37));
      const second = chooseMove(state, level, constant(0.37));
      expect(first).toBe(second);
      expect(legalMoves(state)).toContain(first);
    }
  });

  it('Easy is random across the legal range', () => {
    const state = setup();
    expect(chooseMove(state, 'easy', constant(0))).toBe(0);
    expect(chooseMove(state, 'easy', constant(0.999))).toBe(59);
  });

  it('Normal and Hard take a free box', () => {
    const state = play([0, 5, 30]);
    expect(chooseMove(state, 'normal', constant(0.2))).toBe(31);
    expect(chooseMove(state, 'hard', constant(0.2))).toBe(31);
  });

  it('Normal takes a double box when it is available', () => {
    const state = doubleBoxState();
    expect(chooseMove(state, 'normal', constant(0.1))).toBe(31);
  });

  it('Normal avoids creating a third side when a safe line exists', () => {
    const state = play([0, 5]);
    const move = chooseMove(state, 'normal', constant(0.4));
    expect(move).not.toBe(30);
    expect(move).not.toBe(31);
    expect(createsThirdSide(state, move)).toBe(false);
  });

  it('prices a gift and hands over only one box', () => {
    const state = play([0, 5]);
    expect(sacrificeCost(state, 1)).toBe(0);
    expect(sacrificeCost(state, 30)).toBe(1);
    const last = lastTwoEdgesState();
    expect(legalMoves(last)).toEqual([29, 59]);
    expect(openBoxes(last)).toEqual([]);
    const move = chooseMove(last, 'normal', constant(0.5));
    expect([29, 59]).toContain(move);
  });

  it('Hard takes the final box in a two-edge endgame', () => {
    const state = lastTwoEdgesState();
    const move = chooseMove(state, 'hard', constant(0.5));
    expect([29, 59]).toContain(move);
    expect(legalMoves(state).length).toBeLessThanOrEqual(ENDGAME_EDGES);
  });

  it('Companion is gentle: declining a box keeps the child in the game', () => {
    const state = doubleBoxState();
    const gentle = chooseMove(state, 'companion', constant(0));
    expect(gentle).not.toBe(31);
    expect(legalMoves(state)).toContain(gentle);
    const decisive = chooseMove(state, 'companion', constant(0.99));
    expect(decisive).toBe(31);
  });

  it('never returns an illegal move from a crowded midgame', () => {
    const state = play([0, 30, 5, 31, 6, 36, 1, 11, 37, 10, 40, 2, 32, 12, 41, 3, 33, 7, 13]);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, constant(0.61));
      expect(legalMoves(state)).toContain(move);
    }
  });
});

describe('Boxes AI · hints', () => {
  it('recommends a safe opening line', () => {
    const hint = hintFor(setup(), constant(0.3));
    expect(hint.edge).toBeGreaterThanOrEqual(0);
    expect(hint.reason).toBe('safe');
    expect(legalMoves(setup())).toContain(hint.edge);
  });

  it('names a free box as a capture', () => {
    const hint = hintFor(play([0, 5, 30]), constant(0.3));
    expect(hint.edge).toBe(31);
    expect(hint.reason).toBe('capture');
    expect(hint.boxes).toBe(1);
  });

  it('names a double-box edge as a double', () => {
    const hint = hintFor(doubleBoxState(), constant(0.3));
    expect(hint.edge).toBe(31);
    expect(hint.reason).toBe('double');
    expect(hint.boxes).toBe(2);
  });

  it('uses the endgame solver near the end', () => {
    const hint = hintFor(lastTwoEdgesState(), constant(0.3));
    expect([29, 59]).toContain(hint.edge);
    expect(hint.reason).toBe('endgame');
  });

  it('takes the free box before looking for a sacrifice', () => {
    // One three-sided box: the hint should take its free box, not price it as a gift.
    const state = play([0, 5, 30]);
    expect(hintFor(state, constant(0.3)).reason).toBe('capture');
    expect(legalMoves(state)).toContain(31);
  });
});
