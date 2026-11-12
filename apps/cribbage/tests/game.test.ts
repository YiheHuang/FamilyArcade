import { describe, expect, it } from 'vitest';
import { chooseDiscard, choosePlay } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  cardValue,
  cut,
  discard,
  makeRng,
  nextHand,
  pegPlayScore,
  pegRunSuffix,
  play,
  scoreCards,
  setup,
  skunkFor,
  view,
  type Card,
  type GameState,
} from '../src/game/cribbage';
import { addResult, EMPTY_RECORD, normalizeRecord } from '../src/storage';

function card(rank: number, suit = 0): Card {
  return suit * 13 + (rank - 1);
}

function pegState(
  hands: Card[][],
  starter: Card,
  extra: Partial<GameState> = {},
): GameState {
  const base = setup(hands.length, hands.length - 1, 1);
  return {
    ...base,
    phase: 'pegging',
    seats: base.seats.map((seat, index) => ({ ...seat, hand: hands[index].slice() })),
    starter,
    stock: [],
    crib: [],
    showHands: hands.map((hand) => hand.slice()),
    turn: 0,
    count: 0,
    sequence: [],
    pegged: [],
    passes: [],
    lastPlayer: null,
    events: [],
    ...extra,
  };
}

function discardAll(state: GameState): GameState {
  let next = state;
  while (next.phase === 'discard') {
    const seat = next.turn;
    const cards = next.seats[seat].hand.slice(0, next.discardCount);
    const result = discard(next, seat, cards);
    expect(result.ok).toBe(true);
    next = result.state;
  }
  return next;
}

describe('cribbage deal and discard', () => {
  it('deals six cards to each player in a two-player game', () => {
    const state = setup(2, 1, 101);
    expect(state.players).toBe(2);
    expect(state.handSize).toBe(6);
    expect(state.discardCount).toBe(2);
    expect(state.dealer).toBe(1);
    expect(state.turn).toBe(0);
    expect(state.seats[0].hand).toHaveLength(6);
    expect(state.seats[1].hand).toHaveLength(6);
    expect(state.stock).toHaveLength(40);
    expect(state.phase).toBe('discard');
  });

  it('deals five cards each to three and four player tables', () => {
    const three = setup(3, 2, 202);
    const four = setup(4, 3, 303);
    expect(three.handSize).toBe(5);
    expect(three.discardCount).toBe(1);
    expect(three.seats.map((seat) => seat.hand.length)).toEqual([5, 5, 5]);
    expect(three.stock).toHaveLength(37);
    expect(four.seats.map((seat) => seat.hand.length)).toEqual([5, 5, 5, 5]);
    expect(four.stock).toHaveLength(32);
    expect(four.turn).toBe(0);
  });

  it('uses all 52 unique cards with an injected seed', () => {
    const state = setup(4, 3, 99);
    const all = [...state.stock, ...state.seats.flatMap((seat) => seat.hand)];
    expect(new Set(all).size).toBe(52);
    const same = setup(4, 3, 99);
    expect(same.seats[0].hand).toEqual(state.seats[0].hand);
  });

  it('rejects wrong counts, foreign cards and the wrong seat', () => {
    const state = setup(2, 1, 5);
    expect(discard(state, 0, [state.seats[0].hand[0]]).error).toBe('count');
    expect(discard(state, 1, state.seats[0].hand.slice(0, 2)).error).toBe('turn');
    expect(discard(state, 0, [state.seats[1].hand[0], state.seats[1].hand[1]]).error).toBe('hand');
    const ok = discard(state, 0, state.seats[0].hand.slice(0, 2));
    expect(ok.ok).toBe(true);
    expect(ok.state.seats[0].hand).toHaveLength(4);
    expect(ok.state.crib).toHaveLength(2);
    expect(state.seats[0].hand).toHaveLength(6);
  });

  it('moves to the cut after every seat has discarded', () => {
    const state = discardAll(setup(3, 2, 17));
    expect(state.phase).toBe('cut');
    expect(state.crib).toHaveLength(3);
    expect(state.turn).toBe(0);
    expect(state.seats.map((seat) => seat.hand.length)).toEqual([4, 4, 4]);
  });

  it('cuts the starter and gives the dealer two for his heels', () => {
    const state = discardAll(setup(2, 1, 21));
    const jack = card(11, 2);
    const prepared: GameState = {
      ...state,
      stock: [...state.stock, jack],
      seats: state.seats.map((seat) => ({ ...seat, score: seat.score + 10 })),
    };
    const result = cut(prepared, prepared.turn);
    expect(result.ok).toBe(true);
    expect(result.state.starter).toBe(jack);
    expect(result.state.phase).toBe('pegging');
    expect(result.state.seats[1].score).toBe(12);
    expect(result.state.turn).toBe(0);
    expect(result.state.events.some((event) => event.kind === 'heels')).toBe(true);
  });
});

