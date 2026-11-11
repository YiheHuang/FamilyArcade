import { describe, expect, it } from 'vitest';
import {
  chooseAction,
  explainPlay,
  hintFor,
  unseenFor,
  type AiLevel,
} from '../src/ai/ai';
import {
  ALL_TILES,
  applyAction,
  legalPlays,
  makeRng,
  makeTile,
  nextRound,
  pipTotal,
  setup,
  stateHash,
  tileKey,
  unseenTiles,
  view,
  type GameState,
  type PlayerCount,
  type Tile,
} from '../src/game/domino';

const t = (a: number, b: number): Tile => makeTile(a, b);

function custom(
  hands: Tile[][],
  options: Partial<GameState> = {},
  boneyard: Tile[] = [],
): GameState {
  const players = hands.length as PlayerCount;
  return {
    players,
    target: 100,
    hands: hands.map((hand) => hand.map((tile) => ({ ...tile }))),
    boneyard: boneyard.map((tile) => ({ ...tile })),
    board: [],
    left: null,
    right: null,
    turn: 0,
    phase: 'playing',
    round: 1,
    scores: Array.from({ length: players }, () => 0),
    passes: 0,
    roundWinner: null,
    roundPoints: 0,
    matchWinner: null,
    starter: 0,
    lastPlay: null,
    ...options,
  };
}

function chain(state: GameState, tiles: Tile[]): GameState {
  let next = state;
  const board = [] as GameState['board'];
  let left: number | null = null;
  let right: number | null = null;
  for (const tile of tiles) {
    if (board.length === 0) {
      left = tile.a;
      right = tile.b;
      board.push({ tile: { ...tile }, left: tile.a, right: tile.b });
    } else if (tile.a === right) {
      board.push({ tile: { ...tile }, left: tile.a, right: tile.b });
      right = tile.b;
    } else {
      throw new Error('bad chain helper');
    }
  }
  next = { ...next, board, left, right };
  return next;
}

describe('Domino Line engine · setup and tiles', () => {
  it('creates a canonical double-six set of 28 unique tiles', () => {
    expect(ALL_TILES).toHaveLength(28);
    expect(new Set(ALL_TILES.map(tileKey)).size).toBe(28);
    for (const tile of ALL_TILES) {
      expect(tile.a).toBeLessThanOrEqual(tile.b);
      expect(tile.a).toBeGreaterThanOrEqual(0);
      expect(tile.b).toBeLessThanOrEqual(6);
    }
  });

  it('normalises reversed pips and rejects impossible pips', () => {
    expect(makeTile(5, 2)).toEqual({ a: 2, b: 5 });
    expect(tileKey(makeTile(6, 0))).toBe('0-6');
    expect(() => makeTile(7, 1)).toThrow();
    expect(() => makeTile(1, -1)).toThrow();
    expect(() => makeTile(1.5, 2)).toThrow();
  });

  it('deals 7 tiles each to two players and leaves 14 in the boneyard', () => {
    const state = setup(2, makeRng(1));
    expect(state.hands).toHaveLength(2);
    expect(state.hands[0]).toHaveLength(7);
    expect(state.hands[1]).toHaveLength(7);
    expect(state.boneyard).toHaveLength(14);
    const keys = [...state.hands.flat(), ...state.boneyard].map(tileKey);
    expect(new Set(keys).size).toBe(28);
  });

  it('deals 5 tiles each to three and four players', () => {
    const three = setup(3, makeRng(2));
    expect(three.hands.every((hand) => hand.length === 5)).toBe(true);
    expect(three.boneyard).toHaveLength(13);
    const four = setup(4, makeRng(3));
    expect(four.hands.every((hand) => hand.length === 5)).toBe(true);
    expect(four.boneyard).toHaveLength(8);
  });

  it('is deterministic with the same injected RNG', () => {
    const a = setup(3, makeRng(77));
    const b = setup(3, makeRng(77));
    expect(a.hands).toEqual(b.hands);
    expect(a.boneyard).toEqual(b.boneyard);
  });

  it('produces a different deal with a different seed', () => {
    const a = setup(2, makeRng(10));
    const b = setup(2, makeRng(11));
    expect(a.hands).not.toEqual(b.hands);
  });

  it('starts empty with seat 0 to play, zero scores and target 100', () => {
    const state = setup(2, makeRng(4));
    expect(state.board).toEqual([]);
    expect(state.left).toBeNull();
    expect(state.right).toBeNull();
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.round).toBe(1);
    expect(state.scores).toEqual([0, 0]);
    expect(state.target).toBe(100);
  });
});

