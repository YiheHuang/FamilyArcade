import { describe, expect, it } from 'vitest';
import {
  applyAction,
  defaultButton,
  legalActions,
  makeDeck,
  makeRng,
  nextHand,
  setup,
  view,
  type Card,
  type GameState,
  type Rank,
  type Suit,
} from '../src/game/texas-holdem';
import {
  decodeScore,
  evaluate,
  score5,
  type HandCategory,
} from '../src/game/evaluator';
import { AI_LEVELS, chooseAction, hintFor } from '../src/ai/ai';
import { demoOver, demoShowdown, demoTable } from '../src/demo';

const C = (id: string): Card => ({ rank: id[0] as Rank, suit: id[1] as Suit });
const H = (ids: string): Card[] => ids.trim().split(/\s+/).map(C);

const CATEGORY_NUMBER: Record<number, HandCategory> = {
  0: 'high-card',
  1: 'one-pair',
  2: 'two-pair',
  3: 'three-of-a-kind',
  4: 'straight',
  5: 'flush',
  6: 'full-house',
  7: 'four-of-a-kind',
  8: 'straight-flush',
};

function riverState(options: {
  hands: Card[][];
  board: Card[];
  totalBets: number[];
  folded?: number[];
  button?: number;
  stacks?: number[];
  turn?: number;
}): GameState {
  const base = setup({ rng: makeRng(1), seats: options.hands.length, startingStack: 1000, button: 0 });
  const players = base.players.map((player, index) => ({
    ...player,
    hand: options.hands[index],
    folded: options.folded?.includes(index) ?? false,
    allIn: false,
    stack: options.stacks?.[index] ?? 1,
    streetBet: 0,
    totalBet: options.totalBets[index],
    acted: true,
    canRaise: true,
    lastAction: null,
  }));
  return {
    ...base,
    phase: 'river',
    button: options.button ?? 0,
    players,
    board: options.board,
    burned: [],
    deck: [],
    currentBet: 0,
    minRaise: base.bigBlind,
    turn: options.turn ?? 0,
    actionLog: [],
    result: null,
    sessionOver: false,
    champion: null,
    sbSeat: -1,
    bbSeat: -1,
  };
}

describe('hand evaluator', () => {
  it('names the royal flush and the wheel correctly', () => {
    const royal = evaluate(H('AS KS QS JS TS 2H 3D'));
    expect(royal.category).toBe('royal-flush');
    expect(royal.cards).toHaveLength(5);

    const wheel = evaluate(H('AS 2H 3D 4C 5S 9H KD'));
    expect(wheel.category).toBe('straight');
    expect(wheel.tiebreak[0]).toBe(5);

    const sixHigh = evaluate(H('2S 3H 4D 5C 6S 9H KD'));
    expect(sixHigh.score).toBeGreaterThan(wheel.score);
  });

  it('orders every hand category', () => {
    const hands = [
      'AS KS QS JS TS',
      '9S 8S 7S 6S 5S',
      '7S 7H 7D 7C 2S',
      '7S 7H 7D 2C 2S',
      'AS KS 9S 6S 3S',
      '9S 8H 7D 6C 5S',
      '7S 7H 7D KC 2S',
      '7S 7H 5D 5C 2S',
      '7S 7H KD QC 2S',
      'AS KD 9H 6C 2S',
    ];
    const scores = hands.map((hand) => score5(H(hand)));
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index - 1]).toBeGreaterThan(scores[index]);
    }
  });

  it('chooses the best full house from two trips', () => {
    const hand = evaluate(H('7S 7H 7D 9S 9H 9D 2C'));
    expect(hand.category).toBe('full-house');
    expect(hand.tiebreak[0]).toBe(9);
    expect(hand.tiebreak[1]).toBe(7);
  });

  it('is exhaustive for all 2,598,960 five-card hands', () => {
    const deck = makeDeck();
    const counts = new Array(9).fill(0);
    let total = 0;
    for (let a = 0; a < 48; a += 1) {
      for (let b = a + 1; b < 49; b += 1) {
        for (let c = b + 1; c < 50; c += 1) {
          for (let d = c + 1; d < 51; d += 1) {
            for (let e = d + 1; e < 52; e += 1) {
              counts[decodeScore(score5([deck[a], deck[b], deck[c], deck[d], deck[e]])).category] += 1;
              total += 1;
            }
          }
        }
      }
    }
    expect(total).toBe(2_598_960);
    expect(counts).toEqual([
      1_302_540,
      1_098_240,
      123_552,
      54_912,
      10_200,
      5_108,
      3_744,
      624,
      40,
    ]);
  }, 120_000);

  it('classifies a few five-card hands by number', () => {
    expect(CATEGORY_NUMBER[decodeScore(score5(H('AS KD 9H 6C 2S'))).category]).toBe('high-card');
    expect(CATEGORY_NUMBER[decodeScore(score5(H('7S 7H KD QC 2S'))).category]).toBe('one-pair');
    expect(CATEGORY_NUMBER[decodeScore(score5(H('AS 2H 3D 4C 5S'))).category]).toBe('straight');
    expect(CATEGORY_NUMBER[decodeScore(score5(H('AS KS QS JS TS'))).category]).toBe('straight-flush');
  });
});

