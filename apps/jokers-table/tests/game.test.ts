import { describe, expect, it } from 'vitest';
import {
  makeDeck,
  hashSeed,
  deriveSeed,
  shuffledWithSeed,
  evaluateHand,
  straightHighValue,
  isFlush,
  type Card,
  type Rank,
  type Suit,
} from '../src/game/cards';
import { scorePlayedCards } from '../src/game/score';
import {
  BOSSES,
  DECKS,
  ENHANCEMENTS,
  JOKERS,
  JOKER_SLOTS,
  createBlindPlan,
  type BlindPlan,
  type BossId,
  type JokerId,
} from '../src/game/content';
import {
  blindReward,
  buyOffer,
  createRun,
  currentAnte,
  discardCards,
  enterShop,
  nextBlind,
  playCards,
  previewScore,
  rerollShop,
  sellJoker,
  type RunState,
} from '../src/game/run';
import { compareBlind, fallbackWinner } from '../src/game/competition';
import { chooseAction, autoPlayBlind, autoShop, bestPlayFor, hintFor } from '../src/ai/ai';

function card(id: string): Card {
  return {
    id,
    rank: id.slice(0, -1) as Rank,
    suit: id.slice(-1) as Suit,
  };
}

function hand(ids: string[]): Card[] {
  return ids.map(card);
}

function singlePlan(target = 1, boss: BossId | null = null): BlindPlan[] {
  return [
    {
      index: 0,
      ante: 1,
      kind: boss ? 'boss' : 'small',
      boss,
      target,
      reward: 4,
    },
  ];
}

function makeTestRun(target = 1, boss: BossId | null = null): RunState {
  return createRun({ seed: 77, deckId: 'ivory', plan: singlePlan(target, boss) });
}

function twoBlindRun(target = 1): RunState {
  const first = singlePlan(target)[0];
  const second: BlindPlan = {
    ...first,
    index: 1,
    ante: 1,
    kind: 'big',
    boss: null,
    target: 999999,
    reward: 5,
  };
  return createRun({ seed: 77, deckId: 'ivory', plan: [first, second] });
}

function scoreWith(
  joker: JokerId,
  playedIds: string[],
  options: {
    jokers?: JokerId[];
    remaining?: string[];
    discardsLeft?: number;
    discardsUsed?: number;
    boss?: BossId | null;
  } = {},
) {
  const jokers = options.jokers ?? [joker];
  return scorePlayedCards({
    played: hand(playedIds),
    handRemaining: hand(options.remaining ?? []),
    jokers,
    boss: options.boss ?? null,
    discardsLeft: options.discardsLeft ?? 0,
    discardsUsed: options.discardsUsed ?? 0,
  });
}

describe('deck and shuffles', () => {
  it('builds 52 unique cards with four suits and thirteen ranks', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((item) => item.id)).size).toBe(52);
    for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
      expect(deck.filter((item) => item.suit === suit)).toHaveLength(13);
    }
  });

  it('hashes text seeds consistently and derives distinct sub-seeds', () => {
    expect(hashSeed('family-table')).toBe(hashSeed('family-table'));
    expect(hashSeed('family-table')).not.toBe(hashSeed('family-tables'));
    expect(deriveSeed(123, 1, 2)).toBe(deriveSeed(123, 1, 2));
    expect(deriveSeed(123, 1, 2)).not.toBe(deriveSeed(123, 2, 1));
  });

  it('shuffles deterministically for a seed', () => {
    const source = makeDeck();
    const a = shuffledWithSeed(source, 99);
    const b = shuffledWithSeed(source, 99);
    const c = shuffledWithSeed(source, 100);
    expect(a.map((item) => item.id)).toEqual(b.map((item) => item.id));
    expect(a.map((item) => item.id)).not.toEqual(c.map((item) => item.id));
    expect(a).toHaveLength(52);
  });
});

