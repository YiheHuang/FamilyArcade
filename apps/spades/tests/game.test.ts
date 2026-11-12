import { describe, expect, it } from 'vitest';
import {
  RANK_VALUE,
  bid,
  cardId,
  legalCards,
  matchWinner,
  nextRound,
  play,
  reveal,
  scoreRound,
  setup,
  trickWinner,
  view,
  type Bid,
  type Card,
  type GameState,
  type Seat,
} from '../src/game/spades';
import {
  chooseBid,
  chooseCard,
  hintBid,
  hintPlay,
  handStrength,
} from '../src/ai/ai';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function fresh(seed = 7): GameState {
  return setup({ rng: seeded(seed), dealer: 3, target: 500, blindNil: true });
}

function biddingDone(seed = 7): GameState {
  let state = fresh(seed);
  for (let step = 0; step < 4; step += 1) {
    state = reveal(state, state.turn);
    const result = bid(state, state.turn, 3);
    if (!result.ok) throw new Error(`bid failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

function lowestLegal(state: GameState): string {
  const cards = legalCards(state, state.turn);
  const sorted = cards.slice().sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  return cardId(sorted[0]);
}

function playOneRound(seed = 7): GameState {
  let state = biddingDone(seed);
  let guard = 0;
  while (state.phase === 'playing' && guard < 60) {
    guard += 1;
    const result = play(state, state.turn, lowestLegal(state));
    if (!result.ok) throw new Error(`play failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

function scenario(overrides: Partial<GameState> & { hands: Card[][] }): GameState {
  const base = setup({ rng: seeded(8), dealer: 3, target: 500, blindNil: true });
  return {
    ...base,
    phase: 'playing',
    seen: [true, true, true, true],
    bids: [
      { value: 3, blind: false },
      { value: 3, blind: false },
      { value: 3, blind: false },
      { value: 3, blind: false },
    ],
    turn: 0,
    spadesBroken: true,
    ...overrides,
  };
}

describe('Spades engine · deal and bidding', () => {
  it('deals 52 unique cards, 13 to each seat, with bidding left of the dealer', () => {
    const state = fresh();
    const all = state.hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all.map(cardId)).size).toBe(52);
    for (const hand of state.hands) expect(hand).toHaveLength(13);
    expect(state.phase).toBe('bidding');
    expect(state.dealer).toBe(3);
    expect(state.turn).toBe(0);
    expect(state.target).toBe(500);
  });

  it('is deterministic for a given RNG and deals differently for another', () => {
    expect(fresh(21).hands).toEqual(fresh(21).hands);
    expect(fresh(21).hands).not.toEqual(fresh(22).hands);
  });

  it('hides the hand until the seat looks, and reveals only that seat', () => {
    const state = fresh();
    expect(view(state, 0).hand).toEqual([]);
    expect(view(state, 0).blindAvailable).toBe(true);
    const one = reveal(state, 0);
    expect(view(one, 0).hand).toHaveLength(13);
    expect(view(one, 1).hand).toEqual([]);
    expect(view(one, 0).blindAvailable).toBe(false);
  });

  it('requires a look before a normal bid, and allows blind nil only before looking', () => {
    const state = fresh();
    expect(bid(state, 0, 3).error).toBe('not-seen');
    expect(bid(state, 0, 0, true).ok).toBe(true);
    const looked = reveal(state, 0);
    expect(bid(looked, 0, 0, true).error).toBe('blind-not-allowed');
    expect(bid(looked, 0, 0).ok).toBe(true);
  });

  it('rejects blind nil when the table turns it off', () => {
    const state = setup({ rng: seeded(3), dealer: 3, blindNil: false });
    expect(bid(state, 0, 0, true).error).toBe('blind-not-allowed');
  });

  it('runs bidding in order and starts play left of the dealer', () => {
    let state = fresh();
    expect(state.turn).toBe(0);
    state = reveal(state, 0);
    state = bid(state, 0, 3).state;
    expect(state.turn).toBe(1);
    state = reveal(state, 1);
    state = bid(state, 1, 4).state;
    state = reveal(state, 2);
    state = bid(state, 2, 2).state;
    expect(state.phase).toBe('bidding');
    state = reveal(state, 3);
    state = bid(state, 3, 5).state;
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe(0);
    expect(state.seen).toEqual([true, true, true, true]);
    expect(state.bids.map((item) => item?.value)).toEqual([3, 4, 2, 5]);
  });

  it('rejects bids outside 0–13 and bids out of turn', () => {
    const state = reveal(fresh(), 0);
    expect(bid(state, 0, 14).error).toBe('bad-bid');
    expect(bid(state, 0, -1).error).toBe('bad-bid');
    expect(bid(state, 1, 3).error).toBe('wrong-turn');
  });
});

describe('Spades engine · legal play and tricks', () => {
  it('must follow the led suit when possible', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('3', 'H'), card('A', 'S')],
        [card('2', 'H')],
        [card('10', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('2', 'H') },
        { seat: 2, card: card('10', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
    });
    expect(legalCards(state, 0).map(cardId)).toEqual(['KH', '3H']);
    expect(play(state, 0, 'AS').error).toBe('must-follow');
  });

  it('cannot lead spades until broken, unless the hand is all spades', () => {
    const state = scenario({
      hands: [[card('A', 'S'), card('2', 'H')], [], [], []],
      spadesBroken: false,
    });
    expect(legalCards(state, 0).map(cardId)).toEqual(['2H']);
    expect(play(state, 0, 'AS').error).toBe('spades-not-broken');
    const allSpades = scenario({
      hands: [[card('A', 'S'), card('2', 'S')], [], [], []],
      spadesBroken: false,
    });
    expect(legalCards(allSpades, 0)).toHaveLength(2);
  });

  it('breaks spades when a spade is discarded or trumped', () => {
    const state = scenario({
      hands: [[card('2', 'S')], [card('A', 'H')], [], []],
      currentTrick: [{ seat: 1, card: card('A', 'H') }],
      turn: 0,
      spadesBroken: false,
    });
    const result = play(state, 0, '2S');
    expect(result.ok).toBe(true);
    expect(result.state.spadesBroken).toBe(true);
  });

  it('lets the highest spade win, otherwise the highest card of the led suit', () => {
    expect(
      trickWinner([
        { seat: 1, card: card('A', 'H') },
        { seat: 2, card: card('2', 'S') },
        { seat: 3, card: card('K', 'S') },
        { seat: 0, card: card('K', 'H') },
      ]),
    ).toBe(3);
    expect(
      trickWinner([
        { seat: 1, card: card('10', 'H') },
        { seat: 2, card: card('K', 'H') },
        { seat: 3, card: card('2', 'C') },
        { seat: 0, card: card('A', 'D') },
      ]),
    ).toBe(2);
  });

  it('rejects a card that is not in hand or not on turn', () => {
    const state = scenario({
      hands: [[card('A', 'S')], [card('2', 'H')], [], []],
      currentTrick: [],
    });
    expect(play(state, 0, '2H').error).toBe('not-your-card');
    expect(play(state, 1, '2H').error).toBe('wrong-turn');
  });

  it('completes a trick, records the winner, and gives that seat the lead', () => {
    const state = scenario({
      hands: [[card('2', 'C')], [card('A', 'H')], [], [card('K', 'H')]],
      currentTrick: [
        { seat: 1, card: card('A', 'H') },
        { seat: 2, card: card('3', 'H') },
        { seat: 3, card: card('K', 'H') },
      ],
      turn: 0,
      tricksBySeat: [0, 0, 0, 0],
      tricks: [],
    });
    const result = play(state, 0, '2C');
    expect(result.ok).toBe(true);
    expect(result.state.currentTrick).toEqual([]);
    expect(result.state.turn).toBe(1);
    expect(result.state.tricks).toHaveLength(1);
    expect(result.state.tricks[0].winner).toBe(1);
    expect(result.state.tricksBySeat).toEqual([0, 1, 0, 0]);
    expect(result.state.lastTrick?.winner).toBe(1);
  });

  it('does not mutate the state handed to play or return a shared hand array', () => {
    const state = scenario({
      hands: [[card('A', 'S')], [card('2', 'H')], [], []],
      currentTrick: [],
    });
    const snapshot = JSON.stringify(state);
    const result = play(state, 0, 'AS');
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(result.state.hands[0]).toHaveLength(0);
    expect(state.hands[0]).toHaveLength(1);
  });
});

