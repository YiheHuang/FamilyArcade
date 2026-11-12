import { describe, expect, it } from 'vitest';
import { chooseBid, choosePlay, hintPlay } from '../src/ai/ai';
import {
  beats,
  bid,
  detectCombo,
  makeDeck,
  pass,
  play,
  setup,
  sortHand,
  view,
  type Card,
  type GameState,
  type Seat,
} from '../src/game/doudizhu';

const DECK = makeDeck();
const BY_ID = new Map(DECK.map((card) => [card.id, card]));

function cs(ids: string[]): Card[] {
  return ids.map((id) => {
    const card = BY_ID.get(id);
    if (!card) throw new Error(`unknown card ${id}`);
    return { ...card };
  });
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function fixture({
  hands,
  turn = 0,
  lastPlay = null,
  lastPlayer = -1,
  passes = 0,
  plays = [0, 0, 0],
  bombs = 0,
  bids = [3, null, null],
  highestBid = 3,
  highestBidder = 0,
  landlord = 0,
}: {
  hands: Card[][];
  turn?: number;
  lastPlay?: GameState['lastPlay'];
  lastPlayer?: number;
  passes?: number;
  plays?: number[];
  bombs?: number;
  bids?: (number | null)[];
  highestBid?: number;
  highestBidder?: number;
  landlord?: number;
}): GameState {
  return {
    phase: 'playing',
    deal: 1,
    firstBidder: 0,
    turn,
    hands,
    bottom: cs(['3D', '4D', '5D']),
    bids,
    highestBid,
    highestBidder,
    landlord,
    lastPlay,
    lastPlayer,
    passes,
    plays,
    bombs,
    result: null,
  };
}

describe('Dou Dizhu deck and deal', () => {
  it('builds a 54-card deck with 52 suited cards and two jokers', () => {
    expect(DECK).toHaveLength(54);
    expect(new Set(DECK.map((card) => card.id)).size).toBe(54);
    expect(DECK.filter((card) => card.rank >= 16)).toHaveLength(2);
    expect(DECK.filter((card) => card.rank === 15)).toHaveLength(4);
  });

  it('deals 17/17/17 plus three bottom cards with no overlap', () => {
    const state = setup({ rng: seeded(7) });
    expect(state.hands.map((hand) => hand.length)).toEqual([17, 17, 17]);
    expect(state.bottom).toHaveLength(3);
    const ids = [...state.hands.flat(), ...state.bottom].map((card) => card.id);
    expect(new Set(ids).size).toBe(54);
  });

  it('starts bidding at the first bidder with a clean bid board', () => {
    const state = setup({ rng: seeded(8), firstBidder: 0 });
    expect(state.phase).toBe('bidding');
    expect(state.turn).toBe(0);
    expect(state.bids).toEqual([null, null, null]);
    expect(state.landlord).toBe(-1);
    expect(state.highestBid).toBe(0);
  });

  it('is deterministic for the same injected RNG', () => {
    const a = setup({ rng: seeded(42) });
    const b = setup({ rng: seeded(42) });
    expect(a.hands[0].map((card) => card.id)).toEqual(b.hands[0].map((card) => card.id));
    expect(a.bottom.map((card) => card.id)).toEqual(b.bottom.map((card) => card.id));
  });
});

describe('Dou Dizhu bidding', () => {
  it('rejects a bid that is not higher than the current bid', () => {
    const state = setup({ rng: seeded(9) });
    const first = bid(state, 0, 2, seeded(10));
    expect(first.ok).toBe(true);
    const lower = bid(first.state, 1, 2, seeded(11));
    expect(lower.ok).toBe(false);
    expect(lower.error).toBe('bid-too-low');
  });

  it('gives the bottom cards to the highest bidder', () => {
    let state = setup({ rng: seeded(12) });
    state = bid(state, 0, 1, seeded(13)).state;
    state = bid(state, 1, 2, seeded(14)).state;
    state = bid(state, 2, 0, seeded(15)).state;
    expect(state.phase).toBe('playing');
    expect(state.landlord).toBe(1);
    expect(state.hands[1]).toHaveLength(20);
    expect(state.hands[0]).toHaveLength(17);
    expect(state.turn).toBe(1);
    expect(state.bottom).toHaveLength(3);
  });

  it('ends bidding immediately on a three bid', () => {
    let state = setup({ rng: seeded(16) });
    state = bid(state, 0, 3, seeded(17)).state;
    expect(state.phase).toBe('playing');
    expect(state.landlord).toBe(0);
    expect(state.hands[0]).toHaveLength(20);
  });

  it('redeals after three passes', () => {
    let state = setup({ rng: seeded(18) });
    const firstHands = state.hands.map((hand) => hand.map((card) => card.id).join(','));
    state = bid(state, 0, 0, seeded(19)).state;
    state = bid(state, 1, 0, seeded(20)).state;
    state = bid(state, 2, 0, seeded(21)).state;
    expect(state.phase).toBe('bidding');
    expect(state.deal).toBe(2);
    expect(state.bids).toEqual([null, null, null]);
    expect(state.firstBidder).toBe(1);
    expect(state.hands.map((hand) => hand.map((card) => card.id).join(','))).not.toEqual(firstHands);
  });

  it('keeps the bottom cards hidden during bidding and shows them after the bid', () => {
    const bidding = setup({ rng: seeded(22) });
    expect(view(bidding, 0).bottom).toEqual([]);
    expect(view(bidding, 0).bottomRevealed).toBe(false);
    const playing = bid(bidding, 0, 3, seeded(23)).state;
    expect(view(playing, 0).bottom).toHaveLength(3);
    expect(view(playing, 1).bottom).toHaveLength(3);
  });
});

describe('Dou Dizhu combinations', () => {
  it('recognises single, pair and triple', () => {
    expect(detectCombo(cs(['3S']))?.kind).toBe('single');
    expect(detectCombo(cs(['3S', '3H']))?.kind).toBe('pair');
    expect(detectCombo(cs(['3S', '3H', '3C']))?.kind).toBe('triple');
  });

  it('recognises triple with a single or a pair', () => {
    const single = detectCombo(cs(['3S', '3H', '3C', '9D']));
    expect(single?.kind).toBe('triple-single');
    expect(single?.rank).toBe(3);
    const pair = detectCombo(cs(['3S', '3H', '3C', '9D', '9S']));
    expect(pair?.kind).toBe('triple-pair');
    expect(pair?.rank).toBe(3);
  });

  it('recognises straights of five or more and rejects short, gapped or two-high runs', () => {
    const straight = detectCombo(cs(['3S', '4H', '5C', '6D', '7S']));
    expect(straight?.kind).toBe('straight');
    expect(straight?.rank).toBe(7);
    expect(detectCombo(cs(['3S', '4H', '5C', '6D']))).toBeNull();
    expect(detectCombo(cs(['3S', '4H', '5C', '7D', '8S']))).toBeNull();
    expect(detectCombo(cs(['11S', '12H', '13C', '14D', '15S']))).toBeNull();
  });

  it('recognises consecutive pairs of three or more', () => {
    const chain = detectCombo(cs(['3S', '3H', '4S', '4H', '5S', '5H']));
    expect(chain?.kind).toBe('pairs');
    expect(chain?.rank).toBe(5);
    expect(detectCombo(cs(['3S', '3H', '4S', '4H']))).toBeNull();
  });

  it('recognises a bare airplane', () => {
    const combo = detectCombo(cs(['3S', '3H', '3C', '4S', '4H', '4C']));
    expect(combo?.kind).toBe('airplane');
    expect(combo?.rank).toBe(4);
  });

  it('recognises airplane with single wings', () => {
    const combo = detectCombo(cs(['3S', '3H', '3C', '4S', '4H', '4C', '9S', '13D']));
    expect(combo?.kind).toBe('airplane-single');
    expect(combo?.size).toBe(8);
  });

  it('recognises airplane with pair wings', () => {
    const combo = detectCombo(
      cs(['3S', '3H', '3C', '4S', '4H', '4C', '9S', '9H', '13D', '13C']),
    );
    expect(combo?.kind).toBe('airplane-pair');
    expect(combo?.size).toBe(10);
  });

  it('rejects an extra triple used as single airplane wings', () => {
    expect(
      detectCombo(
        cs(['3S', '3H', '3C', '4S', '4H', '4C', '5S', '5H', '5C', '9S', '9H', '9C']),
      ),
    ).toBeNull();
  });

  it('recognises four with two singles or two pairs', () => {
    const fourTwo = detectCombo(cs(['3S', '3H', '3C', '3D', '9S', '9H']));
    expect(fourTwo?.kind).toBe('four-two');
    const fourPairs = detectCombo(cs(['3S', '3H', '3C', '3D', '9S', '9H', '13S', '13H']));
    expect(fourPairs?.kind).toBe('four-two-pairs');
  });

  it('recognises bombs and the rocket', () => {
    expect(detectCombo(cs(['3S', '3H', '3C', '3D']))?.kind).toBe('bomb');
    expect(detectCombo(cs(['SJ', 'BJ']))?.kind).toBe('rocket');
    expect(detectCombo(cs(['SJ']))?.kind).toBe('single');
  });

  it('rejects a duplicate physical card', () => {
    expect(detectCombo(cs(['3S', '3S']))).toBeNull();
  });
});

describe('Dou Dizhu comparison and tric13S', () => {
  it('requires the same type and card count, and a higher rank', () => {
    const low = detectCombo(cs(['3S', '3H']))!;
    const high = detectCombo(cs(['4S', '4H']))!;
    expect(beats(high, low)).toBe(true);
    expect(beats(low, high)).toBe(false);
    const triple = detectCombo(cs(['5S', '5H', '5C']))!;
    expect(beats(triple, low)).toBe(false);
    const longStraight = detectCombo(cs(['3S', '4H', '5C', '6D', '7S', '8H']))!;
    const shortStraight = detectCombo(cs(['3S', '4H', '5C', '6D', '7S']))!;
    expect(beats(longStraight, shortStraight)).toBe(false);
  });

  it('lets bombs beat non-bombs and the rocket beat everything', () => {
    const pair = detectCombo(cs(['15S', '15H']))!;
    const bomb = detectCombo(cs(['3S', '3H', '3C', '3D']))!;
    const higherBomb = detectCombo(cs(['4S', '4H', '4C', '4D']))!;
    const rocket = detectCombo(cs(['SJ', 'BJ']))!;
    expect(beats(bomb, pair)).toBe(true);
    expect(beats(higherBomb, bomb)).toBe(true);
    expect(beats(bomb, higherBomb)).toBe(false);
    expect(beats(rocket, higherBomb)).toBe(true);
    expect(beats(higherBomb, rocket)).toBe(false);
  });

  it('removes played cards, records the play, and advances the turn', () => {
    const state = fixture({
      hands: [cs(['3S', '3H', '4S']), cs(['5S']), cs(['6S'])],
    });
    const result = play(state, 0, cs(['3S', '3H']));
    expect(result.ok).toBe(true);
    expect(result.state.hands[0].map((card) => card.id)).toEqual(['4S']);
    expect(result.state.lastPlay?.combo.kind).toBe('pair');
    expect(result.state.turn).toBe(1);
    expect(result.state.plays[0]).toBe(1);
  });

  it('does not allow the leader to pass', () => {
    const state = fixture({ hands: [cs(['3S', '4S']), cs(['5S']), cs(['6S'])] });
    const result = pass(state, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('must-play');
  });

  it('resets the trick to the last player after two passes', () => {
    let state = fixture({
      hands: [cs(['3S', '4S']), cs(['5S']), cs(['6S'])],
      lastPlay: {
        seat: 0,
        combo: detectCombo(cs(['3S']))!,
        cards: cs(['3S']),
      },
      lastPlayer: 0,
      turn: 1,
    });
    state = pass(state, 1).state;
    expect(state.passes).toBe(1);
    state = pass(state, 2).state;
    expect(state.passes).toBe(0);
    expect(state.lastPlay).toBeNull();
    expect(state.turn).toBe(0);
  });

  it('rejects cards that are not in the hand and illegal shapes', () => {
    const state = fixture({ hands: [cs(['3S', '4S']), cs(['5S']), cs(['6S'])] });
    expect(play(state, 0, cs(['9S'])).error).toBe('not-your-card');
    expect(play(state, 0, cs(['3S', '4S'])).error).toBe('bad-combo');
  });

  it('rejects a legal shape that does not beat the last play', () => {
    const state = fixture({
      hands: [cs(['3S', '4S']), cs(['5S']), cs(['6S'])],
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['5S']))!,
        cards: cs(['5S']),
      },
      lastPlayer: 2,
      turn: 0,
    });
    expect(play(state, 0, cs(['3S'])).error).toBe('does-not-beat');
  });

  it('sorts a hand by rank and keeps every card', () => {
    const hand = sortHand(cs(['BJ', '3S', '15H', 'SJ', '10C']));
    expect(hand.map((card) => card.rank)).toEqual([3, 10, 15, 16, 17]);
  });

  it('exposes seat-specific action flags', () => {
    const state = fixture({
      hands: [cs(['3S']), cs(['4S']), cs(['5S'])],
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['5S']))!,
        cards: cs(['5S']),
      },
      lastPlayer: 2,
      turn: 0,
    });
    expect(view(state, 0).canPlay).toBe(true);
    expect(view(state, 0).canPass).toBe(true);
    expect(view(state, 1).canPlay).toBe(false);
    expect(view(state, 1).hand.map((card) => card.id)).toEqual(['4S']);
    expect(view(state, 0).handCounts).toEqual([1, 1, 1]);
  });
});

