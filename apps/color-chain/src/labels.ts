import type { Card, Color, GameEvent } from './game/color-chain';
import type { HintReason } from './ai/ai';
import { t, type Lang, type MessageKey } from './i18n';

const COLOR_KEY: Record<Color, MessageKey> = {
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
};

const KIND_KEY: Record<Exclude<Card['kind'], 'number'>, MessageKey> = {
  skip: 'skip',
  reverse: 'reverse',
  draw2: 'draw2',
  wild: 'wild',
  wild4: 'wild4',
};

export function colorName(lang: Lang, color: Color): string {
  return t(lang, COLOR_KEY[color]);
}

export function cardName(lang: Lang, card: Card): string {
  if (card.kind === 'wild') return t(lang, 'wild');
  if (card.kind === 'wild4') return t(lang, 'wild4');
  if (card.kind === 'number') return `${colorName(lang, card.color as Color)} ${card.value ?? 0}`;
  return `${colorName(lang, card.color as Color)} · ${t(lang, KIND_KEY[card.kind])}`;
}

export function cardAria(lang: Lang, card: Card): string {
  return t(lang, 'cardAria', { name: cardName(lang, card) });
}

export function cardsText(lang: Lang, count: number): string {
  if (lang === 'en') return `${count} ${count === 1 ? 'card' : 'cards'}`;
  return t(lang, 'cardsLeft', { n: count });
}

export function levelName(lang: Lang, level: string): string {
  return t(lang, level as MessageKey);
}

export function eventText(
  lang: Lang,
  players: readonly { name: string }[],
  event: GameEvent,
): string {
  const name = (seat: number) => players[seat]?.name ?? '';
  const isYou = (seat: number) => name(seat) === t(lang, 'you');
  switch (event.t) {
    case 'play':
      if (event.color) {
        return t(lang, isYou(event.seat) ? 'youEventPlayWild' : 'eventPlayWild', {
          name: name(event.seat),
          color: colorName(lang, event.color),
        });
      }
      return t(lang, isYou(event.seat) ? 'youEventPlay' : 'eventPlay', {
        name: name(event.seat),
        card: cardName(lang, event.card),
      });
    case 'draw':
      return t(lang, isYou(event.seat) ? 'youEventDraw' : 'eventDraw', {
        name: name(event.seat),
      });
    case 'drawPenalty':
      if (isYou(event.seat)) {
        return t(lang, 'youEventDrawPenalty', {
          target: name(event.target),
          count: event.count,
        });
      }
      if (isYou(event.target)) {
        return t(lang, 'eventDrawPenaltyYou', {
          name: name(event.seat),
          count: event.count,
        });
      }
      return t(lang, 'eventDrawPenalty', {
        name: name(event.seat),
        target: name(event.target),
        count: event.count,
      });
    case 'skip':
      if (isYou(event.seat)) {
        return t(lang, 'youEventSkip', { target: name(event.target) });
      }
      if (isYou(event.target)) {
        return t(lang, 'eventSkipYou', { name: name(event.seat) });
      }
      return t(lang, 'eventSkip', { name: name(event.seat), target: name(event.target) });
    case 'reverse':
      return t(lang, isYou(event.seat) ? 'youEventReverse' : 'eventReverse', {
        name: name(event.seat),
      });
    case 'pass':
      return t(lang, isYou(event.seat) ? 'youEventPass' : 'eventPass', {
        name: name(event.seat),
      });
    case 'roundStart':
      return t(lang, 'eventRoundStart', { round: event.round });
    case 'roundEnd':
      return t(lang, isYou(event.winner) ? 'youEventRoundEnd' : 'eventRoundEnd', {
        name: name(event.winner),
      });
    case 'matchEnd':
      return t(lang, 'eventMatchEnd');
    default:
      return '';
  }
}

export function hintReasonText(lang: Lang, reason: HintReason): string {
  const map: Record<HintReason, MessageKey> = {
    finish: 'hintFinish',
    attack: 'hintAttack',
    wild: 'hintWild',
    matchColor: 'hintMatchColor',
    matchNumber: 'hintMatchNumber',
    matchSymbol: 'hintMatchSymbol',
    action: 'hintAction',
    draw: 'hintDraw',
    pass: 'hintPass',
  };
  return t(lang, map[reason]);
}