describe('Spades engine · scoring', () => {
  const base = {
    round: 1,
    dealer: 3 as Seat,
    scores: [0, 0] as [number, number],
    bags: [0, 0] as [number, number],
  };
  const bidList = (values: number[], blind: boolean[] = []): Bid[] =>
    values.map((value, index) => ({ value, blind: blind[index] ?? false }));

  it('pays a made contract and one point per overtrick, adding a bag', () => {
    const result = scoreRound({
      ...base,
      bids: bidList([4, 3, 4, 3]),
      tricksBySeat: [5, 2, 4, 2],
    });
    expect(result.summary.teamBids).toEqual([8, 6]);
    expect(result.summary.eligibleTricks).toEqual([9, 4]);
    expect(result.summary.contractMade).toEqual([true, false]);
    expect(result.summary.points).toEqual([81, -60]);
    expect(result.scores).toEqual([81, -60]);
    expect(result.bags).toEqual([1, 0]);
  });

  it('sets a contract for minus ten per bid', () => {
    const result = scoreRound({
      ...base,
      bids: bidList([5, 4, 5, 4]),
      tricksBySeat: [3, 4, 3, 4],
    });
    expect(result.summary.points).toEqual([-100, 80]);
    expect(result.summary.contractMade).toEqual([false, true]);
  });

  it('adds a nil bonus and keeps nil tricks out of the contract', () => {
    const result = scoreRound({
      ...base,
      bids: bidList([0, 3, 3, 3]),
      tricksBySeat: [0, 4, 3, 3],
    });
    expect(result.summary.eligibleTricks).toEqual([3, 7]);
    expect(result.summary.allTricks).toEqual([3, 7]);
    expect(result.summary.points).toEqual([130, 61]);
    expect(result.bags).toEqual([0, 1]);
    expect(result.summary.nilResults[0]).toMatchObject({ made: true, points: 100 });
  });

  it('penalises a failed nil without counting its tricks as bags', () => {
    const result = scoreRound({
      ...base,
      bids: bidList([0, 3, 3, 3]),
      tricksBySeat: [1, 4, 2, 3],
    });
    expect(result.summary.points).toEqual([-130, 61]);
    expect(result.bags).toEqual([0, 1]);
    expect(result.summary.nilResults[0]).toMatchObject({ made: false, points: -100 });
  });

  it('pays blind nil at ±200', () => {
    const made = scoreRound({
      ...base,
      bids: bidList([0, 3, 3, 3], [true]),
      tricksBySeat: [0, 4, 3, 3],
    });
    expect(made.summary.points).toEqual([230, 61]);
    const failed = scoreRound({
      ...base,
      bids: bidList([0, 3, 3, 3], [true]),
      tricksBySeat: [1, 4, 2, 3],
    });
    expect(failed.summary.points).toEqual([-230, 61]);
  });

  it('handles both partners going nil', () => {
    const result = scoreRound({
      ...base,
      bids: bidList([0, 3, 0, 3]),
      tricksBySeat: [0, 4, 0, 3],
    });
    expect(result.summary.teamBids).toEqual([0, 6]);
    expect(result.summary.points).toEqual([200, 61]);
    expect(result.summary.nilResults.filter((item) => item.made)).toHaveLength(2);
  });

  it('charges 100 when ten bags accumulate and keeps the remainder', () => {
    const result = scoreRound({
      ...base,
      scores: [0, 0],
      bags: [9, 0],
      bids: bidList([3, 3, 3, 3]),
      tricksBySeat: [7, 1, 4, 1],
    });
    expect(result.summary.eligibleTricks).toEqual([11, 2]);
    expect(result.summary.points).toEqual([-35, -60]);
    expect(result.summary.bagPenalties).toEqual([100, 0]);
    expect(result.bags).toEqual([4, 0]);
    expect(result.scores).toEqual([-35, -60]);
  });

  it('ends the match at the target and lets the higher score win a double-cross', () => {
    expect(matchWinner([500, 480], 500)).toBe(0);
    expect(matchWinner([480, 500], 500)).toBe(1);
    expect(matchWinner([520, 510], 500)).toBe(0);
    expect(matchWinner([500, 500], 500)).toBeNull();
    expect(matchWinner([499, 499], 500)).toBeNull();
  });
});

