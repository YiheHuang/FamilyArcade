import { describe, expect, it } from 'vitest';
import {
  chooseAction,
  chooseBid,
  evaluateBid,
  fallbackAction,
  hint,
  type AiLevel,
} from '../src/ai/ai';
import {
  aliveSeats,
  applySeat,
  bid,
  bidOptions,
  challenge,
  countFace,
  higherBid,
  legalBids,
  nextRound,
  setup,
  spotOn,
  totalDice,
  view,
  type Bid,
  type GameState,
} from '../src/game/liars-dice';
import { addGame, EMPTY_RECORD, normalizeRecord, type FamilyRecord } from '../src/storage';
import { MESSAGES } from '../src/i18n';
import { demoFixture } from '../src/demo';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeState(dice: number[][], overrides: Partial<GameState> = {}): GameState {
  const base = setup({
    rng: seeded(11),
    playerCount: dice.length,
    onesWild: true,
    spotOn: true,
    starter: 0,
  });
  return {
    ...base,
    dice: dice.map((hand) => hand.slice()),
    ...overrides,
  };
}

function withBid(
  dice: number[][],
  bidder: number,
  quantity: number,
  face: number,
  overrides: Partial<GameState> = {},
): GameState {
  const base = makeState(dice, { turn: 0, ...overrides });
  const entry: Bid = { seat: bidder, quantity, face };
  return {
    ...base,
    currentBid: entry,
    bids: [...base.bids, entry],
    tendencies: base.tendencies.map((item, seat) =>
      seat === bidder ? { ...item, bids: item.bids + 1 } : item,
    ),
  };
}