describe('poker hand detection', () => {
  it('detects high card, pair, two pair, three of a kind and four of a kind', () => {
    expect(evaluateHand(hand(['AS', '9H', '7D', '4C', '2S'])).type).toBe('high');
    expect(evaluateHand(hand(['9S', '9H', '2D', '3C', '4S'])).type).toBe('pair');
    expect(evaluateHand(hand(['9S', '9H', '2D', '2C', '4S'])).type).toBe('twoPair');
    expect(evaluateHand(hand(['9S', '9H', '9D', '2C', '4S'])).type).toBe('three');
    expect(evaluateHand(hand(['AS', 'AH', 'AD', 'AC', '2S'])).type).toBe('four');
  });

  it('detects full houses, flushes, straights and straight flushes', () => {
    expect(evaluateHand(hand(['KS', 'KH', 'KD', '4C', '4D'])).type).toBe('fullHouse');
    expect(evaluateHand(hand(['2H', '5H', '8H', 'JH', 'KH'])).type).toBe('flush');
    expect(evaluateHand(hand(['9C', '8D', '7S', '6H', '5C'])).type).toBe('straight');
    expect(evaluateHand(hand(['9H', '8H', '7H', '6H', '5H'])).type).toBe('straightFlush');
    expect(evaluateHand(hand(['AH', 'KH', 'QH', 'JH', '10H'])).type).toBe('royalFlush');
  });

  it('supports the wheel and does not call four cards a straight', () => {
    expect(straightHighValue(hand(['AS', '2H', '3D', '4C', '5S']))).toBe(5);
    expect(evaluateHand(hand(['AS', '2H', '3D', '4C', '5S'])).type).toBe('straight');
    expect(straightHighValue(hand(['AS', '2H', '3D', '4C']))).toBeNull();
    expect(evaluateHand(hand(['AS', '2H', '3D', '4C'])).type).toBe('high');
  });

  it('treats Prism cards as wild for a flush and straight flush', () => {
    const flushCards = hand(['2H', '5H', '8H', 'JH', 'KS']);
    flushCards[4] = { ...flushCards[4], enhance: 'prism' };
    expect(isFlush(flushCards)).toBe(true);
    expect(evaluateHand(flushCards).type).toBe('flush');
    const straightFlush = hand(['9H', '8H', '7H', '6H', '5S']);
    straightFlush[4] = { ...straightFlush[4], enhance: 'prism' };
    expect(evaluateHand(straightFlush).type).toBe('straightFlush');
  });

  it('does not call two separate suits a Prism flush', () => {
    const mixed = hand(['2H', '5H', '8S', 'JS', 'KC']);
    mixed[4] = { ...mixed[4], enhance: 'prism' };
    expect(isFlush(mixed)).toBe(false);
  });
});

