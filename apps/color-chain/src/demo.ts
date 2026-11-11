import {
  act,
  COLORS,
  drawAvailable,
  fullDeck,
  legalCards,
  setup,
  type AiLevel,
  type Card,
  type GameState,
} from './game/color-chain';
import { mulberry32 } from './game/rng';
import { AI_NAMES, t, type Lang } from './i18n';

export type DemoKind = 'table' | 'final' | 'wild';

const LEVELS: AiLevel[] = ['normal', 'easy', 'companion'];

function names(lang: Lang, count: number): string[] {
  return [t(lang, 'you'), ...AI_NAMES[lang].slice(0, Math.max(0, count - 1))];
}

function demoPlayers(lang: Lang, count = 4) {
  const list = names(lang, count);
  return list.map((name, seat) => ({
    name,
    ai: seat === 0 ? null : LEVELS[(seat - 1) % LEVELS.length],
  }));
}

function take(deck: Card[], match: (card: Card) => boolean): Card {
  const index = deck.findIndex(match);
  if (index < 0) throw new Error('demo deck ran out of cards');
  return deck.splice(index, 1)[0];
}

function playSome(state: GameState, rng: () => number, steps: number): GameState {
  let current = state;
  for (let step = 0; step < steps; step++) {
    if (current.status !== 'playing') break;
    const seat = current.turn;
    const cards = legalCards(current, seat);
    let move;
    if (cards.length > 0) {
      const card = cards[Math.floor(rng() * cards.length)];
      move = card.color === 'wild'
        ? { type: 'play' as const, cardId: card.id, color: COLORS[Math.floor(rng() * COLORS.length)] }
        : { type: 'play' as const, cardId: card.id };
    } else if (drawAvailable(current)) {
      move = { type: 'draw' as const };
    } else {
      move = { type: 'pass' as const };
    }
    const result = act(current, seat, move, rng);
    if (!result.ok) break;
    current = result.state;
  }
  return current;
}

function tableDemo(lang: Lang): GameState {
  for (let seed = 1; seed < 400; seed++) {
    const rng = mulberry32(seed * 7919 + 13);
    const start = setup({ players: demoPlayers(lang), rng, targetScore: 200 });
    let current = start;
    for (let step = 0; step < 70; step++) {
      if (current.status !== 'playing') break;
      current = playSome(current, rng, 1);
      if (
        current.status === 'playing' &&
        current.turn === 0 &&
        step >= 10 &&
        current.players[0].hand.length >= 6 &&
        current.players[0].hand.length <= 9 &&
        legalCards(current, 0).length >= 2 &&
        current.players.slice(1).every((player) => player.hand.length >= 3) &&
        current.drawPile.length > 32 &&
        current.discard.length >= 4 &&
        current.discard[current.discard.length - 1].color !== 'wild'
      ) {
        return {
          ...current,
          round: 3,
          players: current.players.map((player, seat) => ({
            ...player,
            score: [35, 80, 120, 55][seat] ?? player.score,
          })),
          events: current.events.filter((event) => event.t !== 'roundStart').slice(-10),
        };
      }
    }
  }
  // Almost impossible, but keep a playable fallback.
  return setup({ players: demoPlayers(lang), rng: mulberry32(1), targetScore: 200 });
}

function wildDemo(lang: Lang): GameState {
  const deck = fullDeck();
  const top = take(deck, (card) => card.kind === 'number' && card.color === 'red');
  const hand = [
    take(deck, (card) => card.kind === 'wild'),
    take(deck, (card) => card.kind === 'wild4'),
    take(deck, (card) => card.kind === 'number' && card.color === 'red' && card.value === 5),
    take(deck, (card) => card.kind === 'number' && card.color === 'blue' && card.value === 2),
    take(deck, (card) => card.kind === 'skip' && card.color === 'yellow'),
    take(deck, (card) => card.kind === 'reverse' && card.color === 'green'),
    take(deck, (card) => card.kind === 'draw2' && card.color === 'red'),
  ];
  const other = [
    take(deck, (card) => card.kind === 'number' && card.color === 'blue' && card.value === 7),
    take(deck, (card) => card.kind === 'number' && card.color === 'green' && card.value === 3),
    take(deck, (card) => card.kind === 'number' && card.color === 'yellow' && card.value === 9),
    take(deck, (card) => card.kind === 'skip' && card.color === 'red'),
    take(deck, (card) => card.kind === 'draw2' && card.color === 'blue'),
  ];
  return {
    players: [
      { name: t(lang, 'you'), hand, score: 45, ai: null },
      { name: AI_NAMES[lang][0], hand: other, score: 70, ai: 'normal' },
    ],
    turn: 0,
    direction: 1,
    current: 'red',
    drawPile: deck,
    discard: [top],
    status: 'playing',
    round: 2,
    roundWinner: null,
    roundPoints: null,
    matchWinners: [],
    targetScore: 200,
    drawnCardId: null,
    events: [{ t: 'roundStart', round: 2 }],
    firstSeat: 1,
  };
}

function finalDemo(lang: Lang): GameState {
  const deck = fullDeck();
  const top = take(deck, (card) => card.kind === 'number' && card.color === 'red' && card.value === 7);
  const winning = take(
    deck,
    (card) => card.kind === 'number' && card.color === 'red' && card.value === 9,
  );
  const one = [
    take(deck, (card) => card.kind === 'skip'),
    take(deck, (card) => card.kind === 'number' && card.value === 5),
    take(deck, (card) => card.kind === 'number' && card.value === 3),
    take(deck, (card) => card.kind === 'number' && card.value === 2),
  ];
  const two = [take(deck, (card) => card.kind === 'skip')];
  const three = [
    take(deck, (card) => card.kind === 'number' && card.value === 6),
    take(deck, (card) => card.kind === 'number' && card.value === 5),
    take(deck, (card) => card.kind === 'number' && card.value === 4),
  ];
  const state: GameState = {
    players: [
      { name: t(lang, 'you'), hand: [winning], score: 80, ai: null },
      { name: AI_NAMES[lang][0], hand: one, score: 170, ai: 'normal' },
      { name: AI_NAMES[lang][1], hand: two, score: 190, ai: 'easy' },
      { name: AI_NAMES[lang][2], hand: three, score: 100, ai: 'companion' },
    ],
    turn: 0,
    direction: 1,
    current: 'red',
    drawPile: deck,
    discard: [top],
    status: 'playing',
    round: 3,
    roundWinner: null,
    roundPoints: null,
    matchWinners: [],
    targetScore: 200,
    drawnCardId: null,
    events: [{ t: 'roundStart', round: 3 }],
    firstSeat: 2,
  };
  const result = act(state, 0, { type: 'play', cardId: winning.id }, mulberry32(9));
  return result.ok ? result.state : state;
}

export function buildDemo(kind: DemoKind, lang: Lang): GameState {
  if (kind === 'final') return finalDemo(lang);
  if (kind === 'wild') return wildDemo(lang);
  return tableDemo(lang);
}

export function demoFromUrl(): DemoKind | null {
  if (typeof location === 'undefined') return null;
  const value = new URLSearchParams(location.search).get('demo');
  if (value === 'table' || value === 'final' || value === 'wild') return value;
  return null;
}