describe('scoring hands and the crib', () => {
  it('scores the classic 29 hand', () => {
    const score = scoreCards([card(5, 0), card(5, 1), card(5, 2), card(11, 3)], card(5, 3), false);
    expect(score.total).toBe(29);
    expect(score.parts.find((part) => part.kind === 'fifteens')?.points).toBe(16);
    expect(score.parts.find((part) => part.kind === 'pairs')?.points).toBe(12);
    expect(score.parts.find((part) => part.kind === 'nobs')?.points).toBe(1);
  });

  it('counts fifteens, pairs and double runs together', () => {
    const score = scoreCards([card(4, 0), card(5, 1), card(5, 2), card(6, 3)], card(2, 0), false);
    expect(score.parts.find((part) => part.kind === 'fifteens')?.count).toBe(2);
    expect(score.parts.find((part) => part.kind === 'pairs')?.points).toBe(2);
    expect(score.parts.find((part) => part.kind === 'runs')?.points).toBe(6);
    expect(score.total).toBe(12);
  });

  it('scores a four-card flush and a five-card flush with the starter', () => {
    const four = scoreCards([card(2, 0), card(4, 0), card(6, 0), card(9, 0)], card(10, 1), false);
    expect(four.parts.find((part) => part.kind === 'flush')?.points).toBe(4);
    const five = scoreCards([card(2, 0), card(4, 0), card(6, 0), card(9, 0)], card(10, 0), false);
    expect(five.parts.find((part) => part.kind === 'flush')?.points).toBe(5);
  });

  it('requires all crib cards and the starter to flush', () => {
    const noFlush = scoreCards([card(2, 0), card(4, 0), card(6, 0), card(8, 0)], card(10, 1), true);
    expect(noFlush.parts.find((part) => part.kind === 'flush')).toBeUndefined();
    const flush = scoreCards([card(2, 0), card(4, 0), card(6, 0), card(8, 0)], card(10, 0), true);
    expect(flush.parts.find((part) => part.kind === 'flush')?.points).toBe(5);
  });

  it('scores his nobs only from the hand', () => {
    const score = scoreCards([card(11, 2), card(4, 0), card(6, 1), card(8, 3)], card(5, 2), false);
    expect(score.parts.find((part) => part.kind === 'nobs')?.points).toBe(1);
    const starterJack = scoreCards([card(5, 2), card(4, 0), card(6, 1), card(8, 3)], card(11, 2), false);
    expect(starterJack.parts.find((part) => part.kind === 'nobs')).toBeUndefined();
  });

  it('counts each fifteen combination separately', () => {
    const score = scoreCards([card(13, 0), card(5, 1)], card(10, 2), false);
    expect(score.parts.find((part) => part.kind === 'fifteens')?.count).toBe(2);
    expect(score.parts.find((part) => part.kind === 'fifteens')?.points).toBe(4);
  });
});

