import { describe, expect, it } from 'vitest';
import {
  act,
  canPlayCard,
  cardPoints,
  COLORS,
  drawAvailable,
  fullDeck,
  handPoints,
  legalCards,
  legalMoves,
  nextRound,
  nextSeat,
  ranking,
  setup,
  shuffle,
  topCard,
  view,
  type Card,
  type CardKind,
  type Color,
  type GameState,
  type Move,
} from '../src/game/color-chain';
import { mulberry32 } from '../src/game/rng';

function take(deck: Card[], match: (card: Card) => boolean): Card {
  const index = deck.findIndex(match);
  if (index < 0) throw new Error('test deck ran out');
  return deck.splice(index, 1)[0];
}

function cardOf(deck: Card[], color: Color, kind: CardKind, value: number | null = null): Card {
  return take(
    deck,
    (card) => card.color === color && card.kind === kind && (kind !== 'number' || card.value === value),
  );
}

function makeState(options: {
  hands: Card[][];
  top: Card;
  drawPile?: Card[];
  current?: Color;
  turn?: number;
  direction?: 1 | -1;
  scores?: number[];
  target?: number;
  status?: GameState['status'];
  drawnCardId?: string | null;
  firstSeat?: number;
  round?: number;
}): GameState {
  return {
    players: options.hands.map((hand, seat) => ({
      name: `P${seat + 1}`,
      hand,
      score: options.scores?.[seat] ?? 0,
      ai: null,
    })),
    turn: options.turn ?? 0,
    direction: options.direction ?? 1,
    current: options.current ?? (options.top.color as Color),
    drawPile: options.drawPile ?? [],
    discard: [options.top],
    status: options.status ?? 'playing',
    round: options.round ?? 1,
    roundWinner: null,
    roundPoints: null,
    matchWinners: [],
    targetScore: options.target ?? 200,
    drawnCardId: options.drawnCardId ?? null,
    events: [],
    firstSeat: options.firstSeat ?? 0,
  };
}

function seededGame(seed = 1, players = 2, target = 200) {
  return setup({
    players: Array.from({ length: players }, (_, seat) => ({ name: `P${seat + 1}`, ai: null })),
    rng: mulberry32(seed),
    targetScore: target,
  });
}

function randomMove(state: GameState, rng: () => number): Move {
  const cards = legalCards(state, state.turn);
  if (cards.length > 0) {
    const card = cards[Math.floor(rng() * cards.length)];
    return card.color === 'wild'
      ? { type: 'play', cardId: card.id, color: COLORS[Math.floor(rng() * COLORS.length)] }
      : { type: 'play', cardId: card.id };
  }
  if (!state.drawnCardId && drawAvailable(state)) return { type: 'draw' };
  return { type: 'pass' };
}