describe('chip and mult scoring', () => {
  it('scores a high card as base chips plus card chips', () => {
    const result = scorePlayedCards({
      played: hand(['AS']),
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(result.baseChips).toBe(5);
    expect(result.baseMult).toBe(1);
    expect(result.cardChips).toBe(11);
    expect(result.chips).toBe(16);
    expect(result.mult).toBe(1);
    expect(result.total).toBe(16);
  });

  it('scores a pair with two card values', () => {
    const result = scorePlayedCards({
      played: hand(['9S', '9H', '2D', '3C', '4S']),
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(result.hand.type).toBe('pair');
    expect(result.baseChips).toBe(10);
    expect(result.baseMult).toBe(2);
    expect(result.cardChips).toBe(27);
    expect(result.total).toBe((10 + 27) * 2);
  });

  it('applies Gilt, Cinder, Tally and Keystone enhancements', () => {
    const gilt = scorePlayedCards({
      played: [{ ...card('2C'), enhance: 'gilt' }],
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(gilt.enhancementChips).toBe(40);
    expect(gilt.chips).toBe(5 + 2 + 40);

    const cinder = scorePlayedCards({
      played: [{ ...card('2C'), enhance: 'cinder' }],
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(cinder.enhancementMult).toBe(3);
    expect(cinder.mult).toBe(4);

    const tally = scorePlayedCards({
      played: hand(['2C', '3D', '4S']).map((item) => ({ ...item, enhance: 'tally' as const })),
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(tally.enhancementChips).toBe(12 * 3 * 3);

    const keystone = scorePlayedCards({
      played: hand(['2C', '3D', '4S']).map((item) => ({ ...item, enhance: 'keystone' as const })),
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(keystone.enhancementMult).toBe(9);
  });

  it('applies Bramble per other same-suit scored card', () => {
    const result = scorePlayedCards({
      played: [
        { ...card('2H'), enhance: 'bramble' },
        card('5H'),
        card('8H'),
      ],
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(result.enhancementMult).toBe(4);
  });

  it('adds every scoring enhancement together', () => {
    const result = scorePlayedCards({
      played: [
        { ...card('2H'), enhance: 'gilt' },
        { ...card('3H'), enhance: 'cinder' },
        { ...card('4H'), enhance: 'tally' },
        { ...card('5H'), enhance: 'keystone' },
        { ...card('6H'), enhance: 'bramble' },
      ],
      handRemaining: [],
      jokers: ['alchemist'],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(result.enhancementChips).toBe(40 + 60);
    expect(result.enhancementMult).toBe(3 + 5 + 8);
    expect(result.jokerLines.find((line) => line.joker === 'alchemist')?.mult).toBe(10);
  });
});

describe('all 24 original jokers', () => {
  it('understudy adds 30 chips', () => {
    const result = scoreWith('understudy', ['2C']);
    expect(result.jokerLines.find((line) => line.joker === 'understudy')?.chips).toBe(30);
  });

  it('velvet adds 3 mult', () => {
    const result = scoreWith('velvet', ['2C']);
    expect(result.jokerLines.find((line) => line.joker === 'velvet')?.mult).toBe(3);
  });

  it('compass triggers only with a spade', () => {
    expect(scoreWith('compass', ['AS']).jokerLines[0]?.mult).toBe(4);
    expect(scoreWith('compass', ['2C']).jokerLines).toHaveLength(0);
  });

  it('lantern adds 18 chips per heart', () => {
    const result = scoreWith('lantern', ['AH', 'KH']);
    expect(result.jokerLines[0]?.chips).toBe(36);
  });

  it('ledger triggers when no discards remain', () => {
    expect(scoreWith('ledger', ['2C'], { discardsLeft: 0 }).jokerLines[0]?.mult).toBe(3);
    expect(scoreWith('ledger', ['2C'], { discardsLeft: 2 }).jokerLines).toHaveLength(0);
  });

  it('mirrors adds 35 chips when the hand has a pair', () => {
    expect(scoreWith('mirrors', ['5S', '5H']).jokerLines[0]?.chips).toBe(35);
    expect(scoreWith('mirrors', ['2C', '3D']).jokerLines).toHaveLength(0);
  });

  it('orator multiplies by 1.5 when all scored cards share a suit', () => {
    const result = scoreWith('orator', ['AH', 'KH', 'QH', 'JH', '10H']);
    expect(result.jokerLines[0]?.xmult).toBe(1.5);
    expect(result.mult).toBe(13.5);
  });

  it('backstage adds 2 mult per discard left', () => {
    expect(scoreWith('backstage', ['2C'], { discardsLeft: 2 }).jokerLines[0]?.mult).toBe(4);
  });

  it('finch adds 50 chips for exactly five cards', () => {
    expect(
      scoreWith('finch', ['2C', '3D', '4S', '5H', '7C']).jokerLines[0]?.chips,
    ).toBe(50);
    expect(scoreWith('finch', ['2C', '3D']).jokerLines).toHaveLength(0);
  });

  it('ember adds 15 chips and 1 mult for exactly three cards', () => {
    const result = scoreWith('ember', ['2C', '3D', '4S']);
    expect(result.jokerLines[0]).toMatchObject({ chips: 15, mult: 1 });
  });

  it('collector adds 1 mult per owned joker', () => {
    const result = scoreWith('collector', ['2C'], {
      jokers: ['collector', 'understudy', 'velvet'],
    });
    const line = result.jokerLines.find((item) => item.joker === 'collector');
    expect(line?.mult).toBe(3);
  });

  it('bust adds 55 chips when no face card is played', () => {
    expect(scoreWith('bust', ['2C', '3D', '4S']).jokerLines[0]?.chips).toBe(55);
    expect(scoreWith('bust', ['JS', '2C']).jokerLines).toHaveLength(0);
  });

  it('thread triggers on a straight', () => {
    expect(scoreWith('thread', ['2C', '3D', '4S', '5H', '6C']).jokerLines[0]?.mult).toBe(4);
    expect(scoreWith('thread', ['2C', '3D', '4S', '5H', '7C']).jokerLines).toHaveLength(0);
  });

  it('inkwell triggers on a flush', () => {
    expect(scoreWith('inkwell', ['2H', '5H', '8H', 'JH', 'KH']).jokerLines[0]?.mult).toBe(3);
  });

  it('sundial adds 20 chips per ace', () => {
    expect(scoreWith('sundial', ['AS', 'AH']).jokerLines[0]?.chips).toBe(40);
  });

  it('cellar adds 30 chips on two pair or better', () => {
    expect(scoreWith('cellar', ['5S', '5H', '2C', '2D', '9S']).jokerLines[0]?.chips).toBe(30);
    expect(scoreWith('cellar', ['5S', '5H', '2C', '3D', '9S']).jokerLines).toHaveLength(0);
  });

  it('doorman adds 5 mult for one card', () => {
    expect(scoreWith('doorman', ['2C']).jokerLines[0]?.mult).toBe(5);
    expect(scoreWith('doorman', ['2C', '3D']).jokerLines).toHaveLength(0);
  });

  it('candlewick adds 2 mult per discard used', () => {
    expect(
      scoreWith('candlewick', ['2C'], { discardsUsed: 2 }).jokerLines[0]?.mult,
    ).toBe(4);
  });

  it('harmonica adds 10 chips per distinct rank', () => {
    expect(scoreWith('harmonica', ['2C', '3D', '4S']).jokerLines[0]?.chips).toBe(30);
  });

  it('nightwatch adds 45 chips when two cards remain', () => {
    expect(
      scoreWith('nightwatch', ['2C'], { remaining: ['3D', '4S'] }).jokerLines[0]?.chips,
    ).toBe(45);
  });

  it('alchemist adds 2 mult per enhanced scored card', () => {
    const result = scoreWith('alchemist', ['2C', '3D', '4S'], {
      jokers: ['alchemist'],
    });
    expect(result.jokerLines.find((line) => line.joker === 'alchemist')).toBeUndefined();
    const enhanced = scorePlayedCards({
      played: [{ ...card('2C'), enhance: 'gilt' }, { ...card('3D'), enhance: 'cinder' }],
      handRemaining: [],
      jokers: ['alchemist'],
      boss: null,
      discardsLeft: 0,
      discardsUsed: 0,
    });
    expect(enhanced.jokerLines.find((line) => line.joker === 'alchemist')?.mult).toBe(4);
  });

  it('heir multiplies by 3 on four of a kind or better', () => {
    const result = scoreWith('heir', ['AS', 'AH', 'AD', 'AC', '2S']);
    expect(result.jokerLines[0]?.xmult).toBe(3);
    expect(result.mult).toBe(21);
  });

  it('treasurer and patron pay money after a cleared blind', () => {
    const run = makeTestRun(1);
    const withTreasurer: RunState = {
      ...run,
      jokers: ['treasurer', 'patron'],
      handsLeft: 2,
      money: 10,
      phase: 'cleared',
    };
    const reward = blindReward(withTreasurer, true);
    expect(reward.treasurer).toBe(2);
    expect(reward.patron).toBe(2);
    expect(reward.total).toBe(4 + 2 + 2 + 2 + 2);
  });
});

describe('boss restrictions', () => {
  function scoreBoss(played: string[], boss: BossId, enhancements = false) {
    const cards = hand(played).map((item) =>
      enhancements ? { ...item, enhance: 'gilt' as const } : item,
    );
    return scorePlayedCards({
      played: cards,
      handRemaining: [],
      jokers: [],
      boss,
      discardsLeft: 3,
      discardsUsed: 0,
    });
  }

  it('auditor removes base chips from J, Q and K', () => {
    const normal = scoreBoss(['JS', 'QH', 'KD', '2C', '3S'], 'auditor');
    expect(normal.cardChips).toBe(5);
    const plain = scorePlayedCards({
      played: hand(['JS', 'QH', 'KD', '2C', '3S']),
      handRemaining: [],
      jokers: [],
      boss: null,
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(plain.cardChips).toBe(35);
  });

  it('fog debuffs hearts and their enhancements', () => {
    const result = scoreBoss(['AH', 'KH', '2C', '3D', '4S'], 'fog', true);
    expect(result.debuffed).toEqual(['AH', 'KH']);
    expect(result.enhancementChips).toBe(40 * 3);
  });

  it('pale widow debuffs spades', () => {
    const result = scoreBoss(['AS', 'KS', '2H', '3D', '4C'], 'paleWidow');
    expect(result.debuffed).toEqual(['AS', 'KS']);
    expect(result.cardChips).toBe(2 + 3 + 4);
  });

  it('rulebook forbids discards', () => {
    const run = makeTestRun(999, 'rulebook');
    const result = discardCards(run, [run.hand[0].id]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no-discards');
  });

  it('tax collector takes 2 money for every hand', () => {
    const run = { ...makeTestRun(999, 'taxCollector'), money: 10 };
    const result = playCards(run, [run.hand[0].id]);
    expect(result.ok).toBe(true);
    expect(result.state.money).toBe(8);
  });

  it('mirrorwright disables the first joker slot', () => {
    const run = makeTestRun(999, 'mirrorwright');
    const withJokers = { ...run, jokers: ['understudy', 'velvet'] as JokerId[] };
    const result = playCards(withJokers, [run.hand[0].id]);
    expect(result.ok).toBe(true);
    expect(result.state.lastHand?.jokerLines.some((line) => line.joker === 'understudy')).toBe(false);
    expect(result.state.lastHand?.jokerLines.some((line) => line.joker === 'velvet')).toBe(true);
  });

  it('short bell gives three hands', () => {
    const run = makeTestRun(999, 'shortBell');
    expect(run.handsLeft).toBe(3);
  });

  it('sphinx scores straights with high-card base values', () => {
    const result = scorePlayedCards({
      played: hand(['2C', '3D', '4S', '5H', '6C']),
      handRemaining: [],
      jokers: [],
      boss: 'sphinx',
      discardsLeft: 3,
      discardsUsed: 0,
    });
    expect(result.hand.type).toBe('straight');
    expect(result.baseType).toBe('high');
    expect(result.baseChips).toBe(5);
    expect(result.baseMult).toBe(1);
  });
});

describe('run structure and determinism', () => {
  it('creates the same run from the same seed and a different hand from another seed', () => {
    const a = createRun({ seed: 'alpha', deckId: 'ivory' });
    const b = createRun({ seed: 'alpha', deckId: 'ivory' });
    const c = createRun({ seed: 'beta', deckId: 'ivory' });
    expect(a.hand.map((item) => item.id)).toEqual(b.hand.map((item) => item.id));
    expect(a.drawPile.map((item) => item.id)).toEqual(b.drawPile.map((item) => item.id));
    expect(a.plan).toEqual(b.plan);
    expect(a.hand.map((item) => item.id)).not.toEqual(c.hand.map((item) => item.id));
  });

  it('deals eight cards from a complete 52-card deck', () => {
    const run = createRun({ seed: 5, deckId: 'ivory' });
    expect(run.hand).toHaveLength(8);
    expect(run.deck).toHaveLength(52);
    expect(new Set(run.hand.map((item) => item.id)).size).toBe(8);
    expect(run.drawPile.length + run.hand.length).toBe(52);
  });

  it('builds eighteen blinds across six antes with one boss each', () => {
    const plan = createBlindPlan(20261112, 'ivory', false);
    expect(plan).toHaveLength(18);
    expect(plan.filter((item) => item.kind === 'small')).toHaveLength(6);
    expect(plan.filter((item) => item.kind === 'big')).toHaveLength(6);
    expect(plan.filter((item) => item.kind === 'boss')).toHaveLength(6);
    expect(new Set(plan.filter((item) => item.kind === 'boss').map((item) => item.boss)).size).toBe(6);
    for (let ante = 1; ante <= 6; ante += 1) {
      expect(plan.filter((item) => item.ante === ante)).toHaveLength(3);
    }
    expect(plan[0].target).toBeLessThan(plan[1].target);
    expect(plan[1].target).toBeLessThan(plan[2].target);
  });

  it('adds deterministic sudden-death finales', () => {
    const core = createBlindPlan(44, 'sapphire', false);
    const extended = createBlindPlan(44, 'sapphire', true);
    expect(extended).toHaveLength(24);
    expect(extended.slice(0, 18)).toEqual(core);
    expect(extended.slice(18).every((item) => item.kind === 'finale')).toBe(true);
    expect(extended[23].target).toBeGreaterThan(extended[18].target);
  });

  it('applies each deck modifier', () => {
    expect(createRun({ seed: 1, deckId: 'ivory' }).money).toBe(8);
    expect(createRun({ seed: 1, deckId: 'crimson' }).money).toBe(12);
    expect(createRun({ seed: 1, deckId: 'sapphire' }).money).toBe(6);
    expect(createRun({ seed: 1, deckId: 'sapphire' }).discardsLeft).toBe(4);
    const brass = createRun({ seed: 1, deckId: 'brass' });
    expect(brass.money).toBe(7);
    expect(brass.deck.filter((item) => item.enhance === 'gilt')).toHaveLength(2);
    const ivoryPlan = createBlindPlan(9, 'ivory', false);
    const crimsonPlan = createBlindPlan(9, 'crimson', false);
    expect(crimsonPlan[0].target).toBeGreaterThan(ivoryPlan[0].target);
  });

  it('counts the current ante and blind correctly', () => {
    const run = createRun({ seed: 3, deckId: 'ivory' });
    expect(currentAnte(run)).toBe(1);
    expect(run.plan[run.blindIndex].kind).toBe('small');
  });

  it('tracks all four decks and six enhancements in the catalogue', () => {
    expect(DECKS).toHaveLength(4);
    expect(ENHANCEMENTS).toHaveLength(6);
    expect(JOKERS).toHaveLength(24);
    expect(BOSSES).toHaveLength(8);
  });
});

describe('playing hands and discarding', () => {
  it('rejects more than five cards, duplicates and cards not in hand', () => {
    const run = makeTestRun(999);
    const six = run.hand.slice(0, 6).map((item) => item.id);
    expect(playCards(run, six).error).toBe('not-in-hand');
    const duplicate = [run.hand[0].id, run.hand[0].id];
    expect(playCards(run, duplicate).error).toBe('not-in-hand');
    expect(playCards(run, ['ZZ']).error).toBe('not-in-hand');
  });

  it('removes played cards, draws back to eight and adds the score', () => {
    const run = makeTestRun(999);
    const ids = run.hand.slice(0, 3).map((item) => item.id);
    const result = playCards(run, ids);
    expect(result.ok).toBe(true);
    expect(result.state.hand).toHaveLength(8);
    expect(result.state.hand.some((item) => ids.includes(item.id))).toBe(false);
    expect(result.state.blindScore).toBeGreaterThan(0);
    expect(result.state.handsLeft).toBe(3);
    expect(result.state.handsPlayed).toBe(1);
  });

  it('discards selected cards and draws replacements', () => {
    const run = makeTestRun(999);
    const ids = run.hand.slice(0, 2).map((item) => item.id);
    const result = discardCards(run, ids);
    expect(result.ok).toBe(true);
    expect(result.state.hand).toHaveLength(8);
    expect(result.state.discardsLeft).toBe(2);
    expect(result.state.discardsUsed).toBe(1);
    expect(result.state.hand.some((item) => ids.includes(item.id))).toBe(false);
  });

  it('does not mutate the state passed in', () => {
    const run = makeTestRun(999);
    const before = JSON.stringify(run);
    playCards(run, [run.hand[0].id]);
    discardCards(run, [run.hand[0].id]);
    expect(JSON.stringify(run)).toBe(before);
  });

  it('previews the same total that the play produces', () => {
    const run = makeTestRun(999);
    const ids = run.hand.slice(0, 5).map((item) => item.id);
    const preview = previewScore(run, ids);
    const played = playCards(run, ids);
    expect(preview?.total).toBe(played.state.lastHand?.total);
  });
});

describe('blind completion, rewards and failures', () => {
  it('clears a blind, pays base, unused hands and interest', () => {
    const run = makeTestRun(1);
    const result = playCards(run, [run.hand[0].id]);
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('cleared');
    expect(result.state.lastReward?.base).toBe(4);
    expect(result.state.lastReward?.unusedHands).toBe(3);
    expect(result.state.lastReward?.interest).toBe(1);
    expect(result.state.lastReward?.total).toBe(8);
    expect(result.state.money).toBe(16);
  });

  it('fails when four hands cannot reach the target', () => {
    let run = makeTestRun(999999);
    for (let index = 0; index < 4; index += 1) {
      const result = playCards(run, [run.hand[0].id]);
      expect(result.ok).toBe(true);
      run = result.state;
    }
    expect(run.phase).toBe('failed');
    expect(run.handsLeft).toBe(0);
    expect(run.lastReward?.base).toBe(0);
    expect(run.lastReward?.interest).toBe(1);
  });

  it('pays interest at $1 per $5 with a cap of $5', () => {
    const run = makeTestRun(999);
    expect(blindReward({ ...run, money: 9, handsLeft: 0 }, false).interest).toBe(1);
    expect(blindReward({ ...run, money: 40, handsLeft: 0 }, false).interest).toBe(5);
  });

  it('Coin Press raises the interest step and cap', () => {
    const run = makeTestRun(999);
    const withVoucher = { ...run, vouchers: ['coinPress'] as const };
    expect(blindReward({ ...withVoucher, vouchers: ['coinPress'], money: 40, handsLeft: 0 }, false).interest).toBe(7);
  });

  it('moves from a cleared blind to the shop and then the next blind', () => {
    const run = twoBlindRun(1);
    const cleared = playCards(run, [run.hand[0].id]).state;
    const shop = enterShop(cleared);
    expect(shop.ok).toBe(true);
    expect(shop.state.phase).toBe('shop');
    expect(shop.state.offers).toHaveLength(3);
    const next = nextBlind(shop.state);
    expect(next.ok).toBe(true);
    expect(next.state.phase).toBe('blind');
  });

  it('generates the same shop offers for the same seed and blind', () => {
    const a = enterShop(playCards(makeTestRun(1), [makeTestRun(1).hand[0].id]).state);
    const b = enterShop(playCards(makeTestRun(1), [makeTestRun(1).hand[0].id]).state);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.state.offers).toEqual(b.state.offers);
    }
  });
});

describe('shop purchases', () => {
  function shopRun(): RunState {
    const run = twoBlindRun(1);
    const cleared = playCards(run, [run.hand[0].id]).state;
    const shop = enterShop(cleared);
    if (!shop.ok) throw new Error('shop did not open');
    return { ...shop.state, money: 40 };
  }

  it('buys a joker into an empty slot', () => {
    const run = shopRun();
    const modified: RunState = {
      ...run,
      offers: [
        { kind: 'joker', joker: 'understudy', price: 5 },
        null,
        null,
      ],
    };
    const result = buyOffer(modified, 0);
    expect(result.ok).toBe(true);
    expect(result.state.jokers).toEqual(['understudy']);
    expect(result.state.money).toBe(35);
    expect(result.state.offers[0]).toBeNull();
  });

  it('refuses a fifth joker and a duplicate joker', () => {
    const run = shopRun();
    const full: RunState = {
      ...run,
      jokers: ['understudy', 'velvet', 'compass', 'lantern'],
      offers: [{ kind: 'joker', joker: 'mirrors', price: 5 }, null, null],
    };
    expect(buyOffer(full, 0).error).toBe('slots-full');
    expect(JOKER_SLOTS).toBe(4);
    const duplicate: RunState = {
      ...run,
      jokers: ['understudy'],
      offers: [{ kind: 'joker', joker: 'understudy', price: 5 }, null, null],
    };
    expect(buyOffer(duplicate, 0).error).toBe('already-owned');
  });

  it('requires a target and applies an enhancement to that card', () => {
    const run = shopRun();
    const target = run.deck[0].id;
    const modified: RunState = {
      ...run,
      offers: [{ kind: 'enhancement', enhancement: 'cinder', price: 4 }, null, null],
    };
    expect(buyOffer(modified, 0).error).toBe('need-target');
    const result = buyOffer(modified, 0, target);
    expect(result.ok).toBe(true);
    expect(result.state.deck.find((item) => item.id === target)?.enhance).toBe('cinder');
    expect(result.state.money).toBe(36);
  });

  it('buys a voucher once and applies its effect', () => {
    const run = shopRun();
    const modified: RunState = {
      ...run,
      offers: [{ kind: 'voucher', voucher: 'extraHand', price: 8 }, null, null],
    };
    const result = buyOffer(modified, 0);
    expect(result.ok).toBe(true);
    expect(result.state.vouchers).toEqual(['extraHand']);
    const next = nextBlind(result.state);
    expect(next.ok).toBe(true);
    expect(next.state.handsLeft).toBe(5);
  });

  it("reprices the remaining shop when Patron's Mark is bought", () => {
    const run = shopRun();
    const modified: RunState = {
      ...run,
      offers: [
        { kind: 'voucher', voucher: 'patronsMark', price: 8 },
        { kind: 'joker', joker: 'understudy', price: 5 },
        null,
      ],
    };
    const result = buyOffer(modified, 0);
    expect(result.ok).toBe(true);
    expect(result.state.vouchers).toEqual(['patronsMark']);
    expect(result.state.offers[1]).toMatchObject({ price: 4 });
  });

  it('sells a joker for $3 and rerolls for $2', () => {
    const run = shopRun();
    const withJoker: RunState = { ...run, jokers: ['understudy'] };
    const sold = sellJoker(withJoker, 0);
    expect(sold.ok).toBe(true);
    expect(sold.state.jokers).toHaveLength(0);
    expect(sold.state.money).toBe(43);
    const rerolled = rerollShop(run);
    expect(rerolled.ok).toBe(true);
    expect(rerolled.state.money).toBe(38);
    expect(rerolled.state.shopRoll).toBe(1);
  });

  it('refuses purchases without enough money', () => {
    const run = { ...shopRun(), money: 1 };
    const modified: RunState = {
      ...run,
      offers: [{ kind: 'joker', joker: 'understudy', price: 5 }, null, null],
    };
    expect(buyOffer(modified, 0).error).toBe('not-enough-money');
  });
});

describe('competitive heart comparison', () => {
  it('removes one heart from the unique lowest score', () => {
    const outcome = compareBlind([0, 1, 2], [100, 50, 75], [3, 3, 3]);
    expect(outcome.lowestScore).toBe(50);
    expect(outcome.lowest).toEqual([1]);
    expect(outcome.losses).toEqual([1]);
    expect(outcome.hearts).toEqual([3, 2, 3]);
    expect(outcome.eliminated).toEqual([]);
  });

  it('is safe when the lowest score is tied', () => {
    const outcome = compareBlind([0, 1, 2], [50, 50, 80], [3, 3, 3]);
    expect(outcome.tiedLowest).toBe(true);
    expect(outcome.losses).toEqual([]);
    expect(outcome.hearts).toEqual([3, 3, 3]);
    expect(outcome.winner).toBeNull();
  });

  it('eliminates a player at zero hearts and finds the winner', () => {
    const outcome = compareBlind([0, 1, 2], [10, 20, 30], [1, 3, 3]);
    expect(outcome.losses).toEqual([0]);
    expect(outcome.hearts[0]).toBe(0);
    expect(outcome.eliminated).toEqual([0]);
    expect(outcome.activeAfter).toEqual([1, 2]);
    expect(outcome.winner).toBeNull();
  });

  it('declares the last standing player', () => {
    const outcome = compareBlind([0, 1], [10, 20], [1, 2]);
    expect(outcome.hearts).toEqual([0, 2]);
    expect(outcome.activeAfter).toEqual([1]);
    expect(outcome.winner).toBe(1);
  });

  it('handles four players and ignores eliminated seats', () => {
    const outcome = compareBlind([1, 2, 3], [0, 100, 100, 0], [0, 2, 3, 0]);
    expect(outcome.lowest).toEqual([1, 2]);
    expect(outcome.tiedLowest).toBe(true);
    expect(outcome.losses).toEqual([]);
    expect(outcome.activeAfter).toEqual([1, 2]);
  });

  it('chooses a final fallback by hearts, then total score, then seat', () => {
    expect(fallbackWinner([0, 1, 2], [2, 1, 3], [100, 900, 50])).toBe(2);
    expect(fallbackWinner([0, 1, 2], [2, 2, 1], [100, 900, 500])).toBe(1);
    expect(fallbackWinner([0, 1, 2], [2, 2, 1], [500, 500, 100])).toBe(0);
    expect(fallbackWinner([0, 1], [0, 0], [1, 2])).toBeNull();
  });
});

describe('AI levels and hints', () => {
  it('returns a legal play for every level', () => {
    const run = makeTestRun(999);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const action = chooseAction(run, level, () => 0.4);
      expect(action).not.toBeNull();
      expect(action?.cards.length).toBeGreaterThan(0);
      expect(action?.cards.length).toBeLessThanOrEqual(5);
      expect(action?.cards.every((id) => run.hand.some((item) => item.id === id))).toBe(true);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const run = makeTestRun(999);
    let seed = 12;
    const rngA = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    seed = 12;
    const rngB = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    expect(chooseAction(run, 'hard', rngA)).toEqual(chooseAction(run, 'hard', rngB));
  });

  it('takes more risk at one heart', () => {
    const base = makeTestRun(999);
    const best = bestPlayFor(base);
    if (!best) throw new Error('no best play');
    const target = Math.max(1, Math.floor(best.score.total / 0.3));
    const run: RunState = {
      ...base,
      plan: [{ ...base.plan[0], target }],
      handsLeft: 3,
      discardsLeft: 2,
    };
    expect(chooseAction(run, 'hard', () => 0.5, 0)?.type).toBe('play');
    expect(chooseAction(run, 'hard', () => 0.5, 1)?.type).toBe('discard');
  });

  it('finishes a complete blind on all four levels', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const run = createRun({ seed: 5000, deckId: 'ivory' });
      const result = autoPlayBlind(run, level, () => 0.55);
      expect(result.phase === 'cleared' || result.phase === 'failed').toBe(true);
    }
  });

  it('best play matches the preview and the hint carries a reason', () => {
    const run = makeTestRun(999);
    const best = bestPlayFor(run);
    expect(best).not.toBeNull();
    if (!best) return;
    expect(previewScore(run, best.cards.map((item) => item.id))?.total).toBe(best.score.total);
    const hint = hintFor(run);
    expect(hint).not.toBeNull();
    expect(hint?.cards.length).toBeGreaterThan(0);
    expect(hint?.chips).toBeGreaterThan(0);
    expect(hint?.mult).toBeGreaterThan(0);
    expect(typeof hint?.clears).toBe('boolean');
  });

  it('buys from the shop with discipline and leaves in the shop phase', () => {
    const run = makeTestRun(1);
    const cleared = playCards(run, [run.hand[0].id]).state;
    const shop = enterShop(cleared);
    if (!shop.ok) throw new Error('shop did not open');
    const rich = { ...shop.state, money: 30 };
    const result = autoShop(rich, 'hard', () => 0.5);
    expect(result.phase).toBe('shop');
    expect(result.money).toBeLessThanOrEqual(rich.money);
  });
});