describe('Domino Line engine · legal plays and placement', () => {
  it('allows any tile to start the empty line', () => {
    const state = custom([[t(2, 5), t(6, 6)], [t(1, 3), t(0, 0)]]);
    const plays = legalPlays(state, 0);
    expect(plays).toHaveLength(2);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(2, 5), end: 'right' });
    expect(result.ok).toBe(true);
    expect(result.state.board).toHaveLength(1);
    expect(result.state.left).toBe(2);
    expect(result.state.right).toBe(5);
    expect(result.state.turn).toBe(1);
    expect(result.state.hands[0]).toHaveLength(1);
  });

  it('places a tile on the right and exposes the outer pip', () => {
    let state = custom([[t(5, 6), t(0, 0)], [t(1, 1), t(2, 2)]]);
    state = chain(state, [t(2, 5)]);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(5, 6), end: 'right' });
    expect(result.ok).toBe(true);
    expect(result.state.right).toBe(6);
    expect(result.state.left).toBe(2);
    expect(result.state.board[1]).toEqual({ tile: t(5, 6), left: 5, right: 6 });
  });

  it('places a tile on the left and exposes the outer pip', () => {
    let state = custom([[t(1, 2), t(0, 0)], [t(1, 1), t(2, 2)]]);
    state = chain(state, [t(2, 5)]);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(1, 2), end: 'left' });
    expect(result.ok).toBe(true);
    expect(result.state.left).toBe(1);
    expect(result.state.right).toBe(5);
    expect(result.state.board[0]).toEqual({ tile: t(1, 2), left: 1, right: 2 });
  });

  it('only lists tiles that match an open end', () => {
    let state = custom(
      [[t(5, 6), t(1, 2), t(0, 0), t(2, 2), t(5, 5)], [t(1, 1), t(2, 2)]],
    );
    state = chain(state, [t(2, 5)]);
    const keys = legalPlays(state, 0).map((play) => `${tileKey(play.tile)}:${play.end}:${play.outer}`);
    expect(keys).toContain('5-6:right:6');
    expect(keys).toContain('1-2:left:1');
    expect(keys).toContain('2-2:left:2');
    expect(keys).toContain('5-5:right:5');
    expect(keys.some((key) => key.startsWith('0-0'))).toBe(false);
    expect(keys.some((key) => key.startsWith('5-6:left'))).toBe(false);
  });

  it('offers a matching tile on both ends but deduplicates a double when both ends are equal', () => {
    let state = custom([[t(2, 5), t(4, 4), t(4, 6)], [t(1, 1), t(2, 2)]]);
    state = chain(state, [t(2, 5)]);
    const both = legalPlays(state, 0).filter((play) => tileKey(play.tile) === '2-5');
    expect(both).toHaveLength(2);
    expect(new Set(both.map((play) => play.end))).toEqual(new Set(['left', 'right']));

    let equal = custom([[t(4, 4), t(4, 6)], [t(1, 1), t(2, 2)]]);
    equal = chain(equal, [t(4, 4)]);
    equal.left = 4;
    equal.right = 4;
    const doubles = legalPlays(equal, 0).filter((play) => tileKey(play.tile) === '4-4');
    expect(doubles).toHaveLength(1);
  });

  it('rejects a wrong seat, a tile not in hand, and a non-matching placement', () => {
    let state = custom([[t(5, 6)], [t(1, 1)]], { turn: 1 });
    state = chain(state, [t(2, 5)]);
    expect(applyAction(state, { type: 'play', seat: 0, tile: t(5, 6), end: 'right' }).error).toBe(
      'wrong-turn',
    );
    expect(applyAction(state, { type: 'play', seat: 1, tile: t(5, 6), end: 'right' }).error).toBe(
      'not-in-hand',
    );
    expect(applyAction(state, { type: 'play', seat: 1, tile: t(1, 1), end: 'right' }).error).toBe(
      'not-legal',
    );
  });

  it('rejects moves after the round has ended', () => {
    const state = custom([[t(5, 6)], [t(1, 1)]], { phase: 'round-over', roundWinner: 0 });
    expect(applyAction(state, { type: 'play', seat: 0, tile: t(5, 6), end: 'right' }).error).toBe(
      'not-playing',
    );
    expect(applyAction(state, { type: 'draw', seat: 0 }).error).toBe('not-playing');
  });
});

