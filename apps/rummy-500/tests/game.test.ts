import { describe, expect, it } from 'vitest';
import { chooseAiAction, chooseDiscard, runAiTurn } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  analyzeMeld,
  applyAction,
  applySeatAction,
  canTakeDiscard,
  handValue,
  makeDeck,
  meldCardValue,
  meldPoints,
  meldPointsFor,
  nextRound,
  setupGame,
  sortHand,
  takeableDiscardIndexes,
  view,
  type Card,
  type GameState,
  type Meld,
  type Phase,
  type RoundReport,
} from '../src/game/rummy-500';
import { addResult, EMPTY_RECORD, gameSummary, normalizeRecord, type GameSummary } from '../src/storage';

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const rng = () => 0.5;

function makeMeld(id: number, owner: number, cards: Card[], by?: number[]): Meld {
  const analysis = analyzeMeld(cards);
  if (!analysis) throw new Error(`Invalid test meld: ${cards.join(' ')}`);
  return {
    id,
    kind: analysis.kind,
    owner,
    rank: analysis.rank,
    suit: analysis.suit,
    aceLow: analysis.aceLow,
    cards: analysis.cards.map((card, index) => ({ card, by: by?.[index] ?? owner })),
  };
}

function stateWith(config: {
  hands: Card[][];
  stock?: Card[];
  discard?: Card[];
  melds?: Meld[];
  turn?: number;
  phase?: Phase;
  scores?: number[];
  dealer?: number;
  round?: number;
  target?: number;
  mustMeld?: Card | null;
  report?: RoundReport | null;
  winner?: number | null;
  version?: number;
}): GameState {
  const players = config.hands.map((hand, seat) => ({
    name: `P${seat + 1}`,
    hand: sortHand(hand),
    score: config.scores?.[seat] ?? 0,
  }));
  return {
    players,
    stock: config.stock ?? [],
    discard: config.discard ?? [],
    melds: config.melds ?? [],
    turn: config.turn ?? 0,
    dealer: config.dealer ?? players.length - 1,
    phase: config.phase ?? 'meld',
    round: config.round ?? 1,
    drawn: null,
    mustMeld: config.mustMeld ?? null,
    report: config.report ?? null,
    winner: config.winner ?? null,
    target: config.target ?? 500,
    version: config.version ?? 0,
  };
}

const setFives = () => makeMeld(1, 0, ['5C', '5D', '5H']);
const setSixes = () => makeMeld(2, 1, ['6S', '6H', '6D']);
const heartRun = () => makeMeld(1, 0, ['5H', '6H', '7H']);

describe('Rummy 500 deck and deal', () => {
  it('builds a unique 52-card deck', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck.filter((card) => card[0] === 'A')).toHaveLength(4);
  });

  it('deals 13 cards to two players and 7 to three or four', () => {
    const two = setupGame(['A', 'B'], rng, 1);
    expect(two.players.map((player) => player.hand.length)).toEqual([13, 13]);
    expect(two.stock).toHaveLength(25);
    expect(two.discard).toHaveLength(1);
    expect(two.turn).toBe(0);
    expect(two.dealer).toBe(1);
    expect(two.phase).toBe('draw');
    expect(two.round).toBe(1);

    const three = setupGame(['A', 'B', 'C'], rng, 2);
    expect(three.players.map((player) => player.hand.length)).toEqual([7, 7, 7]);
    expect(three.stock).toHaveLength(30);

    const four = setupGame(['A', 'B', 'C', 'D'], rng, 3);
    expect(four.players.map((player) => player.hand.length)).toEqual([7, 7, 7, 7]);
    expect(four.stock).toHaveLength(23);
  });

  it('uses every card exactly once in a deal', () => {
    const state = setupGame(['A', 'B', 'C', 'D'], seeded(12), 3);
    const all = [
      ...state.players.flatMap((player) => player.hand),
      ...state.stock,
      ...state.discard,
    ];
    expect(new Set(all).size).toBe(52);
  });
});