describe('Liar\'s Dice engine · setup and bids', () => {
  it('deals five dice to every seat with values one to six', () => {
    const state = setup({ rng: seeded(1), playerCount: 4 });
    expect(state.playerCount).toBe(4);
    expect(state.dice).toHaveLength(4);
    for (const hand of state.dice) {
      expect(hand).toHaveLength(5);
      expect(hand.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)).toBe(true);
    }
    expect(totalDice(state)).toBe(20);
  });

  it('clamps the table to two through six players', () => {
    expect(setup({ rng: seeded(2), playerCount: 1 }).playerCount).toBe(2);
    expect(setup({ rng: seeded(2), playerCount: 9 }).playerCount).toBe(6);
    expect(setup({ rng: seeded(2), playerCount: 3.9 }).playerCount).toBe(3);
  });

  it('is deterministic with an injected RNG', () => {
    const first = setup({ rng: seeded(99), playerCount: 5, spotOn: true });
    const second = setup({ rng: seeded(99), playerCount: 5, spotOn: true });
    expect(second).toEqual(first);
  });

  it('counts all dice left at the table', () => {
    expect(totalDice(makeState([[1, 2], [], [3, 4, 5]]))).toBe(5);
    expect(aliveSeats(makeState([[1], [], [3]]))).toEqual([0, 2]);
  });

  it('counts wild ones for every face except a bid on ones', () => {
    const dice = [[1, 1, 2], [3, 4, 5]];
    expect(countFace(dice, 2, true)).toBe(3);
    expect(countFace(dice, 5, true)).toBe(3);
    expect(countFace(dice, 6, true)).toBe(2);
    expect(countFace(dice, 1, true)).toBe(2);
  });

  it('counts exact faces when ones are not wild', () => {
    const dice = [[1, 1, 2], [2, 2, 6]];
    expect(countFace(dice, 2, false)).toBe(3);
    expect(countFace(dice, 1, false)).toBe(2);
    expect(countFace(dice, 6, false)).toBe(1);
  });

  it('offers every legal first bid up to the table total', () => {
    const state = makeState([[1, 2], [3, 4], [5, 6]]);
    expect(bidOptions(state)).toHaveLength(6 * 6);
    expect(bidOptions(state).some((option) => option.quantity === 6 && option.face === 6)).toBe(true);
  });

  it('raises a bid by quantity', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    expect(higherBid(state.currentBid, 3, 1)).toBe(true);
    expect(higherBid(state.currentBid, 2, 4)).toBe(true);
  });

  it('rejects an equal or lower face at the same quantity', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    expect(higherBid(state.currentBid, 2, 3)).toBe(false);
    expect(higherBid(state.currentBid, 2, 2)).toBe(false);
    expect(bid(state, 0, 2, 2)).toMatchObject({ ok: false, error: 'not-higher' });
  });

  it('rejects a lower quantity', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 6);
    expect(higherBid(state.currentBid, 1, 6)).toBe(false);
    expect(bid(state, 0, 1, 6).error).toBe('not-higher');
  });

  it('rejects bad quantities and bad faces', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    expect(bid(state, 0, 0, 4).error).toBe('bad-quantity');
    expect(bid(state, 0, 4, 4).error).toBe('bad-quantity');
    expect(bid(state, 0, 3, 0).error).toBe('bad-face');
    expect(bid(state, 0, 3, 7).error).toBe('bad-face');
    expect(bid(state, 0, 2.5, 4).error).toBe('bad-quantity');
  });

  it('rejects out-of-turn seats, bad seats and wrong phases', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    expect(bid(state, 1, 3, 3).error).toBe('wrong-turn');
    expect(bid(state, 9, 3, 3).error).toBe('bad-seat');
    const reveal = challenge(state, 0).state;
    expect(bid(reveal, 0, 3, 3).error).toBe('bad-phase');
  });

  it('advances to the next living seat and records the bid', () => {
    const state = makeState([[1], [], [3]], { turn: 0 });
    const result = bid(state, 0, 1, 2);
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(2);
    expect(result.state.bids).toHaveLength(1);
    expect(result.state.tendencies[0].bids).toBe(1);
    expect(result.state.actions).toBe(state.actions + 1);
  });

  it('does not mutate the state passed into bid', () => {
    const state = makeState([[1], [2], [3]], { turn: 0 });
    const before = JSON.stringify(state);
    bid(state, 0, 1, 1);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Liar\'s Dice engine · challenges and rounds', () => {
  it('costs the challenger a die when the bid is true', () => {
    const state = withBid([[2], [2], [2]], 1, 1, 2, { onesWild: false });
    const result = challenge(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('reveal');
    expect(result.state.lastReveal?.bidTrue).toBe(true);
    expect(result.state.lastReveal?.callerWon).toBe(false);
    expect(result.state.lastReveal?.loser).toBe(0);
    expect(result.state.dice[0]).toHaveLength(0);
    expect(result.state.outOrder).toEqual([0]);
  });

  it('costs the bidder a die when the bid is false', () => {
    const state = withBid([[2], [3], [2]], 1, 2, 4);
    const result = challenge(state, 0);
    expect(result.state.lastReveal?.bidTrue).toBe(false);
    expect(result.state.lastReveal?.callerWon).toBe(true);
    expect(result.state.lastReveal?.loser).toBe(1);
    expect(result.state.dice[1]).toHaveLength(0);
    expect(result.state.outOrder).toEqual([1]);
  });

  it('counts wild ones in a challenge reveal', () => {
    const state = withBid([[1], [4], [5]], 1, 1, 4, { onesWild: true });
    const result = challenge(state, 0);
    expect(result.state.lastReveal?.count).toBe(2);
    expect(result.state.lastReveal?.bidTrue).toBe(true);
    expect(result.state.dice[0]).toHaveLength(0);
  });

  it('sets a reveal snapshot and pauses the turn', () => {
    const state = withBid([[2], [4], [2]], 1, 2, 2, { onesWild: false });
    const result = challenge(state, 0);
    expect(result.state.turn).toBe(-1);
    expect(result.state.phase).toBe('reveal');
    expect(result.state.lastReveal?.dice).toEqual([[2], [4], [2]]);
    expect(result.state.lastReveal?.round).toBe(state.round);
  });

  it('ends the game when a challenge empties the last challenger hand', () => {
    const state = withBid([[2], [2]], 1, 2, 2, { onesWild: false });
    const result = challenge(state, 0);
    expect(result.state.phase).toBe('game-over');
    expect(result.state.winner).toBe(1);
    expect(result.state.outOrder).toEqual([0]);
    expect(aliveSeats(result.state)).toEqual([1]);
  });

  it('lets a surviving loser start the next round', () => {
    const state = withBid([[2], [3, 3], [4]], 1, 2, 5, { onesWild: false });
    const result = challenge(state, 0);
    expect(result.state.phase).toBe('reveal');
    expect(result.state.dice[1]).toHaveLength(1);
    expect(result.state.nextStarter).toBe(1);
  });

  it('passes the next start clockwise when the loser is eliminated', () => {
    const state = withBid([[2], [3], [4, 4]], 1, 2, 5, { onesWild: false });
    const result = challenge(state, 0);
    expect(result.state.outOrder).toEqual([1]);
    expect(result.state.nextStarter).toBe(2);
  });

  it('rerolls every living hand in the next round and clears the table', () => {
    const state = withBid([[2], [3, 3], [4]], 1, 2, 5, { onesWild: false });
    const revealed = challenge(state, 0).state;
    const rng = seeded(2026);
    const next = nextRound(revealed, rng);
    expect(next.ok).toBe(true);
    expect(next.state.phase).toBe('bidding');
    expect(next.state.round).toBe(state.round + 1);
    expect(next.state.starter).toBe(1);
    expect(next.state.turn).toBe(1);
    expect(next.state.currentBid).toBeNull();
    expect(next.state.bids).toEqual([]);
    expect(next.state.lastReveal).toBeNull();
    expect(next.state.dice[0]).toHaveLength(1);
    expect(next.state.dice[1]).toHaveLength(1);
    expect(next.state.dice[2]).toHaveLength(1);
  });

  it('refuses to start a round outside a reveal', () => {
    const state = makeState([[1], [2], [3]]);
    expect(nextRound(state, seeded(1)).error).toBe('bad-phase');
  });

  it('resolves spot on exactly and costs the bidder a die', () => {
    const state = withBid([[2, 2], [3], [4]], 1, 2, 2, { onesWild: false, spotOn: true });
    const result = spotOn(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.lastReveal?.kind).toBe('spot-on');
    expect(result.state.lastReveal?.bidTrue).toBe(true);
    expect(result.state.lastReveal?.callerWon).toBe(true);
    expect(result.state.lastReveal?.loser).toBe(1);
    expect(result.state.dice[1]).toHaveLength(0);
  });

  it('misses spot on and costs the caller a die', () => {
    const state = withBid([[2, 2], [3], [4]], 1, 3, 2, { onesWild: false, spotOn: true });
    const result = spotOn(state, 0);
    expect(result.state.lastReveal?.bidTrue).toBe(false);
    expect(result.state.lastReveal?.callerWon).toBe(false);
    expect(result.state.lastReveal?.loser).toBe(0);
    expect(result.state.dice[0]).toHaveLength(1);
  });

  it('rejects spot on when the table option is off', () => {
    const state = withBid([[2], [2], [2]], 1, 1, 2, { spotOn: false });
    expect(spotOn(state, 0).error).toBe('spot-disabled');
  });

  it('requires a current bid and the right turn for a call', () => {
    const state = makeState([[2], [2], [2]], { turn: 0 });
    expect(challenge(state, 0).error).toBe('no-bid');
    expect(spotOn(state, 0).error).toBe('no-bid');
    const called = withBid([[2], [2], [2]], 1, 1, 2);
    expect(challenge(called, 1).error).toBe('wrong-turn');
  });

  it('does not mutate the state passed into a challenge', () => {
    const state = withBid([[2], [3], [2]], 1, 2, 4);
    const before = JSON.stringify(state);
    challenge(state, 0);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Liar\'s Dice engine · per-seat views', () => {
  it('hides every other hand and exposes only the requested dice', () => {
    const state = withBid([[1, 2, 3, 4, 5], [6, 6, 6], [1, 1, 1]], 0, 2, 5);
    const seat = view(state, 1, ['@you', '@ai1', '@ai2']);
    expect(Object.keys(seat)).not.toContain('dice');
    expect(seat.ownDice).toEqual([6, 6, 6]);
    expect(seat.diceCounts).toEqual([5, 3, 3]);
    expect(seat.names).toEqual(['@you', '@ai1', '@ai2']);
  });

  it('exposes every hand only after a reveal', () => {
    const state = withBid([[2], [4], [2]], 1, 2, 2, { onesWild: false });
    const revealed = challenge(state, 0).state;
    const seat = view(revealed, 2, ['A', 'B', 'C']);
    expect(seat.lastReveal).not.toBeNull();
    expect(seat.lastReveal?.dice).toEqual([[2], [4], [2]]);
  });

  it('flags the current seat and its legal calls', () => {
    const state = withBid([[1, 2], [3, 4], [5, 6]], 1, 2, 3, { spotOn: true });
    const mine = view(state, 0);
    expect(mine.canAct).toBe(true);
    expect(mine.canChallenge).toBe(true);
    expect(mine.canSpotOn).toBe(true);
    expect(mine.legalBids.length).toBeGreaterThan(0);
    const other = view(state, 1);
    expect(other.canAct).toBe(false);
    expect(other.canChallenge).toBe(false);
    expect(other.legalBids).toEqual([]);
  });

  it('clamps an invalid seat and keeps the public table', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    const seat = view(state, 99, ['@you', '@ai1', '@ai2']);
    expect(seat.seat).toBe(0);
    expect(seat.ownDice).toEqual([1]);
    expect(seat.currentBid?.quantity).toBe(2);
    expect(seat.outOrder).toEqual([]);
  });
});

describe('Liar\'s Dice engine · seat dispatch', () => {
  it('dispatches bids, challenges and spot-on calls through applySeat', () => {
    const state = makeState([[1], [2], [3]], { turn: 0 });
    const bidResult = applySeat(state, 0, { type: 'bid', quantity: 1, face: 2 });
    expect(bidResult.ok).toBe(true);
    expect(bidResult.state.currentBid?.quantity).toBe(1);
    const challengeResult = applySeat(bidResult.state, 1, { type: 'challenge' });
    expect(challengeResult.ok).toBe(true);
    expect(challengeResult.state.phase).toBe('reveal');
    const spotState = withBid([[2], [2], [2]], 1, 1, 2, { spotOn: true });
    const spotResult = applySeat(spotState, 0, { type: 'spot-on' });
    expect(spotResult.ok).toBe(true);
    expect(spotResult.state.lastReveal?.kind).toBe('spot-on');
  });

  it('rejects malformed actions and wrong seats', () => {
    const state = makeState([[1], [2], [3]], { turn: 0 });
    expect(applySeat(state, 0, { type: 'nope' } as never).error).toBe('bad-action');
    expect(applySeat(state, 1, { type: 'bid', quantity: 1, face: 1 }).error).toBe('wrong-turn');
    expect(applySeat(state, 0, null as never).error).toBe('bad-action');
  });

  it('returns no legal bids out of turn', () => {
    const state = withBid([[1], [2], [3]], 1, 2, 3);
    expect(legalBids(state, 1)).toEqual([]);
    expect(legalBids(state, 0).length).toBeGreaterThan(0);
  });
});

describe('Liar\'s Dice AI · probability, legality and bluffing', () => {
  it('returns a legal action at every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const state = setup({ rng: seeded(5), playerCount: 4 });
      const action = chooseAction(state, 0, level, seeded(6));
      expect(action).not.toBeNull();
      expect(applySeat(state, 0, action!).ok).toBe(true);
    }
  });

  it('is deterministic with an injected RNG', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const state = withBid([[1, 2], [3, 4], [5, 6]], 1, 2, 3);
      const first = chooseAction(state, 0, level, seeded(44));
      const second = chooseAction(state, 0, level, seeded(44));
      expect(second).toEqual(first);
    }
  });

  it('only chooses legal raises', () => {
    const state = withBid([[1, 2, 3], [4, 5, 6], [1, 2]], 1, 2, 4);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as AiLevel[]) {
      const choice = chooseBid(state, 0, level, seeded(7));
      expect(choice).not.toBeNull();
      if (choice) expect(higherBid(state.currentBid, choice.quantity, choice.face)).toBe(true);
    }
  });

  it('does not read the other players\' hidden dice', () => {
    const first = withBid(
      [[1, 2, 3, 4, 5], [6, 6, 6], [1, 1, 1]],
      1,
      2,
      3,
    );
    const second = withBid(
      [[1, 2, 3, 4, 5], [2, 3, 4], [5, 5, 5]],
      1,
      2,
      3,
    );
    expect(chooseAction(second, 0, 'hard', seeded(18))).toEqual(
      chooseAction(first, 0, 'hard', seeded(18)),
    );
  });

  it('challenges a bid that cannot be true', () => {
    const state = withBid([[2], [3]], 1, 1, 6, { onesWild: false, spotOn: false });
    expect(chooseAction(state, 0, 'hard', seeded(2))).toEqual({ type: 'challenge' });
  });

  it('lets Hard take an exact spot-on when it beats the challenge line', () => {
    const state = withBid([[2, 2], [4]], 1, 2, 2, { onesWild: false, spotOn: true });
    expect(chooseAction(state, 0, 'hard', seeded(3))).toEqual({ type: 'spot-on' });
  });

  it('never asks Companion to call spot on', () => {
    const state = withBid([[2, 2], [4]], 1, 2, 2, { onesWild: false, spotOn: true });
    const action = chooseAction(state, 0, 'companion', () => 0.1);
    expect(action?.type).not.toBe('spot-on');
  });

  it('reports a probability between zero and one', () => {
    const state = withBid([[1, 2, 3, 4, 5], [6, 6, 6], [1, 1, 1]], 1, 2, 3);
    const estimate = evaluateBid(state, 0, 2, 3, true);
    expect(estimate.trueChance).toBeGreaterThanOrEqual(0);
    expect(estimate.trueChance).toBeLessThanOrEqual(1);
    expect(estimate.exactChance).toBeGreaterThanOrEqual(0);
    expect(estimate.exactChance).toBeLessThanOrEqual(1);
    expect(estimate.known).toBeGreaterThanOrEqual(0);
    expect(estimate.unknown).toBe(6);
  });

  it('returns a legal fallback action for a dropped seat', () => {
    const state = withBid([[1, 2], [3, 4], [5, 6]], 1, 2, 3);
    const action = fallbackAction(state, 0);
    expect(action).not.toBeNull();
    expect(applySeat(state, 0, action!).ok).toBe(true);
  });

  it('finishes a full six-seat AI game with one winner', () => {
    const rng = seeded(707);
    let state = setup({ rng, playerCount: 6, onesWild: true, spotOn: true, starter: 0 });
    let guard = 0;
    while (state.phase !== 'game-over' && guard < 4000) {
      guard += 1;
      if (state.phase === 'reveal') {
        const next = nextRound(state, rng);
        expect(next.ok).toBe(true);
        state = next.state;
        continue;
      }
      const seat = state.turn;
      const action = chooseAction(state, seat, 'hard', rng);
      expect(action).not.toBeNull();
      const result = applySeat(state, seat, action!);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.phase).toBe('game-over');
    expect(state.winner).not.toBeNull();
    expect(aliveSeats(state)).toEqual([state.winner]);
    expect(state.outOrder).toHaveLength(5);
    expect(guard).toBeLessThan(4000);
  });
});

