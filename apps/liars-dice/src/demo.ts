import type { AiLevel } from './ai/ai';
import type { Bid, GameState, Reveal, Tendency } from './game/liars-dice';

export type DemoKind = 'game' | 'reveal' | 'gameover';

export interface DemoFixture {
  state: GameState;
  names: string[];
  level: AiLevel;
}

function tendency(partial: Partial<Tendency> = {}): Tendency {
  return {
    bids: 0,
    challenges: 0,
    challengeWins: 0,
    falseBids: 0,
    spots: 0,
    spotHits: 0,
    spotMisses: 0,
    ...partial,
  };
}

const GAME_DICE = [
  [1, 2, 2, 4, 5],
  [3, 3, 5, 6],
  [2, 4, 6],
  [4, 4],
];

const GAME_BIDS: Bid[] = [
  { seat: 0, quantity: 1, face: 2 },
  { seat: 1, quantity: 2, face: 2 },
  { seat: 2, quantity: 3, face: 4 },
  { seat: 3, quantity: 4, face: 4 },
];

const GAME_TENDENCIES = [
  tendency({ bids: 6, challenges: 2, challengeWins: 1, falseBids: 1 }),
  tendency({ bids: 8, challenges: 2, challengeWins: 1, falseBids: 2 }),
  tendency({ bids: 5, challenges: 1, challengeWins: 1, falseBids: 0 }),
  tendency({ bids: 9, challenges: 3, challengeWins: 1, falseBids: 3 }),
];

const REVEAL_DICE = [
  [1, 3, 5, 6],
  [3, 3, 4],
  [2, 2, 6],
  [1],
];

const REVEAL_BID: Bid = { seat: 1, quantity: 5, face: 3 };

const REVEAL: Reveal = {
  bid: REVEAL_BID,
  challenger: 0,
  kind: 'challenge',
  count: 5,
  bidTrue: true,
  callerWon: false,
  loser: 0,
  dice: REVEAL_DICE.map((dice) => dice.slice()),
  eliminated: false,
  round: 5,
};

const OVER_DICE = [
  [2, 4],
  [],
  [],
];

const OVER_BID: Bid = { seat: 1, quantity: 2, face: 5 };

const OVER_REVEAL: Reveal = {
  bid: OVER_BID,
  challenger: 0,
  kind: 'challenge',
  count: 1,
  bidTrue: false,
  callerWon: true,
  loser: 1,
  dice: [[2, 4], [5], []],
  eliminated: true,
  round: 7,
};

/** Deterministic, engine-shaped fixtures used only for screenshots and demos. */
export function demoFixture(kind: DemoKind): DemoFixture {
  const names = ['@you', '@ai1', '@ai2', '@ai3'];
  if (kind === 'reveal') {
    return {
      names,
      level: 'normal',
      state: {
        playerCount: 4,
        dice: REVEAL_DICE.map((dice, seat) =>
          seat === 0 ? dice.slice(0, 3) : dice.slice(),
        ),
        turn: -1,
        phase: 'reveal',
        round: 5,
        starter: 2,
        nextStarter: 0,
        currentBid: { ...REVEAL_BID },
        bids: [
          { seat: 0, quantity: 1, face: 1 },
          { seat: 1, quantity: 5, face: 3 },
        ],
        lastReveal: {
          ...REVEAL,
          bid: { ...REVEAL.bid },
          dice: REVEAL.dice.map((dice) => dice.slice()),
        },
        winner: null,
        outOrder: [],
        onesWild: true,
        spotOn: true,
        tendencies: GAME_TENDENCIES.map((item) => ({ ...item })),
        actions: 31,
      },
    };
  }
  if (kind === 'gameover') {
    return {
      names,
      level: 'normal',
      state: {
        playerCount: 3,
        dice: OVER_DICE.map((dice) => dice.slice()),
        turn: -1,
        phase: 'game-over',
        round: 7,
        starter: 1,
        nextStarter: 0,
        currentBid: { ...OVER_BID },
        bids: [
          { seat: 0, quantity: 1, face: 4 },
          { seat: 1, quantity: 2, face: 5 },
        ],
        lastReveal: {
          ...OVER_REVEAL,
          bid: { ...OVER_REVEAL.bid },
          dice: OVER_REVEAL.dice.map((dice) => dice.slice()),
        },
        winner: 0,
        outOrder: [2, 1],
        onesWild: true,
        spotOn: true,
        tendencies: GAME_TENDENCIES.slice(0, 3).map((item) => ({ ...item })),
        actions: 58,
      },
    };
  }
  return {
    names,
    level: 'normal',
    state: {
      playerCount: 4,
      dice: GAME_DICE.map((dice) => dice.slice()),
      turn: 0,
      phase: 'bidding',
      round: 4,
      starter: 0,
      nextStarter: 0,
      currentBid: { ...GAME_BIDS[GAME_BIDS.length - 1] },
      bids: GAME_BIDS.map((bid) => ({ ...bid })),
      lastReveal: null,
      winner: null,
      outOrder: [],
      onesWild: true,
      spotOn: true,
      tendencies: GAME_TENDENCIES.map((item) => ({ ...item })),
      actions: 24,
    },
  };
}
