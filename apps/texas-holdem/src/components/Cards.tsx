import type { CSSProperties } from 'react';
import { cardId, type Card, type Suit } from '../game/texas-holdem';
import { cardName, rankLabel, t, type Lang } from '../i18n';

const GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function suitGlyph(suit: Suit): string {
  return GLYPH[suit];
}

export function CardFace({
  card,
  lang,
  size = 'hole',
  className = '',
  selected = false,
}: {
  card: Card;
  lang: Lang;
  size?: 'board' | 'hole' | 'mini' | 'hero';
  className?: string;
  selected?: boolean;
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span
      className={`playing-card card-${size} ${red ? 'red' : 'black'} ${selected ? 'selected' : ''} ${className}`}
      role="img"
      aria-label={cardName(lang, card)}
      data-card-id={cardId(card)}
      data-testid="card"
    >
      <span className="pc-corner">
        <b>{rankLabel(lang, card.rank)}</b>
        <i>{GLYPH[card.suit]}</i>
      </span>
      <span className="pc-pip" aria-hidden="true">
        {GLYPH[card.suit]}
      </span>
      <span className="pc-corner pc-bottom" aria-hidden="true">
        <b>{rankLabel(lang, card.rank)}</b>
        <i>{GLYPH[card.suit]}</i>
      </span>
    </span>
  );
}

export function CardBack({
  lang,
  size = 'hole',
  className = '',
}: {
  lang: Lang;
  size?: 'board' | 'hole' | 'mini' | 'hero';
  className?: string;
}) {
  return (
    <span
      className={`playing-card card-back card-${size} ${className}`}
      role="img"
      aria-label={t(lang, 'hiddenCard')}
      data-testid="card-back"
    >
      <span className="back-frame" aria-hidden="true">
        <span>◆</span>
      </span>
    </span>
  );
}

export function CardRow({
  cards,
  lang,
  size = 'board',
  label,
  testId = 'board',
}: {
  cards: Card[];
  lang: Lang;
  size?: 'board' | 'hero' | 'mini';
  label?: string;
  testId?: string;
}) {
  const slots = size === 'board' ? 5 : Math.max(2, cards.length);
  return (
    <div
      className={`card-row card-row-${size}`}
      aria-label={label}
      data-testid={testId}
      data-card-count={cards.length}
    >
      {Array.from({ length: slots }, (_, index) => {
        const card = cards[index];
        if (card) return <CardFace key={cardId(card)} card={card} lang={lang} size={size} />;
        return <span key={`empty-${index}`} className={`card-slot card-${size}`} aria-hidden="true" />;
      })}
    </div>
  );
}

export function BestFive({
  cards,
  lang,
}: {
  cards: Card[];
  lang: Lang;
}) {
  return (
    <div className="best-five">
      {cards.map((card, index) => (
        <CardFace
          key={`${cardId(card)}-${index}`}
          card={card}
          lang={lang}
          size="mini"
        />
      ))}
    </div>
  );
}

export function StackFan({ lang, count = 5 }: { lang: Lang; count?: number }) {
  return (
    <div className="stack-fan" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="stack-fan-card"
          style={{ '--i': index, '--n': count } as CSSProperties}
        >
          <CardBack lang={lang} size="hero" />
        </span>
      ))}
    </div>
  );
}