describe('Rummy 500 melds and values', () => {
  it('counts ace, face and pip values', () => {
    expect(handValue(['AS', 'KH', 'TD', '9C', '2S'])).toBe(15 + 10 + 10 + 9 + 2);
    expect(handValue(['AH'])).toBe(15);
  });

  it('recognises sets and rejects incomplete combinations', () => {
    expect(analyzeMeld(['8S', '8H', '8D'])).toMatchObject({ kind: 'set', rank: '8' });
    expect(analyzeMeld(['8S', '8H', '8D', '8C'])).toMatchObject({ kind: 'set', rank: '8' });
    expect(analyzeMeld(['8S', '8H'])).toBeNull();
    expect(analyzeMeld(['8S', '8H', '9D'])).toBeNull();
  });

  it('reads aces high and low, never around the corner', () => {
    const low = analyzeMeld(['AS', '2S', '3S']);
    expect(low).toMatchObject({ kind: 'run', suit: 'S', aceLow: true });
    expect(low?.cards).toEqual(['AS', '2S', '3S']);
    const high = analyzeMeld(['QS', 'KS', 'AS']);
    expect(high).toMatchObject({ kind: 'run', suit: 'S', aceLow: false });
    expect(high?.cards).toEqual(['QS', 'KS', 'AS']);
    expect(analyzeMeld(['KS', 'AS', '2S'])).toBeNull();
    expect(analyzeMeld(['5H', '6H', '8H'])).toBeNull();
    expect(analyzeMeld(['5H', '6H', '7D'])).toBeNull();
  });

  it('scores a low ace as one in A-2-3 and fifteen high', () => {
    expect(meldPoints(makeMeld(1, 0, ['AS', '2S', '3S']))).toBe(6);
    expect(meldPoints(makeMeld(1, 0, ['QS', 'KS', 'AS']))).toBe(35);
    expect(meldPoints(makeMeld(1, 0, ['8S', '8H', '8D']))).toBe(24);
  });

  it('creates a meld, removes the cards and credits the owner', () => {
    const state = stateWith({ hands: [['5C', '5D', '5H', '9S', 'KC'], ['2C', '3C', '4C']] });
    const result = applyAction(state, { type: 'meld', cards: ['5C', '5D', '5H'] });
    expect(result.ok).toBe(true);
    expect(result.state.melds).toHaveLength(1);
    expect(result.state.melds[0].owner).toBe(0);
    expect(result.state.players[0].hand).toEqual(['9S', 'KC']);
    expect(meldPointsFor(result.state, 0)).toBe(15);
    expect(meldPointsFor(result.state, 1)).toBe(0);
  });

  it('lays off a fourth set card and rejects a fifth', () => {
    const state = stateWith({
      hands: [['8C', '2C'], ['3C', '4C']],
      melds: [makeMeld(1, 0, ['8S', '8H', '8D'])],
    });
    const next = applyAction(state, { type: 'layoff', card: '8C', meldId: 1 });
    expect(next.ok).toBe(true);
    expect(next.state.melds[0].cards).toHaveLength(4);
    expect(next.state.melds[0].cards.find((item) => item.card === '8C')?.by).toBe(0);

    const full = stateWith({
      hands: [['8C', '2C'], ['3C', '4C']],
      melds: [makeMeld(1, 0, ['8S', '8H', '8D', '8C'])],
    });
    expect(applyAction(full, { type: 'layoff', card: '8C', meldId: 1 }).error).toBe('bad-layoff');
  });

  it('extends a run at both ends in sequence order', () => {
    const state = stateWith({
      hands: [['4H', '8H', '2C'], ['3C', '9C']],
      melds: [heartRun()],
    });
    const low = applyAction(state, { type: 'layoff', card: '4H', meldId: 1 });
    expect(low.ok).toBe(true);
    expect(low.state.melds[0].cards.map((item) => item.card)).toEqual(['4H', '5H', '6H', '7H']);
    const high = applyAction(low.state, { type: 'layoff', card: '8H', meldId: 1 });
    expect(high.ok).toBe(true);
    expect(high.state.melds[0].cards.map((item) => item.card)).toEqual([
      '4H',
      '5H',
      '6H',
      '7H',
      '8H',
    ]);
  });

  it('lays an ace low on a low run and high on a high run', () => {
    const lowRun = stateWith({
      hands: [['AS', '9C'], ['2C', '3C']],
      melds: [makeMeld(1, 0, ['2S', '3S', '4S'])],
    });
    const low = applyAction(lowRun, { type: 'layoff', card: 'AS', meldId: 1 });
    expect(low.ok).toBe(true);
    expect(low.state.melds[0].aceLow).toBe(true);
    expect(low.state.melds[0].cards.map((item) => item.card)).toEqual(['AS', '2S', '3S', '4S']);
    expect(meldPoints(low.state.melds[0])).toBe(10);

    const highRun = stateWith({
      hands: [['AS', '9C'], ['2C', '3C']],
      melds: [makeMeld(1, 0, ['JS', 'QS', 'KS'])],
    });
    const high = applyAction(highRun, { type: 'layoff', card: 'AS', meldId: 1 });
    expect(high.ok).toBe(true);
    expect(high.state.melds[0].aceLow).toBe(false);
    expect(high.state.melds[0].cards.map((item) => item.card)).toEqual(['JS', 'QS', 'KS', 'AS']);
    expect(meldCardValue(high.state.melds[0], 'AS')).toBe(15);
  });

  it('keeps a high ace high when extending 2 through K', () => {
    const run = makeMeld(1, 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS']);
    const state = stateWith({
      hands: [['AS', '9C'], ['2C', '3C']],
      melds: [run],
    });
    const result = applyAction(state, { type: 'layoff', card: 'AS', meldId: 1 });
    expect(result.ok).toBe(true);
    expect(result.state.melds[0].aceLow).toBe(false);
    expect(result.state.melds[0].cards[result.state.melds[0].cards.length - 1].card).toBe('AS');
    expect(meldCardValue(result.state.melds[0], 'AS')).toBe(15);
  });
});

describe('Rummy 500 turns, discards and scoring', () => {
  it('draws the top stock card and enters the meld phase', () => {
    const state = stateWith({
      hands: [['2C', '3C'], ['4C', '5C']],
      stock: ['9D', 'KS'],
      phase: 'draw',
    });
    const result = applyAction(state, { type: 'draw-stock' });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toContain('KS');
    expect(result.state.stock).toEqual(['9D']);
    expect(result.state.phase).toBe('meld');
    expect(result.state.drawn).toMatchObject({ card: 'KS', from: 'stock' });
    expect(result.state.version).toBe(1);
  });

  it('takes a buried discard with every card above it', () => {
    const state = stateWith({
      hands: [['5D', '6D', '9C'], ['2C', '3C']],
      stock: ['7S'],
      discard: ['2D', '3D', '4D'],
      phase: 'draw',
    });
    expect(canTakeDiscard(state, 1)).toBe(true);
    expect(takeableDiscardIndexes(state)).toEqual([true, true, true]);
    const result = applyAction(state, { type: 'take-discard', index: 1 });
    expect(result.ok).toBe(true);
    expect(result.state.discard).toEqual(['2D']);
    expect(result.state.players[0].hand).toEqual(expect.arrayContaining(['3D', '4D', '5D', '6D']));
    expect(result.state.mustMeld).toBe('3D');
    expect(result.state.drawn?.taken).toEqual(['3D', '4D']);
  });

  it('refuses a discard that cannot be used', () => {
    const state = stateWith({
      hands: [['9C', '9D', '2S'], ['3C', '4C']],
      stock: ['7S'],
      discard: ['KH'],
      phase: 'draw',
    });
    expect(canTakeDiscard(state, 0)).toBe(false);
    expect(applyAction(state, { type: 'take-discard', index: 0 }).error).toBe('cannot-use-discard');
  });

  it('forces a taken discard to be melded before discarding', () => {
    const state = stateWith({
      hands: [['5D', '6D', '9C'], ['2C', '3C']],
      stock: ['7S'],
      discard: ['2D', '3D', '4D'],
      phase: 'draw',
    });
    const taken = applyAction(state, { type: 'take-discard', index: 1 }).state;
    expect(applyAction(taken, { type: 'discard', card: '9C' }).error).toBe('must-meld');
    const melded = applyAction(taken, { type: 'meld', cards: ['3D', '4D', '5D'] });
    expect(melded.ok).toBe(true);
    expect(melded.state.mustMeld).toBeNull();
    const discarded = applyAction(melded.state, { type: 'discard', card: '9C' });
    expect(discarded.ok).toBe(true);
    expect(discarded.state.turn).toBe(1);
  });

  it('clears the must-meld obligation by laying the taken card off', () => {
    const state = stateWith({
      hands: [['5H', '2C', '3C'], ['4C', '9C']],
      stock: ['7S'],
      discard: ['5H'],
      melds: [makeMeld(1, 0, ['6H', '7H', '8H'])],
      phase: 'draw',
    });
    const taken = applyAction(state, { type: 'take-discard', index: 0 }).state;
    expect(taken.mustMeld).toBe('5H');
    const laid = applyAction(taken, { type: 'layoff', card: '5H', meldId: 1 });
    expect(laid.ok).toBe(true);
    expect(laid.state.mustMeld).toBeNull();
  });

  it('discards one card, advances the turn and resets the draw phase', () => {
    const state = stateWith({
      hands: [['2C', '3C'], ['4C', '5C']],
      stock: ['6C'],
      discard: ['9D'],
    });
    const result = applyAction(state, { type: 'discard', card: '2C' });
    expect(result.ok).toBe(true);
    expect(result.state.discard).toEqual(['9D', '2C']);
    expect(result.state.players[0].hand).toEqual(['3C']);
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('draw');
    expect(result.state.drawn).toBeNull();
  });

  it('enforces the seat on a LAN action', () => {
    const state = setupGame(['A', 'B'], rng, 1);
    expect(applySeatAction(state, 1, { type: 'draw-stock' }).error).toBe('wrong-turn');
    expect(applySeatAction(state, 0, { type: 'draw-stock' }).ok).toBe(true);
  });

  it('scores a hand when the last card is discarded', () => {
    const state = stateWith({
      hands: [['9C'], ['2C', '3C']],
      melds: [setFives()],
      phase: 'meld',
    });
    const result = applyAction(state, { type: 'discard', card: '9C' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.report?.reason).toBe('went-out');
    expect(result.state.report?.wentOut).toBe(0);
    expect(result.state.report?.melded).toEqual([15, 0]);
    expect(result.state.report?.deadwood).toEqual([0, 5]);
    expect(result.state.report?.scores).toEqual([15, -5]);
    expect(result.state.report?.totals).toEqual([15, -5]);
  });

  it('scores a hand when the last cards are melded', () => {
    const state = stateWith({
      hands: [['5C', '5D', '5H'], ['2C', '3C']],
      phase: 'meld',
    });
    const result = applyAction(state, { type: 'meld', cards: ['5C', '5D', '5H'] });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.report?.melded[0]).toBe(15);
    expect(result.state.report?.scores[0]).toBe(15);
  });

  it('subtracts deadwood and counts a low ace as one', () => {
    const state = stateWith({
      hands: [['AH'], ['2C', '3C']],
      stock: [],
      melds: [makeMeld(1, 0, ['AS', '2S', '3S'])],
      phase: 'draw',
    });
    const result = applyAction(state, { type: 'draw-stock' });
    expect(result.ok).toBe(true);
    expect(result.state.report?.reason).toBe('stock-empty');
    expect(result.state.report?.melded[0]).toBe(6);
    expect(result.state.report?.deadwood[0]).toBe(15);
    expect(result.state.report?.scores[0]).toBe(-9);
  });

  it('starts a new hand with the dealer rotated and scores kept', () => {
    const state = stateWith({
      hands: [['2C'], ['3C']],
      scores: [10, 20],
      phase: 'round-over',
      dealer: 1,
      round: 1,
    });
    const result = nextRound(state, seeded(4));
    expect(result.ok).toBe(true);
    expect(result.state.dealer).toBe(0);
    expect(result.state.turn).toBe(1);
    expect(result.state.round).toBe(2);
    expect(result.state.players.map((player) => player.score)).toEqual([10, 20]);
    expect(result.state.players.map((player) => player.hand.length)).toEqual([13, 13]);
    expect(result.state.phase).toBe('draw');
    expect(result.state.report).toBeNull();
    expect(result.state.version).toBe(1);
  });

  it('ends the hand when the stock is empty on a draw', () => {
    const state = stateWith({
      hands: [['2C', '3C'], ['4D', '5D']],
      stock: [],
      phase: 'draw',
    });
    const result = applyAction(state, { type: 'draw-stock' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.report?.reason).toBe('stock-empty');
    expect(result.state.report?.wentOut).toBeNull();
  });

  it('ends the game at 500 with the highest total', () => {
    const state = stateWith({
      hands: [['9C'], ['3C']],
      scores: [490, 400],
      melds: [setFives(), setSixes()],
      phase: 'meld',
    });
    const result = applyAction(state, { type: 'discard', card: '9C' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('game-over');
    expect(result.state.winner).toBe(0);
    expect(result.state.report?.totals[0]).toBe(505);
    expect(result.state.report?.totals[1]).toBe(415);
  });

  it('plays another hand when two players tie above 500', () => {
    const state = stateWith({
      hands: [['9C'], ['3C']],
      scores: [490, 490],
      melds: [setFives(), setSixes()],
      phase: 'meld',
    });
    const result = applyAction(state, { type: 'discard', card: '9C' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('round-over');
    expect(result.state.report?.tie).toBe(true);
    expect(result.state.report?.totals).toEqual([505, 505]);
    expect(result.state.winner).toBeNull();
    expect(nextRound(result.state, seeded(9)).ok).toBe(true);
  });

  it('never mutates the state passed into an action', () => {
    const state = stateWith({
      hands: [['5C', '5D', '5H', '9S'], ['2C', '3C']],
      stock: ['4C'],
    });
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'meld', cards: ['5C', '5D', '5H'] });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('Rummy 500 private views', () => {
  it('gives each seat only its own hand and the public table', () => {
    const state = stateWith({
      hands: [['2C', '3C'], ['4D', '5D']],
      stock: ['6H', '7H'],
      discard: ['8S'],
      melds: [setFives()],
      turn: 0,
      phase: 'meld',
    });
    const mine = view(state, 0);
    const theirs = view(state, 1);
    expect(mine.hand).toEqual(sortHand(['2C', '3C']));
    expect(theirs.hand).toEqual(sortHand(['4D', '5D']));
    expect(mine.hand).not.toContain('4D');
    expect(mine.players.map((player) => player.handCount)).toEqual([2, 2]);
    expect(mine.players.map((player) => player.score)).toEqual([0, 0]);
    expect(mine.canAct).toBe(true);
    expect(theirs.canAct).toBe(false);
    expect(mine.melds).toHaveLength(1);
    expect(mine.stockCount).toBe(2);
    expect(mine.handPoints).toBe(5);
    expect(mine.meldedPoints).toBe(15);
  });

  it('gives the acting guest seat its own hand and takeable discards', () => {
    const state = stateWith({
      hands: [['5D', '6D', '9C'], ['2C', '3C']],
      stock: ['7S'],
      discard: ['2D', '3D', '4D'],
      turn: 0,
      phase: 'draw',
    });
    const guest = view(state, 0);
    expect(guest.seat).toBe(0);
    expect(guest.takeable).toEqual([true, true, true]);
    expect(guest.canDrawStock).toBe(true);
    expect(guest.canDiscard).toBe(false);
  });
});

describe('Rummy 500 AI', () => {
  it('returns a legal action at every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const state = setupGame(['A', 'B'], seeded(level.length), 1);
      const action = chooseAiAction(state, level, () => 0.4);
      expect(action).not.toBeNull();
      const result = applyAction(state, action as NonNullable<typeof action>);
      expect(result.ok).toBe(true);
    }
  });

  it('draws from the stock when the discard pile is useless', () => {
    const state = stateWith({
      hands: [['2C', '4D', '6H', '8S', '9C'], ['3C', '5C']],
      stock: ['3C'],
      discard: ['KS'],
      phase: 'draw',
    });
    expect(chooseAiAction(state, 'hard', () => 0.5)).toEqual({ type: 'draw-stock' });
  });

  it('takes a discard that completes a run', () => {
    const state = stateWith({
      hands: [['5D', '6D', '7D', '9C'], ['2C', '3C']],
      stock: ['2S'],
      discard: ['8D'],
      phase: 'draw',
    });
    const action = chooseAiAction(state, 'hard', () => 0.5);
    expect(action?.type).toBe('take-discard');
    if (action?.type === 'take-discard') {
      expect(canTakeDiscard(state, action.index)).toBe(true);
    }
  });

  it('melds a taken discard and never leaves the obligation hanging', () => {
    const state = stateWith({
      hands: [['5D', '6D', '7D', '9C'], ['2C', '3C']],
      stock: ['2S'],
      discard: ['8D'],
      phase: 'draw',
    });
    const taken = applyAction(state, { type: 'take-discard', index: 0 }).state;
    expect(taken.mustMeld).toBe('8D');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const after = runAiTurn(taken, level, seeded(3));
      expect(after.mustMeld).toBeNull();
      expect(after.phase === 'meld' || after.phase === 'round-over' || after.phase === 'game-over').toBe(true);
    }
  });

  it('finishes a complete four-player game to 500', () => {
    let state = setupGame(['A', 'B', 'C', 'D'], seeded(2026), 3);
    let steps = 0;
    while (state.phase !== 'game-over' && steps < 3000) {
      if (state.phase === 'round-over') {
        const next = nextRound(state, seeded(1000 + steps));
        expect(next.ok).toBe(true);
        state = next.state;
      } else {
        const before = state.version;
        state = runAiTurn(state, 'normal', seeded(5000 + steps));
        expect(state.version).toBeGreaterThan(before);
      }
      steps += 1;
    }
    expect(state.phase).toBe('game-over');
    expect(state.winner).not.toBeNull();
    expect(state.players[state.winner as number].score).toBeGreaterThanOrEqual(500);
  });

  it('keeps a discard available at every level', () => {
    const state = stateWith({
      hands: [['2C', '4D', '6H', '8S', '9C'], ['3C', '5C']],
      stock: ['3D'],
      discard: ['KS'],
    });
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseDiscard(state, level, () => 0.1)).not.toBeNull();
    }
  });
});

describe('Rummy 500 hints', () => {
  it('suggests a meld with a point reason', () => {
    const state = stateWith({
      hands: [['5C', '5D', '5H', '9S'], ['2C', '3C']],
      stock: ['4C'],
    });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('meld');
    expect(hint?.points).toBe(15);
    expect(hint?.action.type).toBe('meld');
    const result = applyAction(state, hint?.action as NonNullable<typeof hint>['action']);
    expect(result.ok).toBe(true);
  });

  it('suggests taking a discard that completes a run', () => {
    const state = stateWith({
      hands: [['5D', '6D', '7D', '9C'], ['2C', '3C']],
      stock: ['2S'],
      discard: ['8D'],
      phase: 'draw',
    });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('take');
    expect(hint?.card).toBe('8D');
    expect(hint?.points).toBe(26);
    expect(applyAction(state, hint?.action as NonNullable<typeof hint>['action']).ok).toBe(true);
  });

  it('suggests drawing when no discard can be used', () => {
    const state = stateWith({
      hands: [['2C', '4D', '6H', '8S'], ['3C', '5C']],
      stock: ['9C'],
      discard: ['KS'],
      phase: 'draw',
    });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('stock');
    expect(applyAction(state, hint?.action as NonNullable<typeof hint>['action']).ok).toBe(true);
  });

  it('suggests a discard when nothing can be melded', () => {
    const state = stateWith({
      hands: [['2C', '4D', '6H'], ['3C', '5C']],
      stock: ['9C'],
    });
    const hint = hintFor(state);
    expect(hint?.kind).toBe('discard');
    expect(applyAction(state, hint?.action as NonNullable<typeof hint>['action']).ok).toBe(true);
  });

  it('reminds the player to meld a taken discard first', () => {
    const state = stateWith({
      hands: [['5D', '6D', '7D', '9C'], ['2C', '3C']],
      stock: ['2S'],
      discard: ['8D'],
      phase: 'draw',
    });
    const taken = applyAction(state, { type: 'take-discard', index: 0 }).state;
    const hint = hintFor(taken);
    expect(hint?.kind).toBe('must');
    expect(applyAction(taken, hint?.action as NonNullable<typeof hint>['action']).ok).toBe(true);
  });

  it('has no hint once the game is over', () => {
    const state = stateWith({
      hands: [['2C'], ['3C']],
      phase: 'game-over',
      winner: 0,
    });
    expect(hintFor(state)).toBeNull();
  });
});

describe('Rummy 500 family record', () => {
  const summary: GameSummary = {
    winner: 0,
    winnerName: '',
    score: 510,
    bestScore: 510,
    players: 3,
    rounds: 4,
  };

  it('counts games, the best score and the mode split', () => {
    const first = addResult(EMPTY_RECORD, summary, { mode: 'ai', level: 'normal' }, 1000);
    const second = addResult(first, { ...summary, winner: 1, score: 430 }, { mode: 'local' }, 2000);
    const third = addResult(second, { ...summary, score: 480 }, { mode: 'lan' }, 3000);
    expect(third.games).toBe(3);
    expect(third.bestScore).toBe(510);
    expect(third.byMode).toEqual({ ai: 1, local: 1, lan: 1 });
    expect(third.recent.map((entry) => entry.mode)).toEqual(['lan', 'local', 'ai']);
    expect(third.recent[2].level).toBe('normal');
  });

  it('keeps only the eight most recent results', () => {
    let record = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addResult(record, summary, { mode: 'ai' }, 1000 + index);
    }
    expect(record.games).toBe(11);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
  });

  it('normalizes a legacy record without modes or recent games', () => {
    const record = normalizeRecord({ games: 4, bestScore: 320 });
    expect(record.games).toBe(4);
    expect(record.bestScore).toBe(320);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
    expect(record.recent).toEqual([]);
  });

  it('builds a summary only for a finished game', () => {
    const state = stateWith({
      hands: [['2C'], ['3C']],
      scores: [505, 410],
      phase: 'game-over',
      winner: 0,
      round: 5,
    });
    expect(gameSummary(state)).toMatchObject({ winner: 0, score: 505, players: 2, rounds: 5 });
    expect(gameSummary({ ...state, phase: 'meld', winner: null })).toBeNull();
  });
});