describe('Spades engine · full round, round rotation and match', () => {
  it('finishes a round after 13 tricks and summarises it', () => {
    const state = playOneRound(11);
    expect(state.phase).toBe('round-over');
    expect(state.tricks).toHaveLength(13);
    expect(state.lastRound?.round).toBe(1);
    expect(state.tricksBySeat.reduce((sum, value) => sum + value, 0)).toBe(13);
    expect((state.lastRound?.allTricks[0] ?? 0) + (state.lastRound?.allTricks[1] ?? 0)).toBe(13);
  });

  it('rotates the dealer and deals a fresh round only from the round summary', () => {
    const finished = playOneRound(12);
    expect(nextRound(finished, seeded(1)).ok).toBe(true);
    const next = nextRound(finished, seeded(1)).state;
    expect(next.phase).toBe('bidding');
    expect(next.round).toBe(2);
    expect(next.dealer).toBe(0);
    expect(next.turn).toBe(1);
    expect(next.hands.flat()).toHaveLength(52);
    const playing = biddingDone(12);
    expect(nextRound(playing, seeded(1)).error).toBe('bad-phase');
  });

  it('plays a full match to a target and stops at a winner', () => {
    let state = setup({ rng: seeded(99), dealer: 3, target: 100, blindNil: true });
    let rounds = 0;
    while (state.phase !== 'done' && rounds < 120) {
      rounds += 1;
      for (let step = 0; step < 4; step += 1) {
        state = reveal(state, state.turn);
        state = bid(state, state.turn, 3).state;
      }
      while (state.phase === 'playing') {
        state = play(state, state.turn, lowestLegal(state)).state;
      }
      if (state.phase === 'round-over') state = nextRound(state, seeded(100 + rounds)).state;
    }
    expect(state.phase).toBe('done');
    expect(state.winner).not.toBeNull();
    expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(100);
    expect(rounds).toBeGreaterThan(1);
  });
});