describe('pegging', () => {
  it('scores fifteen and keeps the turn moving', () => {
    const state = pegState([[card(5, 0)], [card(10, 0), card(2, 1)]], card(9, 2));
    const first = play(state, 0, card(5, 0));
    expect(first.ok).toBe(true);
    expect(first.state.count).toBe(5);
    const second = play(first.state, 1, card(10, 0));
    expect(second.ok).toBe(true);
    expect(second.state.count).toBe(15);
    expect(second.state.seats[1].score).toBe(2);
    expect(second.state.events.some((event) => event.kind === 'fifteen')).toBe(true);
  });

  it('scores a pair, a triple and a run', () => {
    const pair = pegState([[card(5, 0), card(9, 0)], [card(5, 1), card(8, 0)]], card(2, 0));
    const afterPair = play(play(pair, 0, card(5, 0)).state, 1, card(5, 1)).state;
    expect(afterPair.seats[1].score).toBe(2);

    const triple = pegState(
      [
        [card(6, 0), card(9, 0)],
        [card(6, 1), card(9, 1)],
        [card(6, 2), card(9, 2)],
      ],
      card(2, 0),
    );
    let run = triple;
    run = play(run, 0, card(6, 0)).state;
    run = play(run, 1, card(6, 1)).state;
    run = play(run, 2, card(6, 2)).state;
    expect(run.seats[2].score).toBe(6);

    const sequence = pegState(
      [[card(5, 0), card(7, 0), card(9, 0)], [card(6, 1), card(9, 1)]],
      card(2, 0),
    );
    let running = sequence;
    running = play(running, 0, card(5, 0)).state;
    running = play(running, 1, card(6, 1)).state;
    running = play(running, 0, card(7, 0)).state;
    expect(running.seats[0].score).toBe(3);
    expect(running.events.some((event) => event.kind === 'run')).toBe(true);
  });

  it('scores thirty-one and then resets without a last-card point', () => {
    const state = pegState(
      [
        [card(10, 0), card(1, 0), card(9, 0)],
        [card(10, 1), card(9, 1)],
        [card(10, 2), card(9, 2)],
      ],
      card(2, 0),
    );
    let next = state;
    next = play(next, 0, card(10, 0)).state;
    next = play(next, 1, card(10, 1)).state;
    next = play(next, 2, card(10, 2)).state;
    next = play(next, 0, card(1, 0)).state;
    expect(next.count).toBe(0);
    expect(next.seats[0].score).toBe(2);
  });

  it('awards one for the last card and starts the next count', () => {
    const state = pegState(
      [[card(13, 0), card(8, 0)], [card(13, 1), card(9, 1)]],
      card(2, 0),
      { count: 12, sequence: [card(13, 2)], lastPlayer: 0, turn: 1 },
    );
    let next = play(state, 1, card(9, 1)).state;
    next = play(next, 0, card(8, 0)).state;
    expect(next.count).toBe(0);
    expect(next.seats[0].score).toBe(1);
    expect(next.turn).toBe(1);
    expect(next.events.some((event) => event.kind === 'last')).toBe(true);
  });

  it('rejects cards over 31, foreign cards and the wrong turn', () => {
    const state = pegState(
      [[card(13, 0), card(5, 1)], [card(13, 1), card(5, 0)]],
      card(2, 0),
      { count: 28, sequence: [card(13, 2)] },
    );
    expect(play(state, 0, card(5, 1)).error).toBe('limit');
    expect(play(state, 0, card(9, 0)).error).toBe('hand');
    expect(play(state, 1, card(5, 0)).error).toBe('turn');
  });

  it('scores runs from the longest valid suffix only', () => {
    const run = pegRunSuffix([card(9, 0), card(3, 0), card(4, 1), card(5, 2), card(6, 3)]);
    expect(run?.length).toBe(4);
    expect(pegRunSuffix([card(9, 0), card(5, 0), card(6, 1), card(7, 2)])?.points).toBe(3);
    expect(pegRunSuffix([card(5, 0), card(5, 1), card(6, 2)])).toBeNull();
  });

  it('scores a double run in pegging when duplicates create two runs', () => {
    const sequence = [card(4, 0), card(5, 1), card(5, 2), card(6, 3)];
    expect(pegRunSuffix(sequence)?.points).toBe(6);
    const result = pegPlayScore(sequence.slice(0, 3), 14, card(6, 3));
    expect(result.points).toBe(6);
  });
});