describe('Domino Line engine · drawing, passing and scoring', () => {
  it('draws one tile only when no tile fits and keeps the same turn', () => {
    let state = custom([[t(0, 0), t(1, 1)], [t(2, 2), t(3, 3)]], {}, [t(4, 4), t(5, 5)]);
    state = chain(state, [t(2, 5)]);
    expect(legalPlays(state, 0)).toHaveLength(0);
    const result = applyAction(state, { type: 'draw', seat: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
    expect(result.state.hands[0]).toHaveLength(3);
    expect(result.state.boneyard).toHaveLength(1);
  });

  it('refuses to draw when a tile fits or when the boneyard is empty', () => {
    let state = custom([[t(5, 6)], [t(1, 1)]], {}, [t(0, 0)]);
    state = chain(state, [t(2, 5)]);
    expect(applyAction(state, { type: 'draw', seat: 0 }).error).toBe('must-play');
    let empty = custom([[t(0, 0)], [t(1, 1)]], {}, []);
    empty = chain(empty, [t(2, 5)]);
    expect(applyAction(empty, { type: 'draw', seat: 0 }).error).toBe('boneyard-empty');
  });

  it('passes only with an empty boneyard and advances the turn', () => {
    let state = custom([[t(0, 0)], [t(1, 1)]], {}, []);
    state = chain(state, [t(2, 5)]);
    const result = applyAction(state, { type: 'pass', seat: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.passes).toBe(1);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('playing');
  });

  it('refuses to pass while the boneyard still has tiles', () => {
    let state = custom([[t(0, 0)], [t(1, 1)]], {}, [t(6, 6)]);
    state = chain(state, [t(2, 5)]);
    expect(applyAction(state, { type: 'pass', seat: 0 }).error).toBe('must-draw');
  });

  it('scores an empty hand from every other hand and ends the round', () => {
    let state = custom([[t(6, 6)], [t(1, 2), t(3, 4)]], {}, []);
    state = chain(state, [t(3, 6)]);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(6, 6), end: 'right' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.roundWinner).toBe(0);
    expect(result.state.roundPoints).toBe(3 + 7);
    expect(result.state.scores).toEqual([10, 0]);
  });

  it('ends the match when the round score reaches the target', () => {
    let state = custom([[t(6, 6)], [t(1, 2), t(3, 4)]], { scores: [90, 0] }, []);
    state = chain(state, [t(3, 6)]);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(6, 6), end: 'right' });
    expect(result.state.scores[0]).toBe(100);
    expect(result.state.phase).toBe('match-over');
    expect(result.state.matchWinner).toBe(0);
  });

  it('awards a blocked table to the unique lowest pip total', () => {
    let state = custom(
      [[t(5, 5)], [t(2, 2)], [t(1, 1), t(4, 4)]],
      { passes: 2, turn: 0 },
    );
    state = chain(state, [t(6, 6)]);
    const result = applyAction(state, { type: 'pass', seat: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.roundWinner).toBe(1);
    expect(result.state.roundPoints).toBe(20);
    expect(result.state.scores).toEqual([0, 20, 0]);
  });

  it('awards no points when the lowest pip total is tied', () => {
    let state = custom(
      [[t(1, 1)], [t(2, 0)], [t(0, 2)]],
      { passes: 2, turn: 0 },
    );
    state = chain(state, [t(6, 6)]);
    const result = applyAction(state, { type: 'pass', seat: 0 });
    expect(result.state.phase).toBe('round-over');
    expect(result.state.roundWinner).toBe(-1);
    expect(result.state.roundPoints).toBe(0);
    expect(result.state.scores).toEqual([0, 0, 0]);
  });

  it('resets the pass count after a legal play', () => {
    let state = custom(
      [[t(6, 6), t(0, 0)], [t(1, 1), t(2, 2)]],
      { passes: 1 },
    );
    state = chain(state, [t(6, 3)]);
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(6, 6), end: 'right' });
    expect(result.state.passes).toBe(0);
    expect(result.state.turn).toBe(1);
  });

  it('wraps the turn in a four-player game', () => {
    let state = custom(
      [[t(1, 1)], [t(2, 2)], [t(3, 3)], [t(6, 6), t(0, 0)]],
      { turn: 3 },
    );
    state = chain(state, [t(3, 6)]);
    const result = applyAction(state, { type: 'play', seat: 3, tile: t(6, 6), end: 'right' });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
  });
});

