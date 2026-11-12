import type { CSSProperties } from 'react';
import { cardName, enhancementName, t, type Lang } from '../i18n';
import type { Card, Suit } from '../game/cards';
import { ENHANCEMENT_BY_ID } from '../game/content';

const GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function suitGlyph(suit: Suit): string {
  return GLYPH[suit];
}

export function PlayingCard({
  card,
  lang,
  selected = false,
  hinted = false,
  disabled = false,
  onClick,
  index,
  total,
  size = 'hand',
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  hinted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
  total?: number;
  size?: 'hand' | 'preview' | 'mini';
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const classes = [
    'pcard',
    red ? 'red' : 'black',
    `pcard-${size}`,
    selected ? 'selected' : '',
    hinted ? 'hint' : '',
    disabled ? 'disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style =
    index !== undefined && total !== undefined
      ? ({ '--i': index, '--n': total, '--mid': (total - 1) / 2 } as CSSProperties)
      : undefined;
  const label = cardName(lang, card);
  const enhancement = card.enhance ? ENHANCEMENT_BY_ID[card.enhance] : null;

  const body = (
    <>
      <span className="pcard-corner">
        <span className="pcard-rank">{card.rank}</span>
        <span className="pcard-suit">{suitGlyph(card.suit)}</span>
      </span>
      <span className="pcard-center" aria-hidden="true">
        {suitGlyph(card.suit)}
      </span>
      {enhancement ? (
        <span className="pcard-enhance" title={enhancementName(lang, enhancement.id)}>
          {enhancement.glyph}
        </span>
      ) : null}
      <span className="pcard-corner bottom" aria-hidden="true">
        <span className="pcard-rank">{card.rank}</span>
        <span className="pcard-suit">{suitGlyph(card.suit)}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        data-testid="card"
        data-card-id={card.id}
        data-selected={selected ? 'true' : 'false'}
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
      aria-label={label}
      data-testid="card"
      data-card-id={card.id}
    >
      {body}
    </span>
  );
}

export function CardBack({ lang, size = 'hand' }: { lang: Lang; size?: 'hand' | 'mini' }) {
  return (
    <span className={`pcard back pcard-${size}`} role="img" aria-label={t(lang, 'hideHand')}>
      <span className="pcard-back-arch" aria-hidden="true">
        <span>✦</span>
      </span>
    </span>
  );
}

const FAN: Card[] = [
  { id: 'AS', suit: 'S', rank: 'A' },
  { id: 'KH', suit: 'H', rank: 'K' },
  { id: 'QD', suit: 'D', rank: 'Q' },
  { id: 'JC', suit: 'C', rank: 'J' },
  { id: '10H', suit: 'H', rank: '10' },
];

export function CardFan({ lang }: { lang: Lang }) {
  return (
    <div className="hero-fan" aria-hidden="true">
      {FAN.map((card, index) => (
        <PlayingCard
          key={card.id}
          card={card}
          lang={lang}
          index={index}
          total={FAN.length}
          size="mini"
        />
      ))}
    </div>
  );
}
