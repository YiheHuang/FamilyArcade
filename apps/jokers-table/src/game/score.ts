/**
 * Chip / mult scoring. Pure arithmetic: the same cards, jokers and boss always
 * produce the same breakdown.
 */

import type { BossId, JokerId } from './content';
import {
  evaluateHand,
  isFace,
  rankChip,
  type Card,
  type HandEval,
  type HandType,
} from './cards';

export interface JokerLine {
  joker: JokerId;
  chips: number;
  mult: number;
  xmult: number;
}

export interface ScoreBreakdown {
  hand: HandEval;
  baseType: HandType;
  scored: Card[];
  debuffed: string[];
  baseChips: number;
  baseMult: number;
  cardChips: number;
  enhancementChips: number;
  enhancementMult: number;
  jokerChips: number;
  jokerMult: number;
  xMult: number;
  chips: number;
  mult: number;
  total: number;
  jokerLines: JokerLine[];
}

export interface ScoreInput {
  played: Card[];
  handRemaining: Card[];
  jokers: readonly JokerId[];
  boss: BossId | null;
  discardsLeft: number;
  discardsUsed: number;
}

function isDebuffed(card: Card, boss: BossId | null): boolean {
  if (boss === 'fog' && card.suit === 'H') return true;
  if (boss === 'paleWidow' && card.suit === 'S') return true;
  return false;
}

function isSphinxType(type: HandType): boolean {
  return type === 'straight' || type === 'flush' || type === 'straightFlush' || type === 'royalFlush';
}

export function scorePlayedCards(input: ScoreInput): ScoreBreakdown {
  const hand = evaluateHand(input.played);
  const scored = input.played.filter((card) => !isDebuffed(card, input.boss));
  const debuffed = input.played
    .filter((card) => isDebuffed(card, input.boss))
    .map((card) => card.id);

  const sphinx = input.boss === 'sphinx' && isSphinxType(hand.type);
  const baseType: HandType = sphinx ? 'high' : hand.type;
  const baseChips = sphinx ? 5 : hand.baseChips;
  const baseMult = sphinx ? 1 : hand.baseMult;

  let cardChips = 0;
  for (const card of scored) {
    if (input.boss === 'auditor' && isFace(card.rank)) continue;
    cardChips += rankChip(card.rank);
  }

  let enhancementChips = 0;
  let enhancementMult = 0;
  for (const card of scored) {
    if (card.enhance === 'gilt') {
      enhancementChips += 40;
    } else if (card.enhance === 'cinder') {
      enhancementMult += 3;
    } else if (card.enhance === 'bramble') {
      const sameSuit = scored.filter((other) => other.id !== card.id && other.suit === card.suit).length;
      enhancementMult += 2 * sameSuit;
    } else if (card.enhance === 'tally') {
      enhancementChips += 12 * scored.length;
    } else if (card.enhance === 'keystone') {
      enhancementMult += scored.length;
    }
  }

  const jokerLines: JokerLine[] = [];
  let jokerChips = 0;
  let jokerMult = 0;
  let xMult = 1;
  const activeJokers =
    input.boss === 'mirrorwright' ? input.jokers.slice(1) : input.jokers.slice();

  const add = (joker: JokerId, chips: number, mult: number, multiplier = 1): void => {
    if (chips === 0 && mult === 0 && multiplier === 1) return;
    jokerLines.push({ joker, chips, mult, xmult: multiplier });
    jokerChips += chips;
    jokerMult += mult;
    xMult *= multiplier;
  };

  const hearts = scored.filter((card) => card.suit === 'H').length;
  const spades = scored.filter((card) => card.suit === 'S').length;
  const aces = scored.filter((card) => card.rank === 'A').length;
  const enhanced = scored.filter((card) => card.enhance).length;
  const faceCards = input.played.filter((card) => isFace(card.rank)).length;
  const allSameSuit =
    scored.length >= 2 && scored.every((card) => card.suit === scored[0].suit);

  for (const joker of activeJokers) {
    switch (joker) {
      case 'understudy':
        add(joker, 30, 0);
        break;
      case 'velvet':
        add(joker, 0, 3);
        break;
      case 'compass':
        if (spades > 0) add(joker, 0, 4);
        break;
      case 'lantern':
        if (hearts > 0) add(joker, 18 * hearts, 0);
        break;
      case 'ledger':
        if (input.discardsLeft === 0) add(joker, 0, 3);
        break;
      case 'mirrors':
        if (hand.hasPair) add(joker, 35, 0);
        break;
      case 'orator':
        if (allSameSuit) add(joker, 0, 0, 1.5);
        break;
      case 'backstage':
        if (input.discardsLeft > 0) add(joker, 0, 2 * input.discardsLeft);
        break;
      case 'finch':
        if (input.played.length === 5) add(joker, 50, 0);
        break;
      case 'ember':
        if (input.played.length === 3) add(joker, 15, 1);
        break;
      case 'collector':
        add(joker, 0, input.jokers.length);
        break;
      case 'bust':
        if (faceCards === 0) add(joker, 55, 0);
        break;
      case 'thread':
        if (hand.hasStraight) add(joker, 0, 4);
        break;
      case 'inkwell':
        if (hand.hasFlush) add(joker, 0, 3);
        break;
      case 'sundial':
        if (aces > 0) add(joker, 20 * aces, 0);
        break;
      case 'cellar':
        if (hand.twoPairOrBetter) add(joker, 30, 0);
        break;
      case 'doorman':
        if (input.played.length === 1) add(joker, 0, 5);
        break;
      case 'candlewick':
        if (input.discardsUsed > 0) add(joker, 0, 2 * input.discardsUsed);
        break;
      case 'harmonica':
        add(joker, 10 * hand.distinctRanks, 0);
        break;
      case 'nightwatch':
        if (input.handRemaining.length === 2) add(joker, 45, 0);
        break;
      case 'alchemist':
        if (enhanced > 0) add(joker, 0, 2 * enhanced);
        break;
      case 'heir':
        if (hand.type === 'four' || hand.type === 'straightFlush' || hand.type === 'royalFlush') {
          add(joker, 0, 0, 3);
        }
        break;
      case 'treasurer':
      case 'patron':
        break;
    }
  }

  const chips = baseChips + cardChips + enhancementChips + jokerChips;
  const mult = Math.round((baseMult + enhancementMult + jokerMult) * xMult * 100) / 100;
  const total = Math.floor(chips * mult);

  return {
    hand,
    baseType,
    scored,
    debuffed,
    baseChips,
    baseMult,
    cardChips,
    enhancementChips,
    enhancementMult,
    jokerChips,
    jokerMult,
    xMult,
    chips,
    mult,
    total,
    jokerLines,
  };
}

/** Expected value of a random unused card, used only by AI heuristics. */
export function cardPotential(card: Card): number {
  return rankChip(card.rank) + (card.enhance ? 6 : 0);
}
