import { describe, expect, it } from 'vitest';
import { chooseAiAction, AI_LEVELS } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  DECK,
  applySeat,
  beats,
  checkPlay,
  classify,
  decomposeHand,
  fallbackAction,
  legalCombos,
  pass,
  penaltyForCount,
  play,
  seededRng,
  setup,
  sortHand,
  view,
  type Card,
  type GameState,
} from '../src/game/big-two';

const CARD_MAP = new Map(DECK.map((card) => [card.id, card]));

function card(id: string): Card {
  const found = CARD_MAP.get(id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

function cards(...ids: string[]): Card[] {
  return ids.map(card);
}

function table(
  hands: string[][],
  turn = 0,
  trickSeat = -1,
  trickCards: string[] = [],
  mustLead = false,
): GameState {
  const dealt = hands.map((hand) => cards(...hand));
  const trick =
    trickSeat >= 0 && trickCards.length > 0
      ? { seat: trickSeat, combo: classify(cards(...trickCards))! }
      : null;
  return {
    hands: dealt,
    turn,
    trick,
    passed: [false, false, false, false],
    phase: 'playing',
    winner: null,
    result: null,
    mustLeadDiamond: mustLead,
    starter: turn,
    discard: trickCards.length > 0 ? cards(...trickCards) : [],
    last: null,
    actions: 0,
  };
}

function finishedState(): GameState {
  const base = setup(seededRng(77));
  const hands = base.hands.map((hand) => hand.filter((item) => item.id !== 'D3'));
  hands[0] = [card('D3')];
  const state: GameState = {
    ...base,
    hands,
    turn: 0,
    trick: null,
    passed: [false, false, false, false],
    phase: 'playing',
    winner: null,
    result: null,
    mustLeadDiamond: true,
    starter: 0,
    discard: [],
    last: null,
    actions: 0,
  };
  const result = play(state, 0, ['D3']);
  if (!result.ok) throw new Error('Could not finish test game');
  return result.state;
}

describe('Big Two deck and deal', () => {
  it('has 52 unique cards with the Big Two rank and suit order', () => {
    expect(DECK).toHaveLength(52);
    expect(new Set(DECK.map((item) => item.id)).size).toBe(52);
    expect(cards('D3', 'C3', 'H3', 'S3').map((item) => sortHand(cards('D3', 'C3', 'H3', 'S3')).indexOf(item))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(sortHand(cards('S2', 'D2', 'CA', 'DA')).map((item) => item.id)).toEqual([
      'DA', 'CA', 'D2', 'S2',
    ]);
  });

  it('deals thirteen cards to each seat and finds the 3 of diamonds', () => {
    const state = setup(seededRng(42));
    expect(state.hands).toHaveLength(4);
    for (const hand of state.hands) expect(hand).toHaveLength(13);
    expect(state.hands[state.starter].some((item) => item.id === 'D3')).toBe(true);
    expect(state.mustLeadDiamond).toBe(true);
    expect(state.turn).toBe(state.starter);
  });

  it('is reproducible from a seed but changes with another seed', () => {
    const a = setup(seededRng(42));
    const b = setup(seededRng(42));
    const c = setup(seededRng(43));
    expect(a.hands.map((hand) => hand.map((item) => item.id))).toEqual(
      b.hands.map((hand) => hand.map((item) => item.id)),
    );
    expect(a.hands.map((hand) => hand.map((item) => item.id))).not.toEqual(
      c.hands.map((hand) => hand.map((item) => item.id)),
    );
  });
});

describe('first lead and combinations', () => {
  it('forces the holder of 3D to lead with it', () => {
    const state = setup(seededRng(2));
    const seat = state.turn;
    const other = state.hands[seat].find((item) => item.id !== 'D3')!;
    const check = checkPlay(state, seat, [other.id]);
    expect(check.ok).toBe(false);
    expect(check.error).toBe('must-lead-diamond');
    expect(play(state, seat, [other.id]).ok).toBe(false);
  });

  it('accepts a first lead that includes 3D', () => {
    const state = setup(seededRng(2));
    const result = play(state, state.turn, ['D3']);
    expect(result.ok).toBe(true);
    expect(result.state.mustLeadDiamond).toBe(false);
    expect(result.state.hands[result.state.turn]).toHaveLength(13);
  });

  it('classifies singles, pairs and triples and rejects mixed ranks', () => {
    expect(classify(cards('D3'))?.type).toBe('single');
    expect(classify(cards('D3', 'C3'))?.type).toBe('pair');
    expect(classify(cards('S3', 'D3', 'C3'))?.type).toBe('triple');
    expect(classify(cards('D3', 'C4'))).toBeNull();
    expect(classify(cards('D3', 'C3', 'H3', 'S3'))).toBeNull();
  });

  it('classifies straights and rejects gaps and the 2', () => {
    const straight = classify(cards('D3', 'C4', 'H5', 'S6', 'D7'));
    expect(straight?.type).toBe('straight');
    expect(straight?.rank).toBe(7);
    expect(classify(cards('D3', 'C4', 'H5', 'S6', 'D8'))).toBeNull();
    expect(classify(cards('DJ', 'CQ', 'HK', 'DA', 'S2'))).toBeNull();
  });

  it('classifies flushes, full houses, four plus one and straight flushes', () => {
    expect(classify(cards('D3', 'D5', 'D7', 'D9', 'DJ'))?.type).toBe('flush');
    const house = classify(cards('D3', 'C3', 'H3', 'D5', 'C5'));
    expect(house?.type).toBe('full-house');
    expect(house?.rank).toBe(3);
    expect(house?.secondary).toBe(5);
    expect(classify(cards('D3', 'C3', 'H3', 'S3', 'D5'))?.type).toBe('four-plus-one');
    const flush = classify(cards('D3', 'D4', 'D5', 'D6', 'D7'));
    expect(flush?.type).toBe('straight-flush');
    expect(flush?.category).toBe(4);
  });

  it('orders five-card hands straight < flush < full house < four < straight flush', () => {
    const straight = classify(cards('D3', 'C4', 'H5', 'S6', 'D7'))!;
    const flush = classify(cards('D3', 'D5', 'D7', 'D9', 'DJ'))!;
    const house = classify(cards('D3', 'C3', 'H3', 'D5', 'C5'))!;
    const four = classify(cards('D3', 'C3', 'H3', 'S3', 'D5'))!;
    const straightFlush = classify(cards('D3', 'D4', 'D5', 'D6', 'D7'))!;
    expect(beats(flush, straight)).toBe(true);
    expect(beats(house, flush)).toBe(true);
    expect(beats(four, house)).toBe(true);
    expect(beats(straightFlush, four)).toBe(true);
    expect(beats(straight, flush)).toBe(false);
  });

  it('compares five-card hands inside the same category', () => {
    const houseLow = classify(cards('D3', 'C3', 'H3', 'D5', 'C5'))!;
    const houseHigh = classify(cards('D4', 'C4', 'H4', 'D6', 'C6'))!;
    expect(beats(houseHigh, houseLow)).toBe(true);
    const flushA = classify(cards('D3', 'D5', 'D7', 'D9', 'DA'))!;
    const flushK = classify(cards('C3', 'C5', 'C7', 'C9', 'CK'))!;
    expect(beats(flushA, flushK)).toBe(true);
    const sf7 = classify(cards('D3', 'D4', 'D5', 'D6', 'D7'))!;
    const sf6 = classify(cards('C3', 'C4', 'C5', 'C6', 'C7'))!;
    expect(beats(sf7, sf6)).toBe(false);
    expect(beats(sf7, classify(cards('C2', 'C3', 'C4', 'C5', 'C6'))!)).toBe(true);
  });

  it('compares singles, pairs and triples by rank then suit', () => {
    expect(beats(classify(cards('S2'))!, classify(cards('D2'))!)).toBe(true);
    const pair3Spade = classify(cards('S3', 'H3'))!;
    const pair3Diamond = classify(cards('D3', 'C3'))!;
    expect(beats(pair3Spade, pair3Diamond)).toBe(true);
    expect(beats(classify(cards('H4', 'S4', 'D4'))!, classify(cards('S3', 'H3', 'C3'))!)).toBe(true);
  });
});

describe('play, pass and trick flow', () => {
  it('rejects illegal plays without mutating the state', () => {
    const state = setup(seededRng(5));
    const seat = state.turn;
    const wrongSeat = (seat + 1) % 4;
    expect(checkPlay(state, wrongSeat, ['D3']).error).toBe('wrong-turn');
    expect(play(state, wrongSeat, ['D3']).ok).toBe(false);
    const foreign = state.hands[wrongSeat][0];
    expect(play(state, seat, [foreign.id]).error).toBe('not-your-card');
    expect(play(state, seat, [state.hands[seat][0].id, state.hands[seat][0].id]).error).toBe(
      'duplicate-card',
    );
    expect(state.actions).toBe(0);
    expect(state.hands[seat]).toHaveLength(13);
  });

  it('plays a card, removes it and advances the turn', () => {
    const state = table([['D3', 'D5'], ['C3', 'C4'], ['H3', 'H4'], ['S3', 'S4']], 0, -1, [], true);
    const result = play(state, 0, ['D3']);
    expect(result.ok).toBe(true);
    expect(result.state.hands[0].map((item) => item.id)).toEqual(['D5']);
    expect(result.state.turn).toBe(1);
    expect(result.state.trick?.combo.type).toBe('single');
    expect(state.hands[0]).toHaveLength(2);
  });

  it('passes, locks the seat out and clears the trick after three passes', () => {
    const state = table([['D5'], ['C6'], ['H7'], ['S8']], 1, 0, ['D3']);
    const one = pass(state, 1);
    expect(one.ok).toBe(true);
    expect(one.state.passed[1]).toBe(true);
    expect(one.state.turn).toBe(2);
    const two = pass(one.state, 2);
    expect(two.state.turn).toBe(3);
    const three = pass(two.state, 3);
    expect(three.state.trick).toBeNull();
    expect(three.state.turn).toBe(0);
    expect(three.state.passed).toEqual([false, false, false, false]);
    expect(pass(three.state, 1).error).toBe('wrong-turn');
  });

  it('last player leads again after a cleared trick', () => {
    let state = table([['D5', 'S9'], ['C6'], ['H7'], ['S8']], 1, 0, ['D3']);
    state = pass(state, 1).state;
    state = pass(state, 2).state;
    state = pass(state, 3).state;
    const result = play(state, 0, ['D5']);
    expect(result.ok).toBe(true);
    expect(result.state.trick?.seat).toBe(0);
    expect(result.state.turn).toBe(1);
  });

  it('ends immediately when a hand empties and scores the remaining cards', () => {
    const state = finishedState();
    expect(state.phase).toBe('round-over');
    expect(state.winner).toBe(0);
    expect(state.result?.counts[0]).toBe(0);
    expect(state.result?.penalties[0]).toBe(0);
    expect(state.result?.gain).toBe(state.result!.penalties.slice(1).reduce((a, b) => a + b, 0));
  });

  it('doubles at ten cards and triples at thirteen', () => {
    expect(penaltyForCount(1)).toBe(1);
    expect(penaltyForCount(9)).toBe(9);
    expect(penaltyForCount(10)).toBe(20);
    expect(penaltyForCount(12)).toBe(24);
    expect(penaltyForCount(13)).toBe(39);
  });
});

describe('privacy and seat enforcement', () => {
  it('view exposes only the requested hand and public counts', () => {
    const state = setup(seededRng(12));
    const seen = view(state, 2, ['A', 'B', 'C', 'D']);
    expect(seen.seat).toBe(2);
    expect(seen.hand).toHaveLength(13);
    expect(seen.hand.map((item) => item.id)).toEqual(
      sortHand(state.hands[2]).map((item) => item.id),
    );
    expect(seen.handCounts).toEqual([13, 13, 13, 13]);
    expect(seen.names).toEqual(['A', 'B', 'C', 'D']);
    expect(seen).not.toHaveProperty('hands');
    expect(JSON.stringify(seen)).not.toContain(state.hands[0][0].id);
  });

  it('applySeat enforces the seat and action shape', () => {
    const state = setup(seededRng(14));
    expect(applySeat(state, 4, { type: 'pass' }).error).toBe('wrong-seat');
    expect(applySeat(state, state.turn, { type: 'play', cards: [] }).error).toBe('empty');
    const ghost = applySeat(state, state.turn, { type: 'pass' });
    expect(ghost.error).toBe('no-trick');
  });

  it('legalCombos returns only beating plays and only D3 first leads', () => {
    const lead = table([['D3', 'C3', 'D5', 'C5', 'S2'], ['C3'], ['H3'], ['S3']], 0, -1, [], true);
    const leadCombos = legalCombos(lead, 0);
    expect(leadCombos.length).toBeGreaterThan(0);
    expect(leadCombos.every((combo) => combo.cards.some((item) => item.id === 'D3'))).toBe(true);
    expect(leadCombos.some((combo) => combo.size === 2)).toBe(true);

    const follow = table([['D5', 'S2'], ['C3'], ['H3'], ['S3']], 0, 1, ['C10']);
    const followCombos = legalCombos(follow, 0);
    expect(followCombos.map((combo) => combo.cards[0].id)).toEqual(['S2']);
    expect(followCombos.every((combo) => beats(combo, follow.trick!.combo))).toBe(true);
  });
});

describe('AI and hints', () => {
  it('AI returns a legal action at every level', () => {
    const state = setup(seededRng(21));
    for (const level of AI_LEVELS) {
      const action = chooseAiAction(state, state.turn, level, seededRng(9));
      expect(action).not.toBeNull();
      const result = applySeat(state, state.turn, action!);
      expect(result.ok, level).toBe(true);
    }
  });

  it('AI is deterministic with an injected RNG', () => {
    const state = setup(seededRng(22));
    for (const level of AI_LEVELS) {
      const a = chooseAiAction(state, state.turn, level, seededRng(123));
      const b = chooseAiAction(state, state.turn, level, seededRng(123));
      expect(a).toEqual(b);
    }
  });

  it('AI takes an immediate winning play', () => {
    const state = table([['D3'], ['C3'], ['H3'], ['S3']], 0, -1, [], true);
    const action = chooseAiAction(state, 0, 'hard', seededRng(1));
    expect(action?.type).toBe('play');
    if (action?.type === 'play') expect(action.cards).toEqual(['D3']);
  });

  it('Companion avoids spending a 2 on a short-handed human', () => {
    const state = table([['D3'], ['S2', 'D5'], ['C10'], ['H4']], 1, 2, ['C10']);
    const action = chooseAiAction(state, 1, 'companion', seededRng(1));
    expect(action).toEqual({ type: 'pass' });
  });

  it('Hard leads a multi-card combination against a one-card opponent', () => {
    const state = table(
      [['D3'], ['C3'], ['H3'], ['D5', 'C5', 'D6', 'C6', 'H7', 'C8']],
      3,
      -1,
      [],
      false,
    );
    const action = chooseAiAction(state, 3, 'hard', seededRng(1));
    expect(action?.type).toBe('play');
    if (action?.type === 'play') expect(action.cards.length).toBeGreaterThanOrEqual(2);
  });

  it('decomposeHand covers every card and finds a five-card block', () => {
    const hand = cards('D3', 'D4', 'D5', 'D6', 'D7', 'D9', 'C9', 'H9', 'DK', 'HK', 'D2', 'S2', 'C4');
    const plan = decomposeHand(hand);
    expect(plan.groups.flat()).toHaveLength(hand.length);
    expect(plan.fiveCard).toBeGreaterThanOrEqual(1);
    expect(plan.units).toBeLessThan(13);
    for (const group of plan.groups) expect(classify(group)).not.toBeNull();
  });

  it('hint explains the forced diamond lead', () => {
    const state = setup(seededRng(31));
    const next = hintFor(state, state.turn);
    expect(next?.kind).toBe('leadDiamond');
    expect(next?.cards.some((item) => item.id === 'D3')).toBe(true);
    expect(next?.action.type).toBe('play');
  });

  it('hint recommends a legal beat or pass', () => {
    const state = table([['D5', 'S2'], ['C3'], ['H3'], ['S3']], 0, 1, ['C10']);
    const next = hintFor(state, 0);
    expect(next).not.toBeNull();
    if (next?.action.type === 'play') {
      expect(checkPlay(state, 0, next.action.cards).ok).toBe(true);
    } else {
      expect(next?.kind).toBe('pass');
    }
  });

  it('hint returns null out of turn and after the round', () => {
    const state = setup(seededRng(32));
    expect(hintFor(state, (state.turn + 1) % 4)).toBeNull();
    expect(hintFor(finishedState(), 0)).toBeNull();
  });

  it('fallbackAction always returns a legal action', () => {
    const following = table([['D5', 'S2'], ['C3'], ['H3'], ['S3']], 0, 1, ['C10']);
    const action = fallbackAction(following, 0);
    expect(action).not.toBeNull();
    expect(applySeat(following, 0, action!).ok).toBe(true);
    const leading = table([['D5', 'S2'], ['C3'], ['H3'], ['S3']], 0);
    const leadAction = fallbackAction(leading, 0);
    expect(leadAction?.type).toBe('play');
  });
});