describe('Domino Line engine · rounds, views and helpers', () => {
  function roundOverState(): GameState {
    let state = custom([[t(6, 6)], [t(1, 2), t(3, 4)]], { scores: [0, 0] }, []);
    state = chain(state, [t(3, 6)]);
    return applyAction(state, { type: 'play', seat: 0, tile: t(6, 6), end: 'right' }).state;
  }

  it('starts the next round with the round winner and preserves scores', () => {
    const ended = roundOverState();
    const next = nextRound(ended, makeRng(9));
    expect(next.phase).toBe('playing');
    expect(next.round).toBe(2);
    expect(next.turn).toBe(0);
    expect(next.starter).toBe(0);
    expect(next.scores).toEqual([10, 0]);
    expect(next.board).toEqual([]);
    expect(next.left).toBeNull();
    expect(next.hands[0]).toHaveLength(7);
    expect(next.boneyard).toHaveLength(14);
  });

  it('rotates the starter after a tied, blocked round', () => {
    const state = setup(2, makeRng(12));
    const tied: GameState = {
      ...state,
      phase: 'round-over',
      roundWinner: -1,
      starter: 0,
      scores: [4, 4],
    };
    const next = nextRound(tied, makeRng(13));
    expect(next.turn).toBe(1);
    expect(next.starter).toBe(1);
    expect(next.round).toBe(2);
  });

  it('shows a seat only its own hand and hides opponent pip totals while playing', () => {
    const state = setup(3, makeRng(14));
    const seat0 = view(state, 0);
    const seat1 = view(state, 1);
    expect(seat0.hand).toEqual(state.hands[0]);
    expect(seat1.hand).toEqual(state.hands[1]);
    expect(seat0.counts).toEqual([5, 5, 5]);
    expect(seat0.pipTotals[0]).toBe(pipTotal(state.hands[0]));
    expect(seat0.pipTotals[1]).toBeNull();
    expect(seat1.pipTotals[0]).toBeNull();
    expect(seat1.canMove).toBe(false);
    expect(seat0.canMove).toBe(true);
    expect('hands' in seat0).toBe(false);
  });

  it('reveals every pip total in the round summary', () => {
    const ended = roundOverState();
    const seen = view(ended, 1);
    expect(seen.phase).toBe('round-over');
    expect(seen.pipTotals.every((value) => typeof value === 'number')).toBe(true);
    expect(seen.pipTotals[0]).toBe(0);
    expect(seen.pipTotals[1]).toBe(10);
  });

  it('exposes canDraw and canPass for the seat that is stuck', () => {
    let drawable = custom([[t(0, 0)], [t(1, 1)]], {}, [t(6, 6)]);
    drawable = chain(drawable, [t(2, 5)]);
    const drawn = view(drawable, 0);
    expect(drawn.canMove).toBe(false);
    expect(drawn.canDraw).toBe(true);
    expect(drawn.canPass).toBe(false);

    let blocked = custom([[t(0, 0)], [t(1, 1)]], {}, []);
    blocked = chain(blocked, [t(2, 5)]);
    const stuck = view(blocked, 0);
    expect(stuck.canDraw).toBe(false);
    expect(stuck.canPass).toBe(true);
  });

  it('returns the same state object for invalid actions', () => {
    const state = setup(2, makeRng(15));
    const snapshot = JSON.stringify(state);
    expect(applyAction(state, { type: 'play', seat: 0, tile: t(6, 6), end: 'left' }).state).toBe(
      state,
    );
    expect(applyAction(state, { type: 'draw', seat: 1 }).state).toBe(state);
    expect(applyAction(state, { type: 'pass', seat: 0 }).state).toBe(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('calculates pip totals and records the outer pip of a left play', () => {
    expect(pipTotal([t(6, 6), t(1, 2), t(0, 4)])).toBe(12 + 3 + 4);
    let state = custom([[t(1, 5), t(0, 0)], [t(2, 2), t(3, 3)]]);
    state = {
      ...state,
      board: [{ tile: t(2, 5), left: 5, right: 2 }],
      left: 5,
      right: 2,
    };
    const result = applyAction(state, { type: 'play', seat: 0, tile: t(1, 5), end: 'left' });
    expect(result.state.lastPlay).toEqual({
      seat: 0,
      end: 'left',
      tile: t(1, 5),
      outer: 1,
    });
  });

  it('hashes a state deterministically and changes when the deal changes', () => {
    const a = setup(2, makeRng(16));
    const b = setup(2, makeRng(16));
    const c = setup(2, makeRng(17));
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).not.toBe(stateHash(c));
  });

  it('deduplicates unseen tiles against the seat hand and line', () => {
    let state = setup(2, makeRng(18));
    state = { ...state, board: [], left: null, right: null };
    const unseen = unseenTiles(state, 0);
    expect(unseen).toHaveLength(21);
    const own = new Set(state.hands[0].map(tileKey));
    expect(unseen.some((tile) => own.has(tileKey(tile)))).toBe(false);
  });
});

describe('Domino Line AI · four deterministic levels', () => {
  const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

  it('every level returns a legal, applicable action', () => {
    for (const level of LEVELS) {
      const state = setup(3, makeRng(21));
      const choice = chooseAction(state, 0, level, makeRng(5));
      expect(choice).not.toBeNull();
      expect(choice?.action.type).toBe('play');
      const result = applyAction(state, choice!.action);
      expect(result.ok).toBe(true);
    }
  });

  it('is deterministic for the same state, level and injected RNG', () => {
    for (const level of LEVELS) {
      const state = setup(4, makeRng(22));
      const a = chooseAction(state, 0, level, makeRng(99));
      const b = chooseAction(state, 0, level, makeRng(99));
      expect(a).toEqual(b);
    }
  });

  it('only chooses legal moves and never mutates the state', () => {
    for (const level of LEVELS) {
      const state = setup(2, makeRng(23));
      const snapshot = JSON.stringify(state);
      const choice = chooseAction(state, 0, level, makeRng(3));
      expect(choice).not.toBeNull();
      if (choice?.action.type === 'play') {
        const action = choice.action;
        const legal = legalPlays(state, 0);
        expect(
          legal.some(
            (play) => tileKey(play.tile) === tileKey(action.tile) && play.end === action.end,
          ),
        ).toBe(true);
      }
      expect(JSON.stringify(state)).toBe(snapshot);
    }
  });

  it('draws when stuck with a non-empty boneyard', () => {
    for (const level of LEVELS) {
      let state = custom([[t(0, 0)], [t(1, 1)]], {}, [t(6, 6)]);
      state = chain(state, [t(2, 5)]);
      const choice = chooseAction(state, 0, level, makeRng(1));
      expect(choice?.action).toEqual({ type: 'draw', seat: 0 });
    }
  });

  it('passes when stuck with an empty boneyard', () => {
    for (const level of LEVELS) {
      let state = custom([[t(0, 0)], [t(1, 1)]], {}, []);
      state = chain(state, [t(2, 5)]);
      const choice = chooseAction(state, 0, level, makeRng(1));
      expect(choice?.action).toEqual({ type: 'pass', seat: 0 });
    }
  });

  it('returns null when it is not the seat’s turn', () => {
    const state = setup(2, makeRng(24));
    expect(chooseAction(state, 1, 'hard', makeRng(1))).toBeNull();
  });

  it('takes a round-winning play when the hand can be emptied', () => {
    let state = custom([[t(6, 6)], [t(1, 2), t(3, 4)]], {}, []);
    state = chain(state, [t(3, 6)]);
    const choice = chooseAction(state, 0, 'hard', makeRng(2));
    expect(choice?.action.type).toBe('play');
    const result = applyAction(state, choice!.action);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.roundWinner).toBe(0);
  });

  it('produces a deterministic hint with a reason', () => {
    const state = setup(2, makeRng(25));
    const first = hintFor(state, 0);
    const second = hintFor(state, 0);
    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first?.action.type).toBe('play');
    expect(first?.reason).toBeTruthy();
  });

  it('explains a normal legal play with a known reason', () => {
    const state = setup(2, makeRng(26));
    const play = legalPlays(state, 0)[0];
    const reason = explainPlay(state, 0, play);
    expect(['finish', 'block', 'keep', 'shed']).toContain(reason);
  });

  it('keeps unseen information accurate for the hard sampler', () => {
    const state = setup(3, makeRng(27));
    const unseen = unseenFor(state, 1);
    expect(unseen).toHaveLength(28 - 5);
    const own = new Set(state.hands[1].map(tileKey));
    expect(unseen.some((tile) => own.has(tileKey(tile)))).toBe(false);
  });
});