describe('deal, blinds and order', () => {
  it('deals two unique hole cards to every seat', () => {
    const state = setup({ rng: makeRng(7), seats: 6, button: 3 });
    const all = state.players.flatMap((player) => player.hand.map((card) => `${card.rank}${card.suit}`));
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
    expect(state.deck).toHaveLength(40);
  });

  it('is deterministic for the same injected seed', () => {
    const first = setup({ rng: makeRng(123456), seats: 5, button: 2 });
    const second = setup({ rng: makeRng(123456), seats: 5, button: 2 });
    const hands = (state: GameState) =>
      state.players.map((player) => player.hand.map((card) => `${card.rank}${card.suit}`).join(','));
    expect(hands(first)).toEqual(hands(second));
    expect(first.deck.map((card) => `${card.rank}${card.suit}`)).toEqual(
      second.deck.map((card) => `${card.rank}${card.suit}`),
    );
    const other = setup({ rng: makeRng(99), seats: 5, button: 2 });
    expect(hands(other)).not.toEqual(hands(first));
  });

  it('places the button so seat 0 acts first pre-flop', () => {
    for (const seats of [2, 3, 4, 5, 6]) {
      const state = setup({ rng: makeRng(seats * 31), seats, button: defaultButton(seats) });
      expect(state.turn).toBe(0);
    }
  });

  it('uses heads-up button-small-blind rules and the big blind first post-flop', () => {
    const state = setup({ rng: makeRng(4), seats: 2, button: 0 });
    expect(state.sbSeat).toBe(0);
    expect(state.bbSeat).toBe(1);
    expect(state.turn).toBe(0);
    const afterCall = applyAction(state, 0, { type: 'call' });
    expect(afterCall.ok).toBe(true);
    expect(afterCall.state.turn).toBe(1);
    expect(legalActions(afterCall.state, 1).canCheck).toBe(true);
    const afterCheck = applyAction(afterCall.state, 1, { type: 'check' });
    expect(afterCheck.state.phase).toBe('flop');
    expect(afterCheck.state.turn).toBe(1);
  });

  it('posts the blinds and enforces a full minimum raise', () => {
    const state = setup({ rng: makeRng(8), seats: 4, button: 1 });
    expect(state.sbSeat).toBe(2);
    expect(state.bbSeat).toBe(3);
    expect(state.turn).toBe(0);
    expect(state.players[2].streetBet).toBe(10);
    expect(state.players[3].streetBet).toBe(20);
    const options = legalActions(state, 0);
    expect(options.canCall).toBe(true);
    expect(options.callAmount).toBe(20);
    expect(options.canCheck).toBe(false);
    expect(options.minRaiseTo).toBe(40);
    expect(applyAction(state, 0, { type: 'check' }).error).toBe('cannot-check');
    expect(applyAction(state, 0, { type: 'raise', amount: 39 }).error).toBe('bad-amount');
    const raised = applyAction(state, 0, { type: 'raise', amount: 40 });
    expect(raised.ok).toBe(true);
    expect(raised.state.currentBet).toBe(40);
    expect(raised.state.minRaise).toBe(20);
    expect(legalActions(raised.state, 1).minRaiseTo).toBe(60);
  });

  it('offers the big blind its option after a limp', () => {
    let current = setup({ rng: makeRng(9), seats: 3, button: 0 });
    for (let guard = 0; guard < 10 && current.phase === 'preflop'; guard += 1) {
      expect(current.turn).toBe(guard);
      if (current.turn === 2) {
        expect(current.players[2].acted).toBe(false);
        const options = legalActions(current, 2);
        expect(options.canCheck).toBe(true);
        expect(options.canRaise).toBe(true);
        break;
      }
      const result = applyAction(current, current.turn, { type: 'call' });
      expect(result.ok).toBe(true);
      current = result.state;
    }
    expect(current.phase).toBe('preflop');
    expect(current.players[2].acted).toBe(false);
  });
});

