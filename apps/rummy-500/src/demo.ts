import {
  analyzeMeld,
  makeDeck,
  sortHand,
  type Card,
  type Drawn,
  type GameState,
  type Meld,
  type RoundReport,
} from './game/rummy-500';

function meld(id: number, owner: number, cards: Card[], by?: number[]): Meld {
  const analysis = analyzeMeld(cards);
  if (!analysis) throw new Error(`Demo meld is invalid: ${cards.join(' ')}`);
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

function remainingCards(melds: Meld[], hands: Card[][]): Card[] {
  const used = new Set<string>();
  for (const item of melds) for (const card of item.cards) used.add(card.card);
  for (const hand of hands) for (const card of hand) used.add(card);
  return makeDeck().filter((card) => !used.has(card));
}

function players(hands: Card[][], scores: number[]) {
  return hands.map((hand, seat) => ({
    name: '',
    hand: sortHand(hand),
    score: scores[seat] ?? 0,
  }));
}

export function demoState(kind: 'mid' | 'over' | 'mobile'): GameState {
  if (kind === 'mobile') {
    const melds = [
      meld(1, 0, ['7H', '8H', '9H', 'TH']),
      meld(2, 1, ['8C', '8D', '8S']),
    ];
    const hands = [
      ['AS', '2S', '3S', '6H', '6D', '6S', 'KC', 'JH'],
      ['7S', '7D', '7C', '2H', '4S', 'JD', 'AC'],
    ];
    const leftover = remainingCards(melds, hands);
    return {
      players: players(hands, [160, 120]),
      stock: leftover.slice(5),
      discard: leftover.slice(0, 5),
      melds,
      turn: 0,
      dealer: 1,
      phase: 'meld',
      round: 3,
      drawn: { card: 'JH', from: 'stock', taken: ['JH'] },
      mustMeld: null,
      report: null,
      winner: null,
      target: 500,
      version: 24,
    };
  }

  if (kind === 'over') {
    const melds = [
      meld(1, 0, ['7H', '8H', '9H', 'TH']),
      meld(2, 1, ['8C', '8D', '8S']),
      meld(3, 2, ['4C', '5C', '6C']),
      meld(4, 0, ['QS', 'QH', 'QD']),
      meld(5, 0, ['AS', '2S', '3S']),
    ];
    const hands = [[], ['KH', 'KD'], ['9D', '9C', '2C']];
    const leftover = remainingCards(melds, hands);
    const report: RoundReport = {
      melded: [70, 24, 15],
      deadwood: [0, 20, 20],
      scores: [70, 4, -5],
      totals: [512, 445, 398],
      reason: 'went-out',
      wentOut: 0,
      tie: false,
    };
    return {
      players: players(hands, [512, 445, 398]),
      stock: leftover.slice(10),
      discard: leftover.slice(0, 10),
      melds,
      turn: 0,
      dealer: 2,
      phase: 'game-over',
      round: 6,
      drawn: null,
      mustMeld: null,
      report,
      winner: 0,
      target: 500,
      version: 120,
    };
  }

  const melds = [
    meld(1, 0, ['7H', '8H', '9H', 'TH'], [0, 0, 0, 3]),
    meld(2, 1, ['8C', '8D', '8S']),
    meld(3, 2, ['4C', '5C', '6C']),
    meld(4, 3, ['QS', 'QH', 'QD']),
  ];
  const hands = [
    ['AS', '2S', '3S', '6H', '6D', '6S', 'KC', 'JH'],
    ['7S', '7D', '7C', '2H', '4S', 'JD', 'AC'],
    ['9S', '9C', 'KD', '2D', '3H', 'QC'],
    ['2C', '3D', '4D', '5D', '5H', '4H', 'TC'],
  ];
  const leftover = remainingCards(melds, hands);
  const drawn: Drawn = { card: 'JH', from: 'stock', taken: ['JH'] };
  return {
    players: players(hands, [180, 145, 120, 95]),
    stock: leftover.slice(6),
    discard: leftover.slice(0, 6),
    melds,
    turn: 0,
    dealer: 1,
    phase: 'meld',
    round: 4,
    drawn,
    mustMeld: null,
    report: null,
    winner: null,
    target: 500,
    version: 40,
  };
}