describe('Liar\'s Dice hints', () => {
  it('returns a legal bid with a reason on a fresh table', () => {
    const state = setup({ rng: seeded(12), playerCount: 3 });
    const advice = hint(state, 0);
    expect(advice).not.toBeNull();
    expect(advice?.action.type).toBe('bid');
    expect(['safe', 'pressure', 'risk']).toContain(advice?.kind);
    expect(advice?.chance).toBeGreaterThan(0);
    if (advice?.action.type === 'bid') {
      expect(applySeat(state, 0, advice.action).ok).toBe(true);
    }
  });

  it('suggests a challenge when the bid is very unlikely', () => {
    const state = withBid([[2], [3]], 1, 1, 6, { onesWild: false, spotOn: false });
    const advice = hint(state, 0);
    expect(advice?.action.type).toBe('challenge');
    expect(['challenge', 'read']).toContain(advice?.kind);
  });

  it('returns no hint out of turn or after a reveal', () => {
    const state = withBid([[2], [3], [4]], 1, 2, 3);
    expect(hint(state, 1)).toBeNull();
    const revealed = challenge(state, 0).state;
    expect(hint(revealed, 0)).toBeNull();
  });
});

describe('Family record', () => {
  function finished(): GameState {
    const state = withBid([[2], [2]], 1, 1, 6, { onesWild: false });
    return challenge(state, 0).state;
  }

  it('records the winner, standings, mode and level', () => {
    const state = finished();
    const record = addGame(EMPTY_RECORD, state, ['@you', '@ai1'], { mode: 'ai', level: 'normal' }, 123);
    expect(record.games).toBe(1);
    expect(record.byMode.ai).toBe(1);
    expect(record.wins['@you']).toBe(1);
    expect(record.lastWinner).toBe('@you');
    expect(record.recent).toHaveLength(1);
    expect(record.recent[0].winner).toBe('@you');
    expect(record.recent[0].standings).toEqual(['@you', '@ai1']);
    expect(record.recent[0].level).toBe('normal');
    expect(record.recent[0].at).toBe(123);
  });

  it('keeps only the eight newest games', () => {
    let record: FamilyRecord = EMPTY_RECORD;
    const state = finished();
    for (let index = 0; index < 10; index += 1) {
      record = addGame(record, state, ['@you', '@ai1'], { mode: 'local' }, 1000 + index);
    }
    expect(record.games).toBe(10);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1009);
    expect(record.recent[7].at).toBe(1002);
  });

  it('normalizes malformed and legacy records safely', () => {
    const record = normalizeRecord({
      games: Number.NaN,
      byMode: { ai: 2.7, local: -1, lan: 1 },
      wins: { Ada: 2, Bo: -3, Cyd: 1.2, Dee: '4' as unknown as number },
      lastWinner: '',
      recent: [
        { winner: 'Ada', standings: ['Ada', 'Bo'], playerCount: 2, mode: 'ai', round: 2, at: 99 },
        { winner: '', standings: [], playerCount: 9, mode: 'x', round: 0, at: 'no' },
      ],
    } as unknown as Partial<FamilyRecord>);
    expect(record.games).toBe(0);
    expect(record.byMode).toEqual({ ai: 2, local: 0, lan: 1 });
    expect(record.wins).toEqual({ Ada: 2, Cyd: 1 });
    expect(record.lastWinner).toBeNull();
    expect(record.recent).toHaveLength(1);
  });
});