describe('Spades per-seat views', () => {
  it('never exposes another seat’s hand', () => {
    const state = fresh();
    for (let seat = 0; seat < 4; seat += 1) {
      const text = JSON.stringify(view(state, seat));
      for (let other = 0; other < 4; other += 1) {
        if (other === seat) continue;
        for (const cardInHand of state.hands[other]) {
          expect(text).not.toContain(cardId(cardInHand));
        }
      }
    }
  });

  it('reports the right turn, legal cards and hand count to each seat', () => {
    const state = biddingDone(4);
    const seen = view(state, 0);
    expect(seen.seat).toBe(0);
    expect(seen.team).toBe(0);
    expect(seen.partner).toBe(2);
    expect(seen.canPlay).toBe(true);
    expect(seen.hand).toHaveLength(13);
    expect(seen.legal.length).toBeGreaterThan(0);
    expect(seen.legal.every((id) => seen.hand.some((item) => cardId(item) === id))).toBe(true);
    expect(view(state, 1).canPlay).toBe(false);
    expect(view(state, 1).hand).toHaveLength(13);
    expect(seen.handCounts).toEqual([13, 13, 13, 13]);
  });

  it('reports blind availability only while bidding and unseen', () => {
    const state = fresh();
    expect(view(state, 0).blindAvailable).toBe(true);
    const looked = reveal(state, 0);
    expect(view(looked, 0).blindAvailable).toBe(false);
    const playing = biddingDone(5);
    expect(view(playing, 0).blindAvailable).toBe(false);
  });
});