describe('the show, 121 and the next hand', () => {
  it('counts hands and the crib after the last card', () => {
    const state = pegState(
      [[card(5, 0)], [card(5, 1)]],
      card(13, 1),
      { count: 21, sequence: [card(13, 1), card(13, 2), card(1, 0)], lastPlayer: 0, turn: 0 },
    );
    let next = play(state, 0, card(5, 0)).state;
    next = play(next, 1, card(5, 1)).state;
    expect(next.phase).toBe('count');
    expect(next.handScores).toHaveLength(3);
    expect(next.handScores?.[0].total).toBe(2);
    expect(next.handScores?.[1].total).toBe(2);
    expect(next.seats[0].score).toBe(2);
    expect(next.seats[1].score).toBe(6);
    expect(next.handScores?.[2].owner).toBe('crib');
  });

  it('ends the game at 121 during the show, in pone-first order', () => {
    const state = pegState(
      [[card(5, 0)], [card(5, 1)]],
      card(13, 1),
      {
        count: 21,
        sequence: [card(13, 1), card(13, 2), card(1, 0)],
        lastPlayer: 0,
        turn: 0,
        seats: [
          { hand: [card(5, 0)], score: 119 },
          { hand: [card(5, 1)], score: 0 },
        ],
      },
    );
    let next = play(state, 0, card(5, 0)).state;
    next = play(next, 1, card(5, 1)).state;
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(0);
    expect(next.handScores?.[0].awarded).toBe(true);
    expect(next.handScores?.[1].awarded).toBe(false);
  });

  it('ends immediately when pegging reaches 121', () => {
    const state = pegState([[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]], card(2, 0), {
      count: 10,
      sequence: [card(13, 1)],
      lastPlayer: 1,
      seats: [
        { hand: [card(5, 0), card(9, 0)], score: 119 },
        { hand: [card(10, 1), card(9, 1)], score: 40 },
      ],
    });
    const next = play(state, 0, card(5, 0)).state;
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(0);
    expect(next.seats[0].score).toBe(121);
  });

  it('caps the winning score at 121 while keeping the win', () => {
    const state = pegState([[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]], card(2, 0), {
      count: 10,
      sequence: [card(13, 1)],
      lastPlayer: 1,
      seats: [
        { hand: [card(5, 0), card(9, 0)], score: 120 },
        { hand: [card(10, 1), card(9, 1)], score: 40 },
      ],
    });
    const next = play(state, 0, card(5, 0)).state;
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(0);
    expect(next.seats[0].score).toBe(121);
  });

  it('rotates the dealer and keeps scores for the next hand', () => {
    const state = pegState(
      [[card(5, 0)], [card(5, 1)]],
      card(13, 1),
      { count: 21, sequence: [card(13, 1), card(13, 2), card(1, 0)], lastPlayer: 0, turn: 0 },
    );
    let countState = play(state, 0, card(5, 0)).state;
    countState = play(countState, 1, card(5, 1)).state;
    const scores = countState.seats.map((seat) => seat.score);
    const fresh = nextHand(countState, 777);
    expect(fresh.phase).toBe('discard');
    expect(fresh.handNo).toBe(2);
    expect(fresh.dealer).toBe(0);
    expect(fresh.seats.map((seat) => seat.score)).toEqual(scores);
    expect(fresh.seats[0].hand).toHaveLength(6);
  });

  it('detects skunks and double skunks', () => {
    const base = setup(2, 1, 1);
    expect(skunkFor({ ...base, winner: 0, seats: [{ hand: [], score: 121 }, { hand: [], score: 91 }] })).toBe('none');
    expect(skunkFor({ ...base, winner: 0, seats: [{ hand: [], score: 121 }, { hand: [], score: 90 }] })).toBe('skunk');
    expect(skunkFor({ ...base, winner: 0, seats: [{ hand: [], score: 121 }, { hand: [], score: 60 }] })).toBe('double');
  });
});

describe('per-seat views', () => {
  it('shows only the seat hand and hides the crib until the show', () => {
    const state = discardAll(setup(2, 1, 33));
    const cutState = cut(state, state.turn).state;
    const first = view(cutState, 1);
    expect(first.hand).toEqual(cutState.seats[1].hand);
    expect(first.hand).not.toEqual(cutState.seats[0].hand);
    expect(first.crib).toBeNull();
    expect(first.revealedHands).toBeNull();
    expect(first.scores).toHaveLength(2);
    expect('seed' in first).toBe(false);
    expect('stock' in first).toBe(false);
  });

  it('exposes only legal cards on the active seat turn', () => {
    const state = pegState(
      [[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]],
      card(2, 0),
      { count: 25 },
    );
    const active = view(state, 0);
    expect(active.canPlay).toBe(true);
    expect(active.legal).toEqual([card(5, 0)]);
    expect(view(state, 1).canPlay).toBe(false);
    expect(view(state, 1).legal).toEqual([]);
  });

  it('reveals every hand and the crib during the show', () => {
    const state = pegState(
      [[card(5, 0)], [card(5, 1)]],
      card(13, 1),
      { count: 21, sequence: [card(13, 1), card(13, 2), card(1, 0)], lastPlayer: 0, turn: 0 },
    );
    let countState = play(state, 0, card(5, 0)).state;
    countState = play(countState, 1, card(5, 1)).state;
    const shown = view(countState, 0);
    expect(shown.phase).toBe('count');
    expect(shown.revealedHands).toHaveLength(2);
    expect(shown.crib).toEqual([]);
    expect(shown.handScores).toHaveLength(3);
  });
});

