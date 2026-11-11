import { describe, expect, it } from 'vitest';
import { chooseAction, hintFor } from '../src/ai/ai';
import {
  act,
  COLORS,
  fullDeck,
  setup,
  type Card,
  type CardKind,
  type Color,
  type GameState,
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

function makeState(
  hands: Card[][],
  top: Card,
  drawPile: Card[],
  scores: number[] = [],
): GameState {
  return {
    players: hands.map((hand, seat) => ({
      name: seat === 0 ? 'AI' : 'Child',
      hand,
      score: scores[seat] ?? 0,
      ai: seat === 0 ? 'companion' : null,
    })),
    turn: 0,
    direction: 1,
    current: top.color as Color,
    drawPile,
    discard: [top],
    status: 'playing',
    round: 1,
    roundWinner: null,
    roundPoints: null,
    matchWinners: [],
    targetScore: 200,
    drawnCardId: null,
    events: [],
    firstSeat: 0,
  };
}

describe('Color Chain AI', () => {
  it('returns a legal action on every level from a real deal', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const state = setup({
        players: [
          { name: 'AI', ai: level },
          { name: 'Human', ai: null },
          { name: 'Other', ai: null },
        ],
        rng: mulberry32(21),
        targetScore: 200,
      });
      const move = chooseAction(state, 0, level, mulberry32(7));
      const result = act(state, 0, move, mulberry32(8));
      expect(result.ok, `${level}: ${result.error}`).toBe(true);
    }
  });

  it('lets the Companion avoid a draw-two on a child with few cards', () => {
    const deck = fullDeck();
    const attack = cardOf(deck, 'red', 'draw2');
    const gentle = cardOf(deck, 'red', 'number', 5);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState(
      [
        [attack, gentle],
        [cardOf(deck, 'blue', 'number', 1), cardOf(deck, 'green', 'number', 2)],
      ],
      top,
      deck,
    );
    const move = chooseAction(state, 0, 'companion', mulberry32(3));
    expect(move).toEqual({ type: 'play', cardId: gentle.id });
  });

  it('lets the Companion draw instead of attacking when only a draw card fits', () => {
    const deck = fullDeck();
    const attack = cardOf(deck, 'red', 'draw2');
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState(
      [
        [attack],
        [cardOf(deck, 'blue', 'number', 1), cardOf(deck, 'green', 'number', 2)],
      ],
      top,
      deck,
    );
    const move = chooseAction(state, 0, 'companion', mulberry32(3));
    expect(move.type).toBe('draw');
  });

  it('takes an immediate win on Normal and Hard', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 4);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState(
      [
        [last],
        [cardOf(deck, 'blue', 'number', 1), cardOf(deck, 'green', 'number', 2)],
      ],
      top,
      deck,
    );
    expect(chooseAction(state, 0, 'normal', mulberry32(4))).toEqual({
      type: 'play',
      cardId: last.id,
    });
    expect(chooseAction(state, 0, 'hard', mulberry32(4))).toEqual({
      type: 'play',
      cardId: last.id,
    });
  });

  it('is deterministic with the same injected RNG', () => {
    const deck = fullDeck();
    const top = cardOf(deck, 'red', 'number', 7);
    const state = makeState(
      [
        [
          cardOf(deck, 'red', 'number', 2),
          cardOf(deck, 'red', 'skip'),
          cardOf(deck, 'blue', 'number', 7),
          cardOf(deck, 'green', 'reverse'),
        ],
        [cardOf(deck, 'yellow', 'number', 1), cardOf(deck, 'yellow', 'number', 2)],
        [cardOf(deck, 'green', 'number', 3), cardOf(deck, 'blue', 'number', 4)],
      ],
      top,
      deck,
    );
    const first = chooseAction(state, 0, 'hard', mulberry32(11));
    const second = chooseAction(state, 0, 'hard', mulberry32(11));
    expect(first).toEqual(second);
  });

  it('only allows the drawn card after a draw', () => {
    const deck = fullDeck();
    const drawn = cardOf(deck, 'red', 'number', 5);
    const held = cardOf(deck, 'blue', 'number', 2);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState([[drawn, held], [cardOf(deck, 'green', 'number', 3)]], top, deck);
    state.drawnCardId = drawn.id;
    const move = chooseAction(state, 0, 'normal', mulberry32(1));
    expect(move).toEqual({ type: 'play', cardId: drawn.id });
    const result = act(state, 0, move, mulberry32(1));
    expect(result.ok).toBe(true);
  });

  it('passes when the drawn card does not fit and no other card may be played', () => {
    const deck = fullDeck();
    const drawn = cardOf(deck, 'blue', 'number', 2);
    const held = cardOf(deck, 'red', 'number', 5);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState([[drawn, held], [cardOf(deck, 'green', 'number', 3)]], top, deck);
    state.drawnCardId = drawn.id;
    const move = chooseAction(state, 0, 'hard', mulberry32(1));
    expect(move).toEqual({ type: 'pass' });
  });

  it('explains a winning hint with a reason', () => {
    const deck = fullDeck();
    const last = cardOf(deck, 'red', 'number', 4);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState([[last], [cardOf(deck, 'blue', 'number', 1)]], top, deck);
    const hint = hintFor(state, 0, mulberry32(5));
    expect(hint.cardId).toBe(last.id);
    expect(hint.reason).toBe('finish');
    expect(act(state, 0, hint.move, mulberry32(5)).ok).toBe(true);
  });

  it('explains a draw hint', () => {
    const deck = fullDeck();
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState(
      [[cardOf(deck, 'blue', 'number', 1)], [cardOf(deck, 'green', 'number', 2)]],
      top,
      deck,
    );
    const hint = hintFor(state, 0, mulberry32(5));
    expect(hint.reason).toBe('draw');
    expect(hint.move.type).toBe('draw');
  });

  it('explains a colour-match hint', () => {
    const deck = fullDeck();
    const red = cardOf(deck, 'red', 'number', 4);
    const top = cardOf(deck, 'red', 'number', 9);
    const state = makeState(
      [
        [red, cardOf(deck, 'blue', 'number', 1)],
        [cardOf(deck, 'green', 'number', 2), cardOf(deck, 'yellow', 'number', 3)],
      ],
      top,
      deck,
    );
    const hint = hintFor(state, 0, mulberry32(5));
    expect(hint.cardId).toBe(red.id);
    expect(['matchColor', 'attack', 'wild', 'finish']).toContain(hint.reason);
  });

  it('is legal for all four levels across many deals', () => {
    for (let seed = 1; seed <= 4; seed++) {
      for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
        const state = setup({
          players: [
            { name: 'A', ai: level },
            { name: 'B', ai: null },
            { name: 'C', ai: null },
            { name: 'D', ai: null },
          ],
          rng: mulberry32(seed * 31),
          targetScore: 200,
        });
        const move = chooseAction(state, 0, level, mulberry32(seed * 17));
        const result = act(state, 0, move, mulberry32(seed * 19));
        expect(result.ok, `seed ${seed} ${level} ${result.error}`).toBe(true);
        expect(COLORS.length).toBe(4);
      }
    }
  });
});
