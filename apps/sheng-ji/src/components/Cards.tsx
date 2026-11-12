import type { CSSProperties } from 'react';
import {
  isJoker,
  isLevelCard,
  isTrump as cardIsTrump,
  literalPointValue,
  pointValue,
  type Card,
  type NormalRank,
  type TrumpSuit,
} from '../game/sheng-ji';
import { cardName, rankName, t, type Lang } from '../i18n';

const GLYPH: Record<'S' | 'H' | 'D' | 'C', string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export function suitGlyph(suit: 'S' | 'H' | 'D' | 'C'): string {
  return GLYPH[suit];
}

export function CardFace({
  card,
  lang,
  trump,
  levelRank,
  selected,
  hinted,
  legal,
  disabled,
  onClick,
  size = 'hand',
  index,
}: {
  card: Card;
  lang: Lang;
  trump?: TrumpSuit | null;
  levelRank?: NormalRank;
  selected?: boolean;
  hinted?: boolean;
  legal?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'hand' | 'trick' | 'hero' | 'mini';
  index?: number;
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const joker = isJoker(card);
  const level = levelRank ? isLevelCard(card, levelRank) : false;
  const isT = trump ? cardIsTrump(card, trump, levelRank ?? '2') : false;
  const points = pointValue(card);
  const blankPoint = literalPointValue(card) > 0 && points === 0;
  const classes = [
    'playing-card',
    red ? 'red' : 'black',
    joker ? 'joker' : '',
    joker && card.rank === 'SJ' ? 'joker-small' : '',
    level ? 'level' : '',
    isT ? 'trump' : '',
    `card-${size}`,
    selected ? 'selected' : '',
    hinted ? 'hint' : '',
    legal ? 'legal' : '',
    disabled ? 'disabled' : '',
    card.deck === 1 ? 'deck-b' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rankText = joker
    ? lang === 'zh'
      ? card.rank === 'BJ'
        ? '大王'
        : '小王'
      : card.rank === 'BJ'
        ? 'BJ'
        : 'SJ'
    : card.rank;
  const label = cardName(lang, card);
  const pointLabel = points > 0 ? `, ${points} ${t(lang, 'points')}` : blankPoint ? `, ${t(lang, 'deckCopy')}` : '';
  const aria = `${label}${level ? `, ${t(lang, 'levelCard')}` : ''}${isT ? `, ${t(lang, 'trumpShort')}` : ''}${pointLabel}`;
  const style = index !== undefined ? ({ '--i': index } as CSSProperties) : undefined;

  const body = (
    <>
      <span className="card-corner">
        <span className="card-rank">{rankText}</span>
        {!joker && <span className="card-suit">{suitGlyph(card.suit as 'S' | 'H' | 'D' | 'C')}</span>}
      </span>
      <span className={`card-pip ${joker ? 'joker-pip' : ''}`} aria-hidden="true">
        {joker ? (card.rank === 'BJ' ? '★' : '☆') : suitGlyph(card.suit as 'S' | 'H' | 'D' | 'C')}
      </span>
      {joker && (
        <span className="joker-word" aria-hidden="true">
          {lang === 'zh' ? (card.rank === 'BJ' ? '大王' : '小王') : card.rank === 'BJ' ? 'BIG' : 'SMALL'}
        </span>
      )}
      {points > 0 && <span className="point-badge">+{points}</span>}
      {blankPoint && <span className="point-badge blank">0</span>}
      {level && <span className="level-badge">★</span>}
      <span className="deck-mark" aria-hidden="true" />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        aria-label={aria}
        aria-pressed={selected ?? false}
        disabled={disabled}
        onClick={onClick}
        data-card={card.id}
        data-legal={legal ? 'true' : 'false'}
        data-selected={selected ? 'true' : 'false'}
        data-hinted={hinted ? 'true' : 'false'}
      >
        {body}
      </button>
    );
  }
  return (
    <span
      className={classes}
      style={style}
      role="img"
      aria-label={aria}
      data-card={card.id}
      data-legal={legal ? 'true' : 'false'}
    >
      {body}
    </span>
  );
}

export function CardBack({
  lang,
  size = 'hand',
  index,
}: {
  lang: Lang;
  size?: 'hand' | 'trick' | 'hero' | 'mini';
  index?: number;
}) {
  const style = index !== undefined ? ({ '--i': index } as CSSProperties) : undefined;
  return (
    <span
      className={`playing-card card-back card-${size}`}
      style={style}
      role="img"
      aria-label={t(lang, 'hiddenCard')}
    >
      <span className="back-lattice" aria-hidden="true" />
      <span className="back-mark" aria-hidden="true">
        ♠
      </span>
    </span>
  );
}

export function rankText(lang: Lang, rank: string): string {
  return rankName(lang, rank);
}