describe('AI and hints', () => {
  it('always discards the right number of real hand cards', () => {
    const two = setup(2, 1, 55);
    const four = setup(4, 3, 56);
    const twoCards = chooseDiscard(two, 0, 'hard', makeRng(1));
    const oneCard = chooseDiscard(four, 0, 'hard', makeRng(1));
    expect(twoCards).toHaveLength(2);
    expect(twoCards.every((value) => two.seats[0].hand.includes(value))).toBe(true);
    expect(oneCard).toHaveLength(1);
    expect(four.seats[0].hand.includes(oneCard[0])).toBe(true);
  });

  it('is deterministic with the same injected RNG', () => {
    const state = setup(4, 3, 81);
    expect(chooseDiscard(state, 0, 'normal', makeRng(9))).toEqual(
      chooseDiscard(state, 0, 'normal', makeRng(9)),
    );
    const peg = pegState(
      [[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]],
      card(2, 0),
    );
    expect(choosePlay(peg, 0, 'hard', makeRng(4))).toBe(
      choosePlay(peg, 0, 'hard', makeRng(4)),
    );
  });

  it('only returns legal pegging cards and returns null when stuck', () => {
    const state = pegState(
      [[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]],
      card(2, 0),
      { count: 25 },
    );
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(choosePlay(state, 0, level, makeRng(3))).toBe(card(5, 0));
    }
    const stuck = { ...state, count: 30, seats: [{ ...state.seats[0], hand: [card(5, 0)] }, state.seats[1]] };
    expect(choosePlay(stuck, 0, 'hard', makeRng(3))).toBeNull();
  });

  it('gives a discard hint with a reason and a value', () => {
    const state = setup(2, 1, 13);
    const hint = hintFor(state, 0);
    expect(hint?.action).toBe('discard');
    expect(hint?.cards).toHaveLength(2);
    expect(hint?.value).toBeTypeOf('number');
    expect(['keepRun', 'keepPair', 'keepFifteen', 'cribSafe']).toContain(hint?.reason);
  });

  it('spots a fifteen for the hint', () => {
    const state = pegState(
      [[card(5, 0), card(9, 0)], [card(10, 1), card(9, 1)]],
      card(2, 0),
      { count: 10, sequence: [card(13, 1)], lastPlayer: 1, turn: 0 },
    );
    const hint = hintFor(state, 0);
    expect(hint?.action).toBe('play');
    expect(hint?.card).toBe(card(5, 0));
    expect(hint?.reason).toBe('pegFifteen');
  });
});

describe('family record', () => {
  it('records wins, skunks, best hand and mode', () => {
    const state = setup(2, 1, 2);
    const finished: GameState = {
      ...state,
      phase: 'game-over',
      winner: 0,
      seats: [
        { hand: [], score: 121 },
        { hand: [], score: 88 },
      ],
      bestHand: { seat: 0, points: 20, cards: [], starter: 0 },
      handNo: 4,
    };
    const record = addResult(EMPTY_RECORD, finished, { mode: 'ai', level: 'hard' }, 1000);
    expect(record.games).toBe(1);
    expect(record.wins[0]).toBe(1);
    expect(record.skunks).toBe(1);
    expect(record.bestHand).toBe(20);
    expect(record.byMode.ai).toBe(1);
    expect(record.recent[0].scores).toEqual([121, 88]);
    expect(record.streak).toBe(1);
  });

  it('normalizes junk and clamps recent games', () => {
    const record = normalizeRecord({
      games: -3,
      wins: [1, 'x' as unknown as number],
      byMode: { ai: 2 } as never,
      recent: Array.from({ length: 12 }, () => ({
        winnerSeat: 0,
        players: 2,
        scores: [121, 90],
        mode: 'local',
        skunk: 'skunk',
        bestHand: 12,
        handNo: 3,
        at: 1,
      })),
    });
    expect(record.games).toBe(0);
    expect(record.wins).toHaveLength(4);
    expect(record.byMode.ai).toBe(2);
    expect(record.recent).toHaveLength(8);
  });

  it('tracks a same-winner streak', () => {
    const state = setup(2, 1, 2);
    const finished: GameState = {
      ...state,
      phase: 'game-over',
      winner: 1,
      seats: [
        { hand: [], score: 70 },
        { hand: [], score: 121 },
      ],
      bestHand: null,
    };
    const first = addResult(EMPTY_RECORD, finished, { mode: 'local' }, 1);
    const second = addResult(first, finished, { mode: 'local' }, 2);
    expect(second.streak).toBe(2);
    expect(second.bestStreak).toBe(2);
    expect(second.wins[1]).toBe(2);
  });
});

describe('deck helpers', () => {
  it('maps card values and suits correctly', () => {
    expect(cardValue(card(1, 0))).toBe(1);
    expect(cardValue(card(10, 0))).toBe(10);
    expect(cardValue(card(11, 0))).toBe(10);
    expect(cardValue(card(13, 0))).toBe(10);
    expect(makeRng(5)()).toBeGreaterThanOrEqual(0);
    expect(makeRng(5)()).toBeLessThan(1);
  });
});