describe('Bilingual copy and demo fixtures', () => {
  it('exposes the same keys in English and Chinese', () => {
    expect(Object.keys(MESSAGES.zh).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });

  it('keeps Chinese out of the English UI except the switch', () => {
    const values = Object.entries(MESSAGES.en)
      .filter(([key]) => key !== 'language')
      .map(([, value]) => value)
      .join(' ');
    expect(/[\u4e00-\u9fff]/.test(values)).toBe(false);
  });

  it('keeps English words out of the Chinese UI except the switch', () => {
    const values = Object.entries(MESSAGES.zh)
      .filter(([key]) => key !== 'language')
      .map(([, value]) => value.replace(/\{[a-z]+\}/g, ''))
      .join(' ');
    expect(/[A-Za-z]/.test(values)).toBe(false);
  });

  it('documents spot on and wild ones in both rule sets', () => {
    expect(MESSAGES.en.rule8).toContain('Spot on');
    expect(MESSAGES.zh.rule8).toContain('正好');
    expect(MESSAGES.en.rule9).toContain('Ones wild');
    expect(MESSAGES.zh.rule9).toContain('一点万能');
  });

  it('builds a valid mid-round demo state with private dice', () => {
    const fixture = demoFixture('game');
    expect(fixture.state.phase).toBe('bidding');
    expect(fixture.state.playerCount).toBe(4);
    expect(view(fixture.state, 0).ownDice).toHaveLength(5);
    expect(view(fixture.state, 0).currentBid?.quantity).toBe(4);
  });

  it('builds reveal and game-over demo states with full dice', () => {
    const reveal = demoFixture('reveal');
    expect(reveal.state.phase).toBe('reveal');
    expect(view(reveal.state, 0).lastReveal?.dice).toHaveLength(4);
    const over = demoFixture('gameover');
    expect(over.state.phase).toBe('game-over');
    expect(over.state.winner).toBe(0);
    expect(view(over.state, 0).outOrder).toEqual([2, 1]);
  });
});