describe('Spades AI and hints', () => {
  it('estimates a weak hand lower than a strong one', () => {
    const weak = [
      card('2', 'C'), card('3', 'C'), card('4', 'C'), card('5', 'C'),
      card('2', 'D'), card('3', 'D'), card('4', 'D'), card('5', 'D'),
      card('2', 'H'), card('3', 'H'), card('4', 'H'), card('5', 'H'),
      card('2', 'S'),
    ];
    const strong = [
      card('A', 'S'), card('K', 'S'), card('Q', 'S'), card('A', 'H'),
      card('K', 'H'), card('A', 'D'), card('K', 'D'), card('A', 'C'),
      card('K', 'C'), card('Q', 'H'), card('J', 'D'), card('10', 'C'),
      card('3', 'S'),
    ];
    expect(handStrength(weak)).toBeLessThan(handStrength(strong));
    expect(handStrength(strong)).toBeGreaterThan(5);
  });

  it('follows suit with every AI level', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('3', 'H'), card('A', 'S')],
        [card('2', 'H')],
        [card('10', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('2', 'H') },
        { seat: 2, card: card('10', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
    });
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const id = chooseCard(state, 0, level, seeded(2));
      expect(['KH', '3H']).toContain(id);
    }
  });

  it('ducks when partner is already winning the trick', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('3', 'H'), card('A', 'S')],
        [card('2', 'H')],
        [card('10', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('2', 'H') },
        { seat: 2, card: card('10', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
    });
    expect(chooseCard(state, 0, 'normal', seeded(2))).toBe('3H');
    expect(chooseCard(state, 0, 'companion', seeded(2))).toBe('3H');
  });

  it('covers a partner who went nil', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('3', 'H'), card('A', 'S')],
        [card('2', 'H')],
        [card('10', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('2', 'H') },
        { seat: 2, card: card('10', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
      bids: [
        { value: 3, blind: false },
        { value: 3, blind: false },
        { value: 0, blind: false },
        { value: 3, blind: false },
      ],
    });
    expect(chooseCard(state, 0, 'normal', seeded(2))).toBe('KH');
  });

  it('keeps a nil bidder away from a winning trick', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('2', 'H'), card('A', 'S')],
        [card('10', 'H')],
        [card('4', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('10', 'H') },
        { seat: 2, card: card('4', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
      bids: [
        { value: 0, blind: false },
        { value: 3, blind: false },
        { value: 3, blind: false },
        { value: 3, blind: false },
      ],
    });
    expect(chooseCard(state, 0, 'normal', seeded(2))).toBe('2H');
  });

  it('lets an opponent’s nil bid take the trick', () => {
    const state = scenario({
      hands: [
        [card('K', 'H'), card('2', 'H'), card('A', 'S')],
        [card('10', 'H')],
        [card('4', 'H')],
        [card('5', 'H')],
      ],
      currentTrick: [
        { seat: 1, card: card('10', 'H') },
        { seat: 2, card: card('4', 'H') },
        { seat: 3, card: card('5', 'H') },
      ],
      bids: [
        { value: 3, blind: false },
        { value: 0, blind: false },
        { value: 3, blind: false },
        { value: 3, blind: false },
      ],
    });
    expect(chooseCard(state, 0, 'normal', seeded(2))).toBe('2H');
  });

  it('returns a legal bid and a legal card for every level', () => {
    const bidding = reveal(fresh(31), 0);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const choice = chooseBid(bidding, 0, level, seeded(77)).value;
      expect(choice).toBeGreaterThanOrEqual(0);
      expect(choice).toBeLessThanOrEqual(13);
    }
    const playing = biddingDone(31);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const id = chooseCard(playing, 0, level, seeded(9));
      expect(playing.hands[0].some((item) => cardId(item) === id)).toBe(true);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = biddingDone(41);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const first = chooseCard(state, 0, level, seeded(123));
      const second = chooseCard(state, 0, level, seeded(123));
      expect(second).toBe(first);
    }
  });

  it('offers a nil hint for a very weak hand and a strong-spade reason for a big one', () => {
    const base = fresh(51);
    const weak = scenario({
      hands: [
        [
          card('2', 'C'), card('3', 'C'), card('4', 'C'), card('5', 'C'),
          card('2', 'D'), card('3', 'D'), card('4', 'D'), card('5', 'D'),
          card('2', 'H'), card('3', 'H'), card('4', 'H'), card('5', 'H'),
          card('2', 'S'),
        ],
        base.hands[1], base.hands[2], base.hands[3],
      ],
      phase: 'bidding',
      turn: 0,
      seen: [true, true, true, true],
      bids: [null, { value: 3, blind: false }, { value: 3, blind: false }, { value: 3, blind: false }],
      currentTrick: [],
    });
    const hint = hintBid(weak, 0);
    expect(hint?.value).toBe(0);
    expect(hint?.kind).toBe('nil');

    const strong = scenario({
      hands: [
        [
          card('A', 'S'), card('K', 'S'), card('Q', 'S'), card('J', 'S'),
          card('10', 'S'), card('A', 'H'), card('K', 'H'), card('A', 'D'),
          card('K', 'D'), card('A', 'C'), card('K', 'C'), card('2', 'H'),
          card('3', 'D'),
        ],
        base.hands[1], base.hands[2], base.hands[3],
      ],
      phase: 'bidding',
      turn: 0,
      seen: [true, true, true, true],
      bids: [null, { value: 3, blind: false }, { value: 2, blind: false }, { value: 3, blind: false }],
      currentTrick: [],
    });
    const big = hintBid(strong, 0);
    expect(big).not.toBeNull();
    expect(big?.value).toBeGreaterThanOrEqual(4);
    expect(big?.kind).toBe('strongSpades');
  });

  it('gives a legal card hint with a reason', () => {
    const state = biddingDone(61);
    const hint = hintPlay(state, 0);
    expect(hint).not.toBeNull();
    expect(state.hands[0].some((item) => cardId(item) === hint?.cardId)).toBe(true);
    expect(['win', 'lead', 'follow', 'duck', 'trump', 'coverNil', 'bagGuard', 'low']).toContain(
      hint?.kind,
    );
  });
});