describe('Dou Dizhu scoring and spring', () => {
  it('awards a landlord win and doubles the stake for a spring', () => {
    const state = fixture({
      hands: [cs(['3S']), cs(['4S', '5S']), cs(['6S', '7S'])],
      plays: [0, 0, 0],
    });
    const result = play(state, 0, cs(['3S'])).state;
    expect(result.phase).toBe('over');
    expect(result.result?.winnerSide).toBe('landlord');
    expect(result.result?.spring).toBe(true);
    expect(result.result?.stake).toBe(6);
    expect(result.result?.landlordPoints).toBe(12);
    expect(result.result?.farmerPoints).toBe(-6);
  });

  it('awards a farmer win when either farmer empties', () => {
    const state = fixture({
      hands: [cs(['5S', '6S']), cs(['4S']), cs(['7S', '8S'])],
      turn: 1,
      plays: [2, 1, 0],
    });
    const result = play(state, 1, cs(['4S'])).state;
    expect(result.result?.winnerSide).toBe('farmers');
    expect(result.result?.winnerSeat).toBe(1);
    expect(result.result?.spring).toBe(false);
    expect(result.result?.landlordPoints).toBe(-6);
    expect(result.result?.farmerPoints).toBe(3);
  });

  it('counts a farmer spring when the landlord has played only once', () => {
    const state = fixture({
      hands: [cs(['5S', '6S']), cs(['4S']), cs(['7S', '8S'])],
      turn: 1,
      plays: [1, 0, 0],
    });
    const result = play(state, 1, cs(['4S'])).state;
    expect(result.result?.spring).toBe(true);
    expect(result.result?.multiplier).toBe(2);
    expect(result.result?.stake).toBe(6);
  });

  it('multiplies by every bomb and rocket', () => {
    const state = fixture({
      hands: [cs(['3S']), cs(['4S', '5S']), cs(['6S', '7S'])],
      plays: [0, 1, 0],
      bombs: 2,
    });
    const result = play(state, 0, cs(['3S'])).state;
    expect(result.result?.bombMultiplier).toBe(4);
    expect(result.result?.stake).toBe(12);
    expect(result.result?.landlordPoints).toBe(24);
  });

  it('increments the bomb counter when a bomb is played', () => {
    const state = fixture({
      hands: [cs(['3S', '3H', '3C', '3D', '9S']), cs(['4S']), cs(['5S'])],
    });
    const result = play(state, 0, cs(['3S', '3H', '3C', '3D']));
    expect(result.ok).toBe(true);
    expect(result.state.bombs).toBe(1);
    expect(result.state.plays[0]).toBe(1);
  });
});

