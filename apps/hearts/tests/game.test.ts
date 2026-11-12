import { describe, expect, it } from 'vitest';
import { chooseMove, choosePass, seededRng } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  QUEEN_SPADES,
  TWO_CLUBS,
  cardId,
  cardPoints,
  legalCards,
  nextHand,
  passCards,
  passDirectionFor,
  passTarget,
  playCard,
  setup,
  view,
  type Card,
  type GameState,
  type Suit,
} from '../src/game/hearts';

const card = (suit: Suit, rank: number): Card => cardId(suit, rank);
const hand = (...cards: Card[]): Card[] => cards;

function blank(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    handNumber: 1,
    passDirection: 'hold',
    hands: [[], [], [], []],
    passSelections: [null, null, null, null],
    turn: 0,
    leader: 0,
    trick: [],
    lastTrick: [],
    lastTrickWinner: null,
    heartsBroken: false,
    scores: [0, 0, 0, 0],
    handPoints: [0, 0, 0, 0],
    playedCards: [],
    voids: [0, 1, 2, 3].map(() => [false, false, false, false]),
    trickNumber: 1,
    firstTrick: false,
    mustLeadTwoClubs: false,
    moonShooter: null,
    handSummary: null,
    winners: [],
    ...overrides,
  };
}

function completePasses(state: GameState, picks?: (Card[] | undefined)[]): GameState {
  let current = state;
  for (let seat = 0; seat < 4; seat += 1) {
    const pick = picks?.[seat] ?? current.hands[seat].slice(0, 3);
    const result = passCards(current, seat, pick);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

function playUntilNotPlaying(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (current.phase === 'playing' && guard < 60) {
    guard += 1;
    const legal = legalCards(current, current.turn);
    expect(legal.length).toBeGreaterThan(0);
    const result = playCard(current, current.turn, legal[0]);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

function autoPass(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (current.phase === 'passing' && guard < 8) {
    guard += 1;
    const seat = current.passSelections.findIndex((pick) => pick === null);
    const pick = choosePass(current, seat, 'normal', seededRng(100 + current.handNumber * 10 + seat));
    const result = passCards(current, seat, pick);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

describe('Hearts deck and passing', () => {
  it('deals 52 unique cards, 13 to each seat', () => {
    const state = setup(seededRng(1));
    const cards = state.hands.flat();
    expect(cards).toHaveLength(52);
    expect(new Set(cards).size).toBe(52);
    expect(state.hands.map((item) => item.length)).toEqual([13, 13, 13, 13]);
    expect(state.phase).toBe('passing');
    expect(state.passDirection).toBe('left');
  });

  it('rotates pass direction left, right, across, hold', () => {
    expect(passDirectionFor(1)).toBe('left');
    expect(passDirectionFor(2)).toBe('right');
    expect(passDirectionFor(3)).toBe('across');
    expect(passDirectionFor(4)).toBe('hold');
    expect(passDirectionFor(5)).toBe('left');
    expect(passTarget(0, 'left')).toBe(1);
    expect(passTarget(0, 'right')).toBe(3);
    expect(passTarget(0, 'across')).toBe(2);
    expect(passTarget(2, 'across')).toBe(0);
    expect(passTarget(2, 'hold')).toBe(2);
  });

  it('records a pass only after exactly three cards from the hand', () => {
    const state = setup(seededRng(2));
    const first = state.hands[0];
    expect(passCards(state, 0, first.slice(0, 2)).error).toBe('bad-pass');
    expect(passCards(state, 0, [first[0], first[0], first[1]]).error).toBe('bad-pass');
    expect(passCards(state, 0, [first[0], first[1], 51]).error).toBe('not-in-hand');
    const ok = passCards(state, 0, first.slice(0, 3));
    expect(ok.ok).toBe(true);
    expect(ok.state.passSelections[0]).toEqual(first.slice(0, 3));
    expect(passCards(ok.state, 0, first.slice(3, 6)).error).toBe('already-passed');
  });

  it('passes left, keeps 13 cards and gives the two of clubs the first lead', () => {
    const state = setup(seededRng(3));
    const chosen = state.hands[0].slice(0, 3);
    const playing = completePasses(state, [chosen]);
    expect(playing.phase).toBe('playing');
    expect(playing.hands.every((item) => item.length === 13)).toBe(true);
    for (const picked of chosen) expect(playing.hands[1]).toContain(picked);
    const leader = playing.hands.findIndex((item) => item.includes(TWO_CLUBS));
    expect(playing.turn).toBe(leader);
    expect(legalCards(playing, leader)).toEqual([TWO_CLUBS]);
  });

  it('passes across for the third hand', () => {
    const state = setup(seededRng(4), { handNumber: 3 });
    expect(state.passDirection).toBe('across');
    const chosen = state.hands[2].slice(0, 3);
    const playing = completePasses(state, [undefined, undefined, chosen]);
    for (const picked of chosen) expect(playing.hands[0]).toContain(picked);
  });

  it('starts a hold hand directly in play with the previous winner leading', () => {
    const state = setup(seededRng(5), { handNumber: 4, lastTrickWinner: 2 });
    expect(state.phase).toBe('playing');
    expect(state.passDirection).toBe('hold');
    expect(state.turn).toBe(2);
    expect(state.mustLeadTwoClubs).toBe(false);
  });
});

describe('Hearts trick rules', () => {
  it('forces the two of clubs on the first lead of the first hand', () => {
    const state = setup(seededRng(6));
    const playing = completePasses(state);
    const leader = playing.turn;
    const wrong = playing.hands[leader].find((item) => item !== TWO_CLUBS) as Card;
    expect(playCard(playing, leader, wrong).error).toBe('illegal');
    const lead = playCard(playing, leader, TWO_CLUBS);
    expect(lead.ok).toBe(true);
  });

  it('requires following the led suit', () => {
    const state = blank({
      hands: [hand(card('clubs', 3), card('hearts', 5)), [], [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(legalCards(state, 0)).toEqual([card('clubs', 3)]);
    expect(playCard(state, 0, card('hearts', 5)).error).toBe('illegal');
    expect(playCard(state, 0, card('clubs', 3)).ok).toBe(true);
  });

  it('allows any discard when void in the led suit', () => {
    const state = blank({
      hands: [hand(card('hearts', 5), card('diamonds', 3)), [], [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(legalCards(state, 0).sort()).toEqual([card('diamonds', 3), card('hearts', 5)].sort());
  });

  it('marks a public void when a player discards off-suit', () => {
    const state = blank({
      hands: [[], [], [], hand(card('hearts', 5))],
      turn: 3,
      trick: [
        { seat: 0, card: card('clubs', 2) },
        { seat: 1, card: card('clubs', 3) },
        { seat: 2, card: card('clubs', 4) },
      ],
    });
    const result = playCard(state, 3, card('hearts', 5));
    expect(result.ok).toBe(true);
    expect(result.state.voids[3][0]).toBe(true);
    expect(result.state.handPoints[2]).toBe(1);
  });

  it('forbids hearts and the queen of spades on the first trick', () => {
    const state = blank({
      firstTrick: true,
      hands: [hand(card('hearts', 5), QUEEN_SPADES, card('diamonds', 3)), [], [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(legalCards(state, 0)).toEqual([card('diamonds', 3)]);

    const forced = blank({
      firstTrick: true,
      hands: [hand(card('hearts', 5), QUEEN_SPADES), [], [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(legalCards(forced, 0).sort()).toEqual([card('hearts', 5), QUEEN_SPADES].sort());
  });

  it('does not allow leading hearts until they are broken', () => {
    const closed = blank({ hands: [hand(card('hearts', 5), card('clubs', 3)), [], [], []] });
    expect(legalCards(closed, 0)).toEqual([card('clubs', 3)]);
    const onlyHearts = blank({ hands: [hand(card('hearts', 5)), [], [], []] });
    expect(legalCards(onlyHearts, 0)).toEqual([card('hearts', 5)]);
    const open = blank({
      heartsBroken: true,
      hands: [hand(card('hearts', 5), card('clubs', 3)), [], [], []],
    });
    expect(legalCards(open, 0)).toHaveLength(2);
  });

  it('keeps the queen of spades out of the first trick while another spade can follow', () => {
    const leading = blank({
      firstTrick: true,
      hands: [hand(QUEEN_SPADES, card('clubs', 3)), [], [], []],
    });
    expect(legalCards(leading, 0)).toEqual([card('clubs', 3)]);

    const following = blank({
      firstTrick: true,
      hands: [hand(QUEEN_SPADES, card('spades', 3)), [], [], []],
      trick: [{ seat: 3, card: card('spades', 2) }],
    });
    expect(legalCards(following, 0)).toEqual([card('spades', 3)]);
    const forced = blank({
      firstTrick: true,
      hands: [hand(QUEEN_SPADES), [], [], []],
      trick: [{ seat: 3, card: card('spades', 2) }],
    });
    expect(legalCards(forced, 0)).toEqual([QUEEN_SPADES]);
  });

  it('lets point cards be discarded once the first trick is over', () => {
    const state = blank({
      firstTrick: false,
      hands: [hand(card('hearts', 5), QUEEN_SPADES), [], [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(legalCards(state, 0).sort()).toEqual([card('hearts', 5), QUEEN_SPADES].sort());
  });

  it('awards the trick to the highest card of the led suit only', () => {
    const state = blank({
      hands: [[], [], [], hand(card('clubs', 7))],
      turn: 3,
      trick: [
        { seat: 0, card: card('clubs', 3) },
        { seat: 1, card: card('clubs', 10) },
        { seat: 2, card: card('hearts', 14) },
      ],
    });
    const result = playCard(state, 3, card('clubs', 7));
    expect(result.ok).toBe(true);
    expect(result.state.lastTrickWinner).toBe(1);
    expect(result.state.turn).toBe(1);
    expect(result.state.trick).toEqual([]);
    expect(result.state.trickNumber).toBe(2);
  });

  it('scores one point for each heart taken', () => {
    const state = blank({
      hands: [[], [], [], hand(card('clubs', 7))],
      turn: 3,
      trick: [
        { seat: 0, card: card('clubs', 3) },
        { seat: 1, card: card('hearts', 9) },
        { seat: 2, card: card('hearts', 2) },
      ],
    });
    const result = playCard(state, 3, card('clubs', 7));
    expect(result.state.handPoints).toEqual([0, 0, 0, 2]);
  });

  it('scores thirteen for the queen of spades and keeps it with the trick winner', () => {
    const state = blank({
      hands: [hand(card('spades', 2)), hand(card('spades', 3)), hand(QUEEN_SPADES), hand(card('spades', 4))],
      trickNumber: 12,
      turn: 0,
    });
    let current = state;
    for (let index = 0; index < 4; index += 1) {
      const result = playCard(current, current.turn, legalCards(current, current.turn)[0]);
      expect(result.ok).toBe(true);
      current = result.state;
    }
    expect(current.phase).toBe('hand-over');
    expect(current.handPoints[2]).toBe(13);
    expect(current.handSummary?.points[2]).toBe(13);
  });

  it('completes a hand after thirteen tricks and carries scores into the next hand', () => {
    let state = blank({
      hands: [hand(card('clubs', 2)), hand(card('clubs', 3)), hand(card('clubs', 4)), hand(card('clubs', 5))],
      scores: [10, 20, 30, 40],
      trickNumber: 12,
      turn: 0,
    });
    state = playUntilNotPlaying(state);
    expect(state.phase).toBe('hand-over');
    expect(state.scores).toEqual([10, 20, 30, 40]);
    expect(state.handSummary).not.toBeNull();
    const next = nextHand(state, seededRng(7));
    expect(next.phase).toBe('passing');
    expect(next.handNumber).toBe(2);
    expect(next.passDirection).toBe('right');
    expect(next.scores).toEqual([10, 20, 30, 40]);
  });
});

describe('Hearts scoring and the moon', () => {
  it('moves all 26 points when one seat shoots the moon', () => {
    let state = blank({
      hands: [hand(card('hearts', 2)), hand(card('clubs', 3)), hand(card('clubs', 4)), hand(card('clubs', 5))],
      handPoints: [25, 0, 0, 0],
      heartsBroken: true,
      trickNumber: 12,
      turn: 0,
      scores: [4, 12, 7, 30],
    });
    state = playUntilNotPlaying(state);
    expect(state.phase).toBe('hand-over');
    expect(state.moonShooter).toBe(0);
    expect(state.handPoints).toEqual([0, 26, 26, 26]);
    expect(state.scores).toEqual([4, 38, 33, 56]);
    expect(state.handSummary?.moon).toBe(0);
  });

  it('ends the game at 100 and picks the lowest total', () => {
    let state = blank({
      hands: [hand(card('hearts', 2)), hand(card('clubs', 3)), hand(card('clubs', 4)), hand(card('clubs', 5))],
      scores: [99, 80, 70, 60],
      heartsBroken: true,
      trickNumber: 12,
      turn: 0,
    });
    state = playUntilNotPlaying(state);
    expect(state.phase).toBe('game-over');
    expect(state.scores[0]).toBe(100);
    expect(state.winners).toEqual([3]);
  });

  it('lists every tied lowest seat as a winner', () => {
    let state = blank({
      hands: [hand(card('hearts', 2)), hand(card('clubs', 3)), hand(card('clubs', 4)), hand(card('clubs', 5))],
      scores: [100, 90, 90, 90],
      heartsBroken: true,
      trickNumber: 12,
      turn: 0,
    });
    state = playUntilNotPlaying(state);
    expect(state.phase).toBe('game-over');
    expect(state.winners).toEqual([1, 2, 3]);
  });

  it('scores cards correctly', () => {
    expect(cardPoints(card('hearts', 2))).toBe(1);
    expect(cardPoints(QUEEN_SPADES)).toBe(13);
    expect(cardPoints(card('spades', 14))).toBe(0);
    expect(cardPoints(card('diamonds', 5))).toBe(0);
  });
});

describe('Hearts privacy views', () => {
  it('shows a seat only its own hand and public counts', () => {
    const state = setup(seededRng(8));
    const first = view(state, 0);
    const second = view(state, 1);
    expect(first.hand).toEqual(state.hands[0]);
    expect(first.hand).not.toEqual(state.hands[1]);
    expect(first.handCounts).toEqual([13, 13, 13, 13]);
    expect(first.voids).toHaveLength(4);
    expect(first.playedCards).toEqual([]);
    expect(second.hand).toEqual(state.hands[1]);
    expect(first.canPass).toBe(true);
    expect(second.canPass).toBe(true);
    expect(first.canAct).toBe(false);
  });

  it('updates canAct and legal cards only for the seat to move', () => {
    const playing = completePasses(setup(seededRng(9)));
    const leader = playing.turn;
    const leaderView = view(playing, leader);
    expect(leaderView.canAct).toBe(true);
    expect(leaderView.legal).toEqual([TWO_CLUBS]);
    const other = view(playing, (leader + 1) % 4);
    expect(other.canAct).toBe(false);
    expect(other.legal).toEqual([]);
  });

  it('rejects a move from the wrong seat, a card outside the hand and an illegal card', () => {
    const state = blank({
      hands: [hand(card('clubs', 3), card('hearts', 4)), hand(card('clubs', 5)), [], []],
      trick: [{ seat: 3, card: card('clubs', 2) }],
    });
    expect(playCard(state, 1, card('clubs', 5)).error).toBe('wrong-turn');
    expect(playCard(state, 0, card('spades', 9)).error).toBe('not-in-hand');
    expect(playCard(state, 0, card('hearts', 4)).error).toBe('illegal');
  });

  it('rejects passing after the pass phase is over', () => {
    const state = completePasses(setup(seededRng(10)));
    expect(passCards(state, 0, state.hands[0].slice(0, 3)).error).toBe('phase');
  });
});

describe('Hearts AI and hints', () => {
  it('only returns legal cards at every level', () => {
    const state = completePasses(setup(seededRng(11)));
    const seat = state.turn;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, seat, level, seededRng(3));
      expect(legalCards(state, seat)).toContain(move);
    }
  });

  it('passes exactly three cards from its own hand at every level', () => {
    const state = setup(seededRng(12));
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const pick = choosePass(state, 0, level, seededRng(5));
      expect(pick).toHaveLength(3);
      expect(new Set(pick).size).toBe(3);
      for (const item of pick) expect(state.hands[0]).toContain(item);
    }
  });

  it('is deterministic for the same state and RNG seed', () => {
    const state = completePasses(setup(seededRng(13)));
    const seat = state.turn;
    const a = chooseMove(state, seat, 'hard', seededRng(99));
    const b = chooseMove(state, seat, 'hard', seededRng(99));
    expect(a).toBe(b);
  });

  it('returns a legal hint and a pass hint', () => {
    const passing = setup(seededRng(14));
    const passHint = hintFor(passing, 0);
    expect(passHint?.kind).toBe('pass');
    expect(passHint?.cards).toHaveLength(3);

    const playing = completePasses(setup(seededRng(15)));
    const moveHint = hintFor(playing, playing.turn);
    expect(moveHint?.card).toBeDefined();
    expect(legalCards(playing, playing.turn)).toContain(moveHint?.card);
  });

  it('finishes a full deal-driven game without a stuck state', () => {
    let state = setup(seededRng(2026));
    let guard = 0;
    while (state.phase !== 'game-over' && guard < 2000) {
      guard += 1;
      if (state.phase === 'passing') {
        state = autoPass(state);
      } else if (state.phase === 'playing') {
        const legal = legalCards(state, state.turn);
        const result = playCard(state, state.turn, legal[0]);
        expect(result.ok).toBe(true);
        state = result.state;
      } else if (state.phase === 'hand-over') {
        state = nextHand(state, seededRng(500 + guard));
      } else {
        break;
      }
    }
    expect(state.phase).toBe('game-over');
    expect(state.scores.some((score) => score >= 100)).toBe(true);
    expect(state.winners.length).toBeGreaterThan(0);
    expect(Math.min(...state.scores)).toBe(state.scores[state.winners[0]]);
  });

  it('never returns a move out of turn', () => {
    const state = completePasses(setup(seededRng(16)));
    const notTurn = (state.turn + 1) % 4;
    expect(chooseMove(state, notTurn, 'hard', seededRng(1))).toBe(-1);
  });
});