describe('betting and street flow', () => {
  it('keeps the board and burn count correct street by street', () => {
    const table = demoTable();
    expect(table.phase).toBe('flop');
    expect(table.board).toHaveLength(3);
    expect(table.burned).toHaveLength(1);
    const showdown = demoShowdown();
    expect(showdown.phase).toBe('showdown');
    expect(showdown.board).toHaveLength(5);
    expect(showdown.burned).toHaveLength(3);
    expect(showdown.result?.showdown).toBe(true);
  });

  it('rejects a post-flop bet below the big blind', () => {
    const table = demoTable();
    const options = legalActions(table, table.turn);
    expect(options.canBet).toBe(true);
    expect(options.minBetTo).toBe(20);
    expect(applyAction(table, table.turn, { type: 'bet', amount: 10 }).error).toBe('bad-amount');
    const bet = applyAction(table, table.turn, { type: 'bet', amount: 20 });
    expect(bet.ok).toBe(true);
    expect(bet.state.currentBet).toBe(20);
    expect(legalActions(bet.state, bet.state.turn).canCall).toBe(true);
    expect(applyAction(bet.state, bet.state.turn, { type: 'check' }).error).toBe('cannot-check');
  });

  it('rejects a bet when a raise is required and a raise when no raise right exists', () => {
    const state = setup({ rng: makeRng(11), seats: 4, button: 1 });
    expect(applyAction(state, 0, { type: 'bet', amount: 40 }).error).toBe('cannot-bet');
    const short = setup({ rng: makeRng(12), seats: 4, button: 1 });
    const players = short.players.map((player, index) => ({
      ...player,
      stack: index === 0 ? 150 : 1000,
      streetBet: index === 0 ? 0 : 100,
      totalBet: index === 0 ? 0 : 100,
      acted: index !== 0,
      canRaise: index === 0,
    }));
    const shortState: GameState = {
      ...short,
      phase: 'flop',
      board: H('2C 7D 9H'),
      burned: [C('KS')],
      turn: 0,
      currentBet: 100,
      minRaise: 100,
      players,
    };
    const allIn = applyAction(shortState, 0, { type: 'all-in' });
    expect(allIn.ok).toBe(true);
    expect(allIn.state.currentBet).toBe(150);
    expect(allIn.state.minRaise).toBe(100);
    expect(legalActions(allIn.state, 1).canRaise).toBe(false);
    expect(legalActions(allIn.state, 1).canCall).toBe(true);
    expect(applyAction(allIn.state, 1, { type: 'raise', amount: 300 }).error).toBe('no-raise-right');
  });

  it('reopens betting after a full all-in raise', () => {
    const base = setup({ rng: makeRng(13), seats: 4, button: 1 });
    const players = base.players.map((player, index) => ({
      ...player,
      stack: index === 0 ? 300 : 1000,
      streetBet: index === 0 ? 0 : 100,
      totalBet: index === 0 ? 0 : 100,
      acted: index !== 0,
      canRaise: index === 0,
    }));
    const state: GameState = {
      ...base,
      phase: 'flop',
      board: H('2C 7D 9H'),
      burned: [C('KS')],
      turn: 0,
      currentBet: 100,
      minRaise: 100,
      players,
    };
    const allIn = applyAction(state, 0, { type: 'all-in' });
    expect(allIn.ok).toBe(true);
    expect(allIn.state.currentBet).toBe(300);
    expect(allIn.state.minRaise).toBe(200);
    expect(legalActions(allIn.state, 1).canRaise).toBe(true);
    expect(legalActions(allIn.state, 1).minRaiseTo).toBe(500);
  });

  it('runs out the board when everyone is all-in', () => {
    const state = setup({
      rng: makeRng(14),
      seats: 2,
      startingStack: 20,
      smallBlind: 10,
      bigBlind: 20,
      button: 0,
    });
    const allIn = applyAction(state, 0, { type: 'all-in' });
    expect(allIn.ok).toBe(true);
    expect(allIn.state.phase).toBe('showdown');
    expect(allIn.state.result?.showdown).toBe(true);
    expect(allIn.state.board).toHaveLength(5);
    expect(allIn.state.burned).toHaveLength(3);
  });

  it('does not mutate the state passed to an action', () => {
    const state = setup({ rng: makeRng(15), seats: 4, button: 1 });
    const before = JSON.stringify(state);
    const result = applyAction(state, 0, { type: 'call' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state).not.toBe(state);
  });
});

describe('pots, side pots and odd chips', () => {
  it('builds three pots for unequal all-ins and returns the uncalled part', () => {
    const state = riverState({
      hands: [H('KS KH'), H('AC AD'), H('QC QD')],
      board: H('KC KD 7H 4S 2C'),
      totalBets: [100, 200, 300],
      stacks: [0, 0, 1],
      turn: 2,
    });
    const result = applyAction(state, 2, { type: 'check' });
    expect(result.ok).toBe(true);
    const hand = result.state.result;
    expect(hand).not.toBeNull();
    expect(hand?.pots).toHaveLength(3);
    expect(hand?.pots.map((pot) => pot.amount)).toEqual([300, 200, 100]);
    expect(hand?.pots[0].winners).toEqual([0]);
    expect(hand?.pots[1].winners).toEqual([1]);
    expect(hand?.pots[2].uncalled).toBe(true);
    const payouts = Object.fromEntries((hand?.payouts ?? []).map((payout) => [payout.seat, payout.amount]));
    expect(payouts).toEqual({ 0: 300, 1: 200, 2: 100 });
    expect((hand?.payouts ?? []).reduce((sum, payout) => sum + payout.amount, 0)).toBe(600);
  });

  it('splits a pot and sends the odd chip to the first winner left of the button', () => {
    const state = riverState({
      hands: [H('2C 3C'), H('4D 5D'), H('6H 7H')],
      board: H('AS KS QS JS TS'),
      totalBets: [33, 33, 33],
      folded: [0],
      button: 0,
      turn: 1,
    });
    const result = applyAction(state, 1, { type: 'check' });
    const hand = result.state.result;
    expect(hand?.pot).toBe(99);
    expect(hand?.pots).toHaveLength(1);
    expect(hand?.pots[0].winners).toEqual([1, 2]);
    expect(hand?.pots[0].oddChipSeat).toBe(1);
    expect(hand?.pots[0].oddChipAmount).toBe(1);
    const payouts = Object.fromEntries((hand?.payouts ?? []).map((payout) => [payout.seat, payout.amount]));
    expect(payouts).toEqual({ 1: 50, 2: 49 });
    expect(hand?.oddChips).toEqual([{ seat: 1, amount: 1 }]);
  });

  it('lets folded chips stay in the pot and pays the live winners', () => {
    const state = riverState({
      hands: [H('2C 3C'), H('4D 5D'), H('6H 7H')],
      board: H('AS KS QS JS TS'),
      totalBets: [100, 100, 100],
      folded: [0],
      button: 0,
      turn: 1,
    });
    const result = applyAction(state, 1, { type: 'check' });
    const hand = result.state.result;
    expect(hand?.pot).toBe(300);
    expect(hand?.pots[0].winners).toEqual([1, 2]);
    expect(hand?.payouts.map((payout) => payout.amount)).toEqual([150, 150]);
    expect(hand?.payouts.some((payout) => payout.seat === 0)).toBe(false);
  });

  it('conserves chips through a complete showdown', () => {
    const state = demoShowdown();
    const total = state.players.reduce((sum, player) => sum + player.stack, 0);
    expect(total).toBe(state.players.length * 1000);
  });

  it('returns a folded bettor’s uncalled excess when everyone else folds', () => {
    const state = riverState({
      hands: [H('AS KS'), H('2C 3C')],
      board: H('QH JD 9S 6C 4D'),
      totalBets: [100, 50],
      button: 0,
      turn: 0,
    });
    const result = applyAction(state, 0, { type: 'fold' });
    expect(result.ok).toBe(true);
    const hand = result.state.result;
    expect(hand?.pot).toBe(150);
    expect(hand?.winners).toEqual([1]);
    const payouts = Object.fromEntries((hand?.payouts ?? []).map((payout) => [payout.seat, payout.amount]));
    expect(payouts).toEqual({ 0: 50, 1: 100 });
    expect(hand?.pots.filter((pot) => pot.uncalled).length).toBe(1);
    expect(hand?.pots.find((pot) => pot.uncalled)?.winners).toEqual([0]);
  });
});

describe('fold, showdown and session', () => {
  it('ends the hand on a fold and awards the whole pot', () => {
    const state = setup({ rng: makeRng(16), seats: 2, button: 0 });
    const result = applyAction(state, 0, { type: 'fold' });
    expect(result.ok).toBe(true);
    const next = result.state;
    expect(next.phase).toBe('showdown');
    expect(next.result?.showdown).toBe(false);
    expect(next.result?.winners).toEqual([1]);
    expect(next.players[0].stack).toBe(990);
    expect(next.players[1].stack).toBe(1010);
    expect(next.result?.folded).toEqual([0]);
  });

  it('rotates the button to the next seat with chips and carries stacks', () => {
    const state = setup({ rng: makeRng(17), seats: 2, button: 0 });
    const folded = applyAction(state, 0, { type: 'fold' }).state;
    const next = nextHand(folded, makeRng(18));
    expect(next.ok).toBe(true);
    expect(next.state.button).toBe(1);
    expect(next.state.handNumber).toBe(2);
    expect(next.state.players[0].stack).toBe(970);
    expect(next.state.players[1].stack).toBe(1000);
  });

  it('ends the table when one seat holds every chip', () => {
    const state = demoOver();
    expect(state.sessionOver).toBe(true);
    expect(state.champion).not.toBeNull();
    expect(state.result?.sessionOver).toBe(true);
    expect(nextHand(state, makeRng(19)).error).toBe('session-over');
  });

  it('never reveals folded hole cards at showdown', () => {
    const state = setup({ rng: makeRng(20), seats: 3, button: 0 });
    const folded = applyAction(state, 0, { type: 'fold' }).state;
    // Seat 0 folded; seats 1 and 2 still need to finish the hand.
    let current = folded;
    for (let guard = 0; guard < 20 && current.phase !== 'showdown'; guard += 1) {
      const seat = current.turn;
      if (seat < 0) break;
      const options = legalActions(current, seat);
      const action = options.canCheck ? { type: 'check' as const } : { type: 'call' as const };
      const result = applyAction(current, seat, action);
      if (!result.ok) break;
      current = result.state;
    }
    expect(current.phase).toBe('showdown');
    const shown = view(current, 1);
    expect(shown.revealed.some((item) => item.seat === 0)).toBe(false);
    expect(shown.revealed.every((item) => item.cards.length === 2)).toBe(true);
  });

  it('hides every other hand and the deck in a seat view', () => {
    const state = setup({ rng: makeRng(21), seats: 4, button: 1 });
    const own = view(state, 0);
    const other = view(state, 1);
    expect(own.hand).toHaveLength(2);
    expect(other.hand).toHaveLength(2);
    expect(own.hand.map((card) => `${card.rank}${card.suit}`)).not.toEqual(
      other.hand.map((card) => `${card.rank}${card.suit}`),
    );
    const payload = JSON.stringify(own);
    for (const card of state.players[1].hand) {
      expect(payload).not.toContain(`${card.rank}${card.suit}`);
    }
    expect((own as unknown as { deck?: unknown }).deck).toBeUndefined();
    expect((own as unknown as { burned?: unknown }).burned).toBeUndefined();
    expect(own.hand.map((card) => `${card.rank}${card.suit}`)).toEqual(
      state.players[0].hand.map((card) => `${card.rank}${card.suit}`),
    );
  });
});

describe('AI and hints', () => {
  it('returns a legal action for every level', () => {
    const state = demoTable();
    for (const level of AI_LEVELS) {
      const decision = chooseAction(state, state.turn, level, makeRng(500));
      const result = applyAction(state, state.turn, decision.action);
      expect(result.ok, `${level}: ${decision.action.type}`).toBe(true);
      expect(decision.samples).toBeGreaterThan(0);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const flop = demoTable();
    const first = chooseAction(flop, flop.turn, 'hard', makeRng(44));
    const second = chooseAction(flop, flop.turn, 'hard', makeRng(44));
    expect(first.action).toEqual(second.action);
    expect(first.equity).toBe(second.equity);
    expect(first.reason).toBe(second.reason);
  });

  it('never reads another seat’s hidden hand', () => {
    const flop = demoTable();
    const altered: GameState = {
      ...flop,
      players: flop.players.map((player, index) =>
        index === 1 ? { ...player, hand: H('2D 3D') } : { ...player, hand: player.hand.slice() },
      ),
    };
    for (const level of AI_LEVELS) {
      const first = chooseAction(flop, flop.turn, level, makeRng(77));
      const second = chooseAction(altered, altered.turn, level, makeRng(77));
      expect(first.action).toEqual(second.action);
      expect(first.equity).toBe(second.equity);
    }
  });

  it('gives a legal, reasoned hint', () => {
    const flop = demoTable();
    const hint = hintFor(flop, flop.turn);
    expect(applyAction(flop, flop.turn, hint.action).ok).toBe(true);
    expect(hint.reason.length).toBeGreaterThan(0);
    expect(hint.samples).toBeGreaterThan(0);
    expect(hintFor(flop, flop.turn)).toEqual(hint);
  });

  it('keeps the companion gentler than hard over the same state', () => {
    const flop = demoTable();
    const companion = chooseAction(flop, flop.turn, 'companion', makeRng(88));
    const hard = chooseAction(flop, flop.turn, 'hard', makeRng(88));
    expect(companion.samples).toBeLessThan(hard.samples);
  });
});

describe('seeded board and odd-chip details', () => {
  it('uses a 52-card deck with no duplicates', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => `${card.rank}${card.suit}`)).size).toBe(52);
  });

  it('keeps side-pot shares whole and never loses a chip', () => {
    const state = riverState({
      hands: [H('KS KH'), H('AC AD'), H('QC QD')],
      board: H('KC KD 7H 4S 2C'),
      totalBets: [101, 202, 303],
      stacks: [0, 0, 1],
      turn: 2,
    });
    const result = applyAction(state, 2, { type: 'check' }).state.result;
    expect(result).not.toBeNull();
    const payoutTotal = (result?.payouts ?? []).reduce((sum, payout) => sum + payout.amount, 0);
    expect(payoutTotal).toBe(result?.pot);
  });

  it('lets a short all-in call go to showdown without inventing chips', () => {
    const state = setup({
      rng: makeRng(22),
      seats: 2,
      startingStack: 25,
      smallBlind: 10,
      bigBlind: 20,
      button: 0,
    });
    const allIn = applyAction(state, 0, { type: 'all-in' });
    expect(allIn.ok).toBe(true);
    expect(allIn.state.turn).toBe(1);
    const called = applyAction(allIn.state, 1, { type: 'call' });
    expect(called.ok).toBe(true);
    expect(called.state.phase).toBe('showdown');
    const total = called.state.players.reduce((sum, player) => sum + player.stack, 0);
    expect(total).toBe(50);
  });
});