describe('Dou Dizhu AI', () => {
  it('bids a legal value and is deterministic with the same RNG', () => {
    const state = setup({ rng: seeded(30) });
    const a = chooseBid(state, 0, 'normal', seeded(31));
    const b = chooseBid(state, 0, 'normal', seeded(31));
    expect(a).toBe(b);
    expect([0, 1, 2, 3]).toContain(a);
  });

  it('all four levels return a legal lead', () => {
    const state = fixture({
      hands: [cs(['3S', '4S', '5S', '6S', '7S', '9H', '9C', '12D']), cs(['8S']), cs(['10S'])],
    });
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const ids = choosePlay(state, 0, level, seeded(38));
      expect(ids).not.toBeNull();
      const cards = state.hands[0].filter((card) => ids?.includes(card.id));
      expect(play(state, 0, cards).ok).toBe(true);
    }
  });

  it('never returns an illegal play over a complete AI round', () => {
    let state = setup({ rng: seeded(32) });
    const rng = seeded(33);
    state = bid(state, 0, 3, rng).state;
    let guard = 0;
    while (state.phase === 'playing' && guard < 200) {
      guard += 1;
      const seat = state.turn as Seat;
      const ids = choosePlay(state, seat, 'hard', rng);
      if (ids) {
        const cards = state.hands[seat].filter((card) => ids.includes(card.id));
        const result = play(state, seat, cards);
        expect(result.ok).toBe(true);
        state = result.state;
      } else {
        const result = pass(state, seat);
        expect(result.ok).toBe(true);
        state = result.state;
      }
    }
    expect(state.phase).toBe('over');
  });

  it('finishes with its last card when it can', () => {
    const state = fixture({
      hands: [cs(['SJ']), cs(['4S']), cs(['5S'])],
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['15S']))!,
        cards: cs(['15S']),
      },
      lastPlayer: 2,
      turn: 0,
    });
    expect(choosePlay(state, 0, 'hard', seeded(34))).toEqual(['SJ']);
  });

  it('lets a farmer partner keep the lead', () => {
    const state = fixture({
      hands: [cs(['9S', '9H']), cs(['4S', '5S']), cs(['7S', '8S'])],
      turn: 1,
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['3S']))!,
        cards: cs(['3S']),
      },
      lastPlayer: 2,
      landlord: 0,
    });
    expect(choosePlay(state, 1, 'hard', seeded(35))).toBeNull();
  });

  it('prefers a cheap answer to a bomb when one exists', () => {
    const state = fixture({
      hands: [cs(['3S', '3H', '3C', '3D', '9S']), cs(['4S']), cs(['5S'])],
      turn: 0,
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['8S']))!,
        cards: cs(['8S']),
      },
      lastPlayer: 2,
    });
    const choice = choosePlay(state, 0, 'hard', seeded(36));
    expect(choice).toEqual(['9S']);
  });

  it('uses a bomb when it is the only answer', () => {
    const state = fixture({
      hands: [cs(['3S', '3H', '3C', '3D', '4S']), cs(['5S']), cs(['6S'])],
      turn: 0,
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['15S']))!,
        cards: cs(['15S']),
      },
      lastPlayer: 2,
    });
    const choice = choosePlay(state, 0, 'hard', seeded(37));
    expect(choice).toEqual(['3S', '3H', '3C', '3D']);
  });

  it('gives a reasoned hint for a partner pass', () => {
    const state = fixture({
      hands: [cs(['9S', '9H']), cs(['4S', '5S']), cs(['7S', '8S'])],
      turn: 1,
      lastPlay: {
        seat: 2,
        combo: detectCombo(cs(['3S']))!,
        cards: cs(['3S']),
      },
      lastPlayer: 2,
      landlord: 0,
    });
    expect(hintPlay(state, 1).reason).toBe('let-partner');
    expect(hintPlay(state, 1).cards).toBeNull();
  });

  it('gives a reason for a hinted combination', () => {
    const state = fixture({
      hands: [cs(['3S', '4S', '5S', '6S', '7S']), cs(['8S']), cs(['9S'])],
      turn: 0,
    });
    const hint = hintPlay(state, 0);
    expect(hint.cards).not.toBeNull();
    expect(hint.reason).toBeTruthy();
  });
});
