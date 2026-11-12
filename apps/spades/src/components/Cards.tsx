import type { CSSProperties } from 'react';
import { cardId, type Card, type Suit } from '../game/spades';
import { cardName, t, type Lang } from '../i18n';

const GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function suitGlyph(suit: Suit): string {
  return GLYPH[suit];
}

export function CardFace({
  card,
  lang,
  hint,
  legal,
  disabled,
  onClick,
  index,
  total,
  size = 'hand',
  ghost,
}: {
  card: Card;
  lang: Lang;
  hint?: boolean;
  legal?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
  total?: number;
  size?: 'hand' | 'trick' | 'hero';
  ghost?: boolean;
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const classes = [
    'card',
    red ? 'red' : 'black',
    `card-${size}`,
    hint ? 'hint' : '',
    legal ? 'legal' : '',
    disabled ? 'disabled' : '',
    ghost ? 'ghost' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style =
    index !== undefined && total !== undefined
      ? ({
          '--i': index,
          '--n': total,
          '--mid': (total - 1) / 2,
        } as CSSProperties)
      : undefined;
  const label = cardName(lang, card);
  const body = (
    <>
      <span className="card-corner">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitGlyph(card.suit)}</span>
      </span>
      <span className="card-pip" aria-hidden="true">
        {suitGlyph(card.suit)}
      </span>
      <span className="card-corner bottom" aria-hidden="true">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitGlyph(card.suit)}</span>
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
        disabled={disabled}
        onClick={onClick}
        data-testid="card"
        data-card-id={cardId(card)}
        data-legal={legal ? 'true' : 'false'}
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
      data-card-id={cardId(card)}
      data-legal={legal ? 'true' : 'false'}
    >
      {body}
    </span>
  );
}

export function CardBack({
  lang,
  index,
  total,
  size = 'hand',
}: {
  lang: Lang;
  index?: number;
  total?: number;
  size?: 'hand' | 'trick' | 'hero';
}) {
  const style =
    index !== undefined && total !== undefined
      ? ({
          '--i': index,
          '--n': total,
          '--mid': (total - 1) / 2,
        } as CSSProperties)
      : undefined;
  return (
    <span
      className={`card back card-${size}`}
      style={style}
      role="img"
      aria-label={t(lang, 'hiddenCard')}
    >
      <span className="back-spade" aria-hidden="true">
        ♠
      </span>
    </span>
  );
}

export function Hand({
  cards,
  lang,
  legal,
  hint,
  disabled,
  onPlay,
}: {
  cards: Card[];
  lang: Lang;
  legal: string[];
  hint?: string | null;
  disabled?: boolean;
  onPlay: (id: string) => void;
}) {
  const legalSet = new Set(legal);
  return (
    <div className="hand" aria-label={t(lang, 'handLabel')} data-hand-count={cards.length} data-testid="hand">
      {cards.map((card, index) => {
        const id = cardId(card);
        const allowed = legalSet.has(id);
        return (
          <CardFace
            key={id}
            card={card}
            lang={lang}
            index={index}
            total={cards.length}
            legal={allowed}
            hint={hint === id}
            disabled={disabled || !allowed}
            onClick={allowed && !disabled ? () => onPlay(id) : undefined}
          />
        );
      })}
    </div>
  );
}

export function CardFan({ lang }: { lang: Lang }) {
  const cards: Card[] = [
    { suit: 'S', rank: 'A' },
    { suit: 'S', rank: 'K' },
    { suit: 'H', rank: 'A' },
    { suit: 'C', rank: 'Q' },
    { suit: 'D', rank: '10' },
  ];
  return (
    <div className="hero-fan" aria-hidden="true">
      {cards.map((card, index) => (
        <CardFace
          key={cardId(card)}
          card={card}
          lang={lang}
          index={index}
          total={cards.length}
          size="hero"
        />
      ))}
    </div>
  );
}
