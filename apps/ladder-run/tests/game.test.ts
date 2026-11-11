import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  applySeat,
  FINISH,
  hint,
  isGameState,
  LADDERS,
  previewRolls,
  previewsFor,
  resolveTile,
  roll,
  rollDie,
  rollWithDie,
  setup,
  SNAKES,
  view,
  type GameState,
} from '../src/game/ladder-run';
import {
  chooseRoll,
  companionCheer,
  dieRng,
  lineForMove,
  moodFor,
} from '../src/ai/ai';

function at(position: number, seat = 0, count = 2): GameState {
  const state = setup({ players: count });
  state.players[seat].position = position;
  state.turn = seat;
  return state;
}

/** Small deterministic PRNG for whole-game simulations. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Ladder Run setup', () => {
  it('creates a two-player table at the start', () => {
    const state = setup();
    expect(state.version).toBe(1);
    expect(state.players).toHaveLength(2);
    expect(state.players.every((player) => player.position === 0)).toBe(true);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.moves).toEqual([]);
  });

  it('supports 2, 3 and 4 seats with names and kinds', () => {
    const state = setup({
      players: 4,
      names: ['Mia', 'Leo', 'Zoe', 'Kai'],
      kinds: ['human', 'ai', 'ai', 'ai'],
      levels: ['companion', 'easy', 'normal', 'hard'],
    });
    expect(state.players.map((player) => player.name)).toEqual(['Mia', 'Leo', 'Zoe', 'Kai']);
    expect(state.players.map((player) => player.kind)).toEqual(['human', 'ai', 'ai', 'ai']);
    expect(state.players.map((player) => player.level)).toEqual(['companion', 'easy', 'normal', 'hard']);
  });

  it('pads missing names, trims long names and falls back safely', () => {
    const state = setup({
      players: 3,
      names: ['  A very long family nickname indeed  '],
      kinds: ['human'],
      levels: ['nonsense' as never],
    });
    expect(state.players[0].name).toBe('A very long family');
    expect(state.players[1].name).toBe('Player 2');
    expect(state.players[2].name).toBe('Player 3');
    expect(state.players[0].level).toBe('normal');
    expect(state.players[1].kind).toBe('human');
  });

  it('rejects impossible player counts', () => {
    expect(() => setup({ players: 1 })).toThrow();
    expect(() => setup({ players: 5 })).toThrow();
    expect(() => setup({ players: 2.5 })).toThrow();
  });
});

describe('Ladder Run dice', () => {
  it('maps RNG boundaries to 1..6', () => {
    expect(rollDie(() => 0)).toBe(1);
    expect(rollDie(() => 0.17)).toBe(2);
    expect(rollDie(() => 0.5)).toBe(4);
    expect(rollDie(() => 0.99999)).toBe(6);
    expect(rollDie(() => -10)).toBe(1);
    expect(rollDie(() => 10)).toBe(6);
    expect(rollDie(() => Number.NaN)).toBe(1);
  });

  it('dieRng targets every face exactly', () => {
    for (let die = 1; die <= 6; die++) {
      expect(rollDie(dieRng(die))).toBe(die);
    }
  });

  it('resolves a plain move without transport', () => {
    const outcome = resolveTile(10, 4);
    expect(outcome.raw).toBe(14);
    expect(outcome.to).toBe(14);
    expect(outcome.transport).toBe('none');
    expect(outcome.wins).toBe(false);
  });

  it('climbs a ladder and reports the raw square', () => {
    const outcome = resolveTile(0, 3);
    expect(outcome.raw).toBe(3);
    expect(outcome.to).toBe(22);
    expect(outcome.transport).toBe('ladder');
  });

  it('slides down a snake and reports the raw square', () => {
    const outcome = resolveTile(15, 2);
    expect(outcome.raw).toBe(17);
    expect(outcome.to).toBe(7);
    expect(outcome.transport).toBe('snake');
  });

  it('needs an exact roll to finish', () => {
    const win = resolveTile(98, 2);
    expect(win.to).toBe(100);
    expect(win.wins).toBe(true);
    const over = resolveTile(98, 3);
    expect(over.to).toBe(98);
    expect(over.raw).toBe(101);
    expect(over.overshoot).toBe(true);
    expect(over.wins).toBe(false);
  });

  it('does not score a ladder to 98 as a win', () => {
    const outcome = resolveTile(75, 3);
    expect(outcome.to).toBe(98);
    expect(outcome.transport).toBe('ladder');
    expect(outcome.wins).toBe(false);
  });
});

describe('Ladder Run turns', () => {
  it('moves, advances the turn and records the move', () => {
    const result = rollWithDie(setup(), 4);
    expect(result.ok).toBe(true);
    const next = result.state;
    expect(next.players[0].position).toBe(4);
    expect(next.turn).toBe(1);
    expect(next.lastRoll).toBe(4);
    expect(next.lastMove).toMatchObject({ seat: 0, from: 0, roll: 4, to: 4 });
    expect(next.moves).toHaveLength(1);
  });

  it('rolls with an injected RNG', () => {
    const result = roll(setup(), () => 0);
    expect(result.ok).toBe(true);
    expect(result.move?.roll).toBe(1);
    expect(result.state.players[0].position).toBe(1);
  });

  it('applies ladder transport on the board', () => {
    const result = rollWithDie(setup(), 3);
    expect(result.state.players[0].position).toBe(22);
    expect(result.move?.transport).toBe('ladder');
  });

  it('wraps turns around 3 and 4 players', () => {
    let state = setup({ players: 4 });
    for (const expected of [1, 2, 3, 0]) {
      state = rollWithDie(state, 1).state;
      expect(state.turn).toBe(expected);
    }
  });

  it('rejects another seat moving out of turn', () => {
    const state = setup({ players: 3 });
    expect(rollWithDie(state, 4, 1).error).toBe('wrong-turn');
    expect(applySeat(state, 2, () => 0).error).toBe('wrong-turn');
  });

  it('rejects bad seats and bad dice', () => {
    const state = setup();
    expect(rollWithDie(state, 4, -1).error).toBe('bad-seat');
    expect(rollWithDie(state, 4, 2).error).toBe('bad-seat');
    expect(rollWithDie(state, 0).error).toBe('bad-die');
    expect(rollWithDie(state, 7).error).toBe('bad-die');
    expect(rollWithDie(state, 2.5).error).toBe('bad-die');
  });

  it('ends at exactly 100 and keeps the winner on turn', () => {
    const state = at(98);
    const result = rollWithDie(state, 2);
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(0);
    expect(result.state.turn).toBe(0);
    expect(result.state.players[0].position).toBe(100);
    expect(result.move?.wins).toBe(true);
  });

  it('stays put on an overshoot and passes the turn', () => {
    const state = at(98);
    const result = rollWithDie(state, 6);
    expect(result.state.status).toBe('playing');
    expect(result.state.players[0].position).toBe(98);
    expect(result.state.turn).toBe(1);
    expect(result.move?.overshoot).toBe(true);
  });

  it('refuses moves after the game is won', () => {
    const won = rollWithDie(at(99), 1).state;
    expect(won.status).toBe('won');
    expect(rollWithDie(won, 3).error).toBe('game-over');
    expect(applySeat(won, 0, () => 0.2).error).toBe('game-over');
    expect(view(won, 0).canRoll).toBe(false);
  });
});

describe('Ladder Run board data', () => {
  it('has nine ladders and eleven snakes', () => {
    expect(Object.keys(LADDERS)).toHaveLength(9);
    expect(Object.keys(SNAKES)).toHaveLength(11);
  });

  it('keeps every transport inside the board and pointing the right way', () => {
    for (const [start, end] of Object.entries(LADDERS)) {
      expect(Number(start)).toBeGreaterThanOrEqual(2);
      expect(Number(start)).toBeLessThanOrEqual(99);
      expect(end).toBeGreaterThan(Number(start));
      expect(end).toBeLessThanOrEqual(99);
    }
    for (const [start, end] of Object.entries(SNAKES)) {
      expect(Number(start)).toBeGreaterThanOrEqual(2);
      expect(Number(start)).toBeLessThanOrEqual(99);
      expect(end).toBeLessThan(Number(start));
      expect(end).toBeGreaterThanOrEqual(2);
    }
  });

  it('never chains a transport into another transport', () => {
    for (const end of [...Object.values(LADDERS), ...Object.values(SNAKES)]) {
      expect(LADDERS[end]).toBeUndefined();
      expect(SNAKES[end]).toBeUndefined();
    }
  });

  it('never puts a transport on the start or the finish', () => {
    expect(LADDERS[0]).toBeUndefined();
    expect(SNAKES[0]).toBeUndefined();
    expect(LADDERS[FINISH]).toBeUndefined();
    expect(SNAKES[FINISH]).toBeUndefined();
  });
});

describe('Ladder Run hints and views', () => {
  it('previews all six rolls from a square', () => {
    const previews = previewRolls(0);
    expect(previews).toHaveLength(6);
    expect(previews[0]).toMatchObject({ roll: 1, to: 1 });
    expect(previews[2]).toMatchObject({ roll: 3, to: 22, transport: 'ladder' });
  });

  it('gives each seat six previews from its own position', () => {
    const state = at(26, 1, 2);
    const previews = previewsFor(state, 1);
    expect(previews.every((preview) => preview.seat === 1)).toBe(true);
    expect(previews[1].from).toBe(26);
  });

  it('recommends a ladder when one is in reach', () => {
    const result = hint(setup());
    expect(result?.best.roll).toBe(3);
    expect(result?.best.to).toBe(22);
    expect(result?.reason).toBe('ladder');
  });

  it('recommends the exact finishing roll', () => {
    const result = hint(at(98));
    expect(result?.best.roll).toBe(2);
    expect(result?.best.to).toBe(100);
    expect(result?.reason).toBe('finish');
  });

  it('returns null when the game is already over', () => {
    const won = rollWithDie(at(99), 1).state;
    expect(hint(won)).toBeNull();
    expect(hint(setup(), 9)).toBeNull();
  });

  it('shows a per-seat public view with canRoll', () => {
    const state = at(42, 1, 3);
    expect(view(state, 0).canRoll).toBe(false);
    expect(view(state, 1).canRoll).toBe(true);
    expect(view(state, 2).canRoll).toBe(false);
    expect(view(state, 1).players).toHaveLength(3);
    expect(view(state, 1).players[1].position).toBe(42);
  });
});

describe('Ladder Run whole-game simulations', () => {
  it('finishes a two-player game deterministically', () => {
    const rng = mulberry32(27);
    let state = setup({ players: 2 });
    let guard = 0;
    while (state.status === 'playing' && guard < 20000) {
      const result = roll(state, rng);
      expect(result.ok).toBe(true);
      state = result.state;
      guard++;
    }
    expect(state.status).toBe('won');
    expect(state.winner).not.toBeNull();
    expect(state.players[state.winner!].position).toBe(100);
    expect(state.moves.length).toBeGreaterThan(5);
    expect(guard).toBeLessThan(20000);
  });

  it('finishes a four-player game without positions leaving 0..100', () => {
    const rng = mulberry32(100);
    let state = setup({ players: 4 });
    let guard = 0;
    while (state.status === 'playing' && guard < 20000) {
      state = roll(state, rng).state;
      for (const player of state.players) {
        expect(player.position).toBeGreaterThanOrEqual(0);
        expect(player.position).toBeLessThanOrEqual(100);
      }
      guard++;
    }
    expect(state.status).toBe('won');
    expect(state.winner === 0 || state.winner === 1 || state.winner === 2 || state.winner === 3).toBe(true);
  });
});

describe('Ladder Run save validation', () => {
  it('accepts a fresh state and rejects spoofed payloads', () => {
    const state = setup({ players: 3 });
    expect(isGameState(state)).toBe(true);
    expect(isGameState(null)).toBe(false);
    expect(isGameState({ ...state, version: 2 })).toBe(false);
    expect(isGameState({ ...state, turn: 3 })).toBe(false);
    expect(isGameState({ ...state, players: state.players.slice(0, 1) })).toBe(false);
    expect(isGameState({ ...state, players: [{ ...state.players[0], position: 101 }, state.players[1], state.players[2]] })).toBe(false);
    expect(isGameState({ ...state, status: 'won', winner: null })).toBe(false);
  });
});

describe('Ladder Run AI', () => {
  it('has exactly four levels', () => {
    expect(AI_LEVELS).toEqual(['companion', 'easy', 'normal', 'hard']);
  });

  it('rolls the same die at every level for the same RNG', () => {
    const state = setup({ players: 4 });
    for (const level of AI_LEVELS) {
      expect(chooseRoll(state, level, () => 0.42).die).toBe(chooseRoll(state, 'normal', () => 0.42).die);
    }
  });

  it('reports the mood of a roll', () => {
    expect(moodFor({ wins: true, transport: 'none', overshoot: false })).toBe('win');
    expect(moodFor({ wins: false, transport: 'ladder', overshoot: false })).toBe('ladder');
    expect(moodFor({ wins: false, transport: 'snake', overshoot: false })).toBe('snake');
    expect(moodFor({ wins: false, transport: 'none', overshoot: true })).toBe('overshoot');
    expect(moodFor({ wins: false, transport: 'none', overshoot: false })).toBe('safe');
  });

  it('makes Companion cheer every roll', () => {
    for (const preview of [
      { wins: true, transport: 'none' as const, overshoot: false },
      { wins: false, transport: 'snake' as const, overshoot: false },
      { wins: false, transport: 'none' as const, overshoot: true },
    ]) {
      expect(lineForMove('companion', preview)).toBe('aiCompanionCheer');
    }
    expect(companionCheer()).toBe('aiCompanionCheer');
  });

  it('changes only the flavour between levels', () => {
    const preview = { wins: false, transport: 'ladder' as const, overshoot: false };
    expect(lineForMove('easy', preview)).toBe('aiEasyLadder');
    expect(lineForMove('normal', preview)).toBe('aiNormalLadder');
    expect(lineForMove('hard', preview)).toBe('aiHardLadder');
  });

  it('returns a legal die and a line for an actual turn', () => {
    const state = at(26, 0, 3);
    const choice = chooseRoll(state, 'hard', () => 0.83);
    expect(choice.die).toBe(5);
    expect(choice.line).toMatch(/^aiHard/);
    const result = rollWithDie(state, choice.die);
    expect(result.ok).toBe(true);
    expect(choice.mood).toBe(moodFor(result.move!));
  });
});