describe('deck and setup', () => {
  it('builds a unique 108-card deck with the right mix', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((card) => card.id)).size).toBe(108);
    expect(deck.filter((card) => card.kind === 'wild')).toHaveLength(4);
    expect(deck.filter((card) => card.kind === 'wild4')).toHaveLength(4);
    for (const color of COLORS) {
      const colorCards = deck.filter((card) => card.color === color);
      expect(colorCards).toHaveLength(25);
      expect(colorCards.filter((card) => card.kind === 'number' && card.value === 0)).toHaveLength(1);
      for (let value = 1; value <= 9; value++) {
        expect(
          colorCards.filter((card) => card.kind === 'number' && card.value === value),
        ).toHaveLength(2);
      }
      expect(colorCards.filter((card) => card.kind === 'skip')).toHaveLength(2);
      expect(colorCards.filter((card) => card.kind === 'reverse')).toHaveLength(2);
      expect(colorCards.filter((card) => card.kind === 'draw2')).toHaveLength(2);
    }
  });

  it('shuffles deterministically from an injected RNG', () => {
    const a = shuffle(fullDeck(), mulberry32(42)).map((card) => card.id);
    const b = shuffle(fullDeck(), mulberry32(42)).map((card) => card.id);
    const c = shuffle(fullDeck(), mulberry32(43)).map((card) => card.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('deals seven cards, a number opening card and the right first seat', () => {
    const state = seededGame(7, 4);
    expect(state.players.map((player) => player.hand.length)).toEqual([7, 7, 7, 7]);
    expect(state.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
    expect(state.discard).toHaveLength(1);
    expect(state.discard[0].kind).toBe('number');
    expect(state.current).toBe(state.discard[0].color);
    expect(state.drawPile).toHaveLength(108 - 28 - 1);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
  });

  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(seededGame(99, 5))).toBe(JSON.stringify(seededGame(99, 5)));
  });

  it('rejects impossible table sizes and bad targets', () => {
    const rng = () => 0.5;
    expect(() => setup({ players: [{ name: 'A', ai: null }], rng })).toThrow();
    expect(() =>
      setup({
        players: Array.from({ length: 7 }, (_, seat) => ({ name: `P${seat}`, ai: null })),
        rng,
      }),
    ).toThrow();
    expect(() =>
      setup({
        players: [
          { name: 'A', ai: null },
          { name: 'B', ai: null },
        ],
        rng,
        targetScore: 0,
      }),
    ).toThrow();
  });
});

describe('matching and effects', () => {
  it('matches colour, number and action symbol; wilds always fit', () => {
    const deck = fullDeck();
    const top = cardOf(deck, 'red', 'number', 7);
    const state = makeState({
      hands: [[], []],
      top,
      current: 'red',
      drawPile: deck,
    });
    expect(canPlayCard(state, cardOf(deck, 'red', 'number', 2))).toBe(true);
    expect(canPlayCard(state, cardOf(deck, 'blue', 'number', 7))).toBe(true);
    expect(canPlayCard(state, cardOf(deck, 'blue', 'number', 8))).toBe(false);
    expect(canPlayCard(state, take(deck, (card) => card.kind === 'wild'))).toBe(true);

    const skipTop = cardOf(deck, 'red', 'skip');
    const skipState = makeState({ hands: [[], []], top: skipTop, current: 'red', drawPile: deck });
    expect(canPlayCard(skipState, cardOf(deck, 'green', 'skip'))).toBe(true);
  });

  it('advances turn after a colour match', () => {
    const deck = fullDeck();
    const play = cardOf(deck, 'red', 'number', 4);
    const state = makeState({
      hands: [[play], [cardOf(deck, 'blue', 'number', 1)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const result = act(state, 0, { type: 'play', cardId: play.id }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(1);
    expect(result.state.current).toBe('red');
  });

  it('rejects a wrong seat, a missing card and an illegal card', () => {
    const deck = fullDeck();
    const play = cardOf(deck, 'blue', 'number', 4);
    const state = makeState({
      hands: [[play], [cardOf(deck, 'green', 'number', 2)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    expect(act(state, 1, { type: 'play', cardId: play.id }, mulberry32(1)).error).toBe('wrong-turn');
    expect(act(state, 0, { type: 'play', cardId: 'nope' }, mulberry32(1)).error).toBe('not-in-hand');
    expect(act(state, 0, { type: 'play', cardId: play.id }, mulberry32(1)).error).toBe('illegal-card');
  });

  it('requires a colour for a wild and sets the chain colour', () => {
    const deck = fullDeck();
    const wild = take(deck, (card) => card.kind === 'wild');
    const state = makeState({
      hands: [[wild], [cardOf(deck, 'blue', 'number', 1)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    expect(act(state, 0, { type: 'play', cardId: wild.id }, mulberry32(1)).error).toBe('color-required');
    const result = act(state, 0, { type: 'play', cardId: wild.id, color: 'green' }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(result.state.current).toBe('green');
    expect(result.state.events.some((event) => event.t === 'play' && event.color === 'green')).toBe(
      true,
    );
  });

  it('skips the next seat', () => {
    const deck = fullDeck();
    const skip = cardOf(deck, 'red', 'skip');
    const state = makeState({
      hands: [[skip], [cardOf(deck, 'blue', 'number', 1)], [cardOf(deck, 'green', 'number', 2)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const result = act(state, 0, { type: 'play', cardId: skip.id }, mulberry32(1));
    expect(result.state.turn).toBe(2);
    expect(result.state.events.some((event) => event.t === 'skip')).toBe(true);
  });

  it('reverses with four seats and acts as skip with two', () => {
    const deck = fullDeck();
    const reverse = cardOf(deck, 'red', 'reverse');
    const four = makeState({
      hands: [[reverse], [], [], []],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const reversed = act(four, 0, { type: 'play', cardId: reverse.id }, mulberry32(1));
    expect(reversed.state.direction).toBe(-1);
    expect(reversed.state.turn).toBe(3);

    const reverse2 = cardOf(deck, 'red', 'reverse');
    const two = makeState({
      hands: [[reverse2], []],
      top: cardOf(deck, 'red', 'number', 8),
      drawPile: deck,
    });
    const skipped = act(two, 0, { type: 'play', cardId: reverse2.id }, mulberry32(1));
    expect(skipped.state.direction).toBe(-1);
    expect(skipped.state.turn).toBe(0);
  });

  it('makes the next seat draw two and miss a turn', () => {
    const deck = fullDeck();
    const draw2 = cardOf(deck, 'red', 'draw2');
    const before = 2;
    const state = makeState({
      hands: [[draw2], [cardOf(deck, 'blue', 'number', 1), cardOf(deck, 'blue', 'number', 2)], []],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const result = act(state, 0, { type: 'play', cardId: draw2.id }, mulberry32(1));
    expect(result.state.players[1].hand).toHaveLength(before + 2);
    expect(result.state.turn).toBe(2);
    expect(result.state.events.some((event) => event.t === 'drawPenalty')).toBe(true);
  });

  it('makes the next seat draw four and sets the wild colour', () => {
    const deck = fullDeck();
    const wild4 = take(deck, (card) => card.kind === 'wild4');
    const state = makeState({
      hands: [[wild4], [cardOf(deck, 'blue', 'number', 1)], [cardOf(deck, 'green', 'number', 2)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const result = act(state, 0, { type: 'play', cardId: wild4.id, color: 'yellow' }, mulberry32(1));
    expect(result.state.players[1].hand).toHaveLength(5);
    expect(result.state.turn).toBe(2);
    expect(result.state.current).toBe('yellow');
  });
});

describe('drawing, passing and recycling', () => {
  it('draws one, keeps the turn, and only allows the drawn card next', () => {
    const deck = fullDeck();
    const held = cardOf(deck, 'blue', 'number', 2);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState({
      hands: [[held], [cardOf(deck, 'green', 'number', 3)]],
      top,
      drawPile: deck,
    });
    const drawn = act(state, 0, { type: 'draw' }, mulberry32(3));
    expect(drawn.ok).toBe(true);
    expect(drawn.state.players[0].hand).toHaveLength(2);
    expect(drawn.state.turn).toBe(0);
    expect(drawn.state.drawnCardId).not.toBeNull();
    const other = held;
    expect(act(drawn.state, 0, { type: 'play', cardId: other.id }, mulberry32(3)).error).toBe(
      'must-play-drawn',
    );
    const passed = act(drawn.state, 0, { type: 'pass' }, mulberry32(3));
    expect(passed.ok).toBe(true);
    expect(passed.state.turn).toBe(1);
    expect(passed.state.drawnCardId).toBeNull();
  });

  it('refuses to pass before drawing', () => {
    const deck = fullDeck();
    const state = makeState({
      hands: [[cardOf(deck, 'blue', 'number', 2)], [cardOf(deck, 'green', 'number', 3)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    expect(act(state, 0, { type: 'pass' }, mulberry32(1)).error).toBe('must-draw');
  });

  it('recycles the discard pile and keeps the top card', () => {
    const deck = fullDeck();
    const old = cardOf(deck, 'green', 'number', 4);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState({
      hands: [[], [cardOf(deck, 'blue', 'number', 1)]],
      top,
      drawPile: [old],
    });
    const first = act(state, 0, { type: 'draw' }, mulberry32(5));
    expect(first.ok).toBe(true);
    expect(first.state.drawPile).toHaveLength(0);
    expect(first.state.discard).toHaveLength(1);
    expect(topCard(first.state).id).toBe(top.id);
    expect(first.state.players[0].hand[0].id).toBe(old.id);
  });

  it('allows a pass when the table has no drawable cards', () => {
    const deck = fullDeck();
    const state = makeState({
      hands: [[cardOf(deck, 'blue', 'number', 2)], [cardOf(deck, 'green', 'number', 3)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: [],
    });
    const result = act(state, 0, { type: 'pass' }, mulberry32(1));
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(1);
  });
});

describe('scoring, rounds and views', () => {
  it('scores number, action and wild cards', () => {
    const deck = fullDeck();
    expect(cardPoints(cardOf(deck, 'red', 'number', 7))).toBe(7);
    expect(cardPoints(cardOf(deck, 'red', 'skip'))).toBe(20);
    expect(cardPoints(take(deck, (card) => card.kind === 'wild'))).toBe(50);
    expect(
      handPoints([
        cardOf(deck, 'red', 'number', 4),
        cardOf(deck, 'blue', 'draw2'),
        take(deck, (card) => card.kind === 'wild4'),
      ]),
    ).toBe(74);
  });

  it('ends the round, scores the leftovers and keeps the round winner', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 3);
    const left = [cardOf(deck, 'blue', 'number', 9), cardOf(deck, 'green', 'skip')];
    const state = makeState({
      hands: [[last], left],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
      scores: [40, 10],
    });
    const result = act(state, 0, { type: 'play', cardId: last.id }, mulberry32(1));
    expect(result.state.status).toBe('round-over');
    expect(result.state.roundWinner).toBe(0);
    expect(result.state.players.map((player) => player.score)).toEqual([40, 39]);
    expect(result.state.roundPoints).toEqual([0, 29]);
    expect(result.state.matchWinners).toEqual([]);
  });

  it('ends the match at the target and picks the lowest total', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 3);
    const state = makeState({
      hands: [[last], [cardOf(deck, 'blue', 'number', 9), cardOf(deck, 'green', 'skip')]],
      top: cardOf(deck, 'red', 'number', 8),
      drawPile: deck,
      scores: [100, 190],
      target: 200,
    });
    const result = act(state, 0, { type: 'play', cardId: last.id }, mulberry32(1));
    expect(result.state.status).toBe('match-over');
    expect(result.state.players.map((player) => player.score)).toEqual([100, 219]);
    expect(result.state.matchWinners).toEqual([0]);
  });

  it('lets tied lowest totals share the match', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 3);
    const state = makeState({
      hands: [
        [last],
        [cardOf(deck, 'blue', 'number', 9), cardOf(deck, 'green', 'number', 1)],
        [cardOf(deck, 'yellow', 'number', 7), cardOf(deck, 'green', 'number', 3)],
      ],
      top: cardOf(deck, 'red', 'number', 8),
      drawPile: deck,
      scores: [160, 100, 100],
      target: 150,
    });
    const result = act(state, 0, { type: 'play', cardId: last.id }, mulberry32(1));
    expect(result.state.status).toBe('match-over');
    expect(result.state.players.map((player) => player.score)).toEqual([160, 110, 110]);
    expect(result.state.matchWinners).toEqual([1, 2]);
  });

  it('rotates the first seat and carries scores into the next round', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 3);
    const state = makeState({
      hands: [[last], [cardOf(deck, 'blue', 'number', 9)]],
      top: cardOf(deck, 'red', 'number', 8),
      drawPile: deck,
      scores: [40, 20],
      firstSeat: 0,
      round: 2,
    });
    const ended = act(state, 0, { type: 'play', cardId: last.id }, mulberry32(2)).state;
    const next = nextRound(ended, mulberry32(3));
    expect(next.status).toBe('playing');
    expect(next.round).toBe(3);
    expect(next.firstSeat).toBe(1);
    expect(next.turn).toBe(1);
    expect(next.players.map((player) => player.score)).toEqual([40, 29]);
    expect(next.players.map((player) => player.hand.length)).toEqual([7, 7]);
  });

  it('does not start a next round while playing', () => {
    const state = seededGame(4, 2);
    expect(nextRound(state, mulberry32(1))).toBe(state);
  });

  it('gives each seat only its own hand in the view', () => {
    const deck = fullDeck();
    const own = cardOf(deck, 'red', 'number', 5);
    const secret = cardOf(deck, 'blue', 'number', 6);
    const state = makeState({
      hands: [[own], [secret]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const seat0 = view(state, 0);
    expect(seat0.hand.map((card) => card.id)).toEqual([own.id]);
    expect(seat0.players[1].handCount).toBe(1);
    expect(JSON.stringify(seat0)).not.toContain(secret.id);
    expect('drawPile' in seat0).toBe(false);
    expect(JSON.stringify(seat0)).not.toContain('"drawPile"');
  });

  it('reports canMove, canDraw, canPass and legal ids', () => {
    const deck = fullDeck();
    const play = cardOf(deck, 'red', 'number', 5);
    const state = makeState({
      hands: [[play, cardOf(deck, 'blue', 'number', 1)], [cardOf(deck, 'green', 'number', 2)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
    });
    const first = view(state, 0);
    expect(first.canMove).toBe(true);
    expect(first.canDraw).toBe(true);
    expect(first.canPass).toBe(false);
    expect(first.legalIds).toContain(play.id);
    expect(view(state, 1).canMove).toBe(false);
    const drawn = act(state, 0, { type: 'draw' }, mulberry32(1)).state;
    expect(view(drawn, 0).canDraw).toBe(false);
    expect(view(drawn, 0).canPass).toBe(true);
  });

  it('ranks the lowest score first and exposes legal moves for LAN', () => {
    const deck = fullDeck();
    const state = makeState({
      hands: [[cardOf(deck, 'red', 'number', 5)], [cardOf(deck, 'blue', 'number', 1)]],
      top: cardOf(deck, 'red', 'number', 9),
      drawPile: deck,
      scores: [80, 20],
    });
    expect(ranking(state)).toEqual([1, 0]);
    expect(legalMoves(state, 0).some((move) => move.type === 'play')).toBe(true);
    expect(legalMoves(state, 1)).toEqual([]);
  });
});

describe('whole games', () => {
  it('finishes random matches for 2–6 players without getting stuck', () => {
    for (let players = 2; players <= 6; players++) {
      const rng = mulberry32(players * 101 + 7);
      let state = seededGame(players * 13 + 1, players, 100);
      let guard = 0;
      while (state.status !== 'match-over' && guard < 3000) {
        guard += 1;
        if (state.status === 'round-over') {
          state = nextRound(state, rng);
          continue;
        }
        const move = randomMove(state, rng);
        const result = act(state, state.turn, move, rng);
        expect(result.ok, `seed ${players} error ${result.error} at ${guard}`).toBe(true);
        state = result.state;
      }
      expect(guard).toBeLessThan(3000);
      expect(state.status).toBe('match-over');
      expect(state.matchWinners.length).toBeGreaterThan(0);
    }
  });

  it('advances seats in the current direction', () => {
    const state = seededGame(1, 5);
    expect(nextSeat(state, 4, 1)).toBe(0);
    expect(nextSeat({ ...state, direction: -1 }, 0, 1)).toBe(4);
    expect(nextSeat({ ...state, direction: -1 }, 2, 2)).toBe(0);
  });
});
