import type { CSSProperties } from 'react';
import type { Card } from '../game/doudizhu';
import { cardFace, cardName, rankName, rankText, suitSymbol } from '../format';
import type { Lang } from '../i18n';

const RED_SUITS = new Set(['H', 'D']);

export function PlayingCard({
  card,
  lang,
  selected = false,
  hinted = false,
  disabled = false,
  small = false,
  onClick,
  label,
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  hinted?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const joker = card.rank >= 16;
  const red = RED_SUITS.has(card.suit) || card.rank === 17;
  const classes = [
    'playing-card',
    joker ? 'is-joker' : '',
    joker ? (card.rank === 17 ? 'is-big-joker' : 'is-small-joker') : '',
    red ? 'is-red' : 'is-black',
    selected ? 'is-selected' : '',
    hinted ? 'is-hinted' : '',
    small ? 'is-small' : '',
    onClick ? 'is-button' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const cornerRank = joker ? (lang === 'zh' ? rankName(card.rank, 'zh') : rankText(card.rank)) : rankText(card.rank);
  const centre = joker ? (lang === 'zh' ? '王' : 'JOKER') : suitSymbol(card);

  const face = (
    <>
      <span className="pc-corner">
        <span className="pc-rank">{cornerRank}</span>
        <span className="pc-suit">{joker ? '★' : suitSymbol(card)}</span>
      </span>
      <span className={`pc-centre ${joker ? 'pc-joker-centre' : ''}`}>{centre}</span>
      <span className="pc-corner pc-bottom" aria-hidden="true">
        <span className="pc-rank">{cornerRank}</span>
        <span className="pc-suit">{joker ? '★' : suitSymbol(card)}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-label={label ?? cardName(card, lang)}
        aria-pressed={selected}
        data-testid="card"
        data-card-id={card.id}
        data-legal={disabled ? 'false' : 'true'}
      >
        {face}
      </button>
    );
  }
  return (
    <span
      className={classes}
      role="img"
      aria-label={label ?? cardName(card, lang)}
      data-testid="card"
      data-card-id={card.id}
    >
      {face}
    </span>
  );
}

export function CardBack({ small = false, label }: { small?: boolean; label: string }) {
  return (
    <span className={`playing-card is-back ${small ? 'is-small' : ''}`} role="img" aria-label={label}>
      <span className="back-pattern" aria-hidden="true" />
      <span className="back-diamond" aria-hidden="true" />
    </span>
  );
}

export function CardBackStack({ count, label }: { count: number; label: string }) {
  const shown = Math.min(Math.max(count, 0), 7);
  return (
    <span className="card-back-stack" aria-label={label}>
      {Array.from({ length: shown }).map((_, index) => (
        <span
          key={index}
          className="card-back-mini"
          style={{ left: `${index * 8}px`, zIndex: index }}
          aria-hidden="true"
        />
      ))}
      {count > 0 && <span className="card-back-count">{count}</span>}
    </span>
  );
}

export function Hand({
  cards,
  lang,
  selected,
  hinted,
  disabled,
  onToggle,
  ariaLabel,
}: {
  cards: Card[];
  lang: Lang;
  selected: Set<string>;
  hinted?: Set<string>;
  disabled?: boolean;
  onToggle: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="hand-scroll" data-testid="hand" data-hand-count={cards.length} aria-label={ariaLabel}>
      <div className="hand" style={{ '--cards': cards.length } as CSSProperties}>
        {cards.map((card, index) => (
          <PlayingCard
            key={card.id}
            card={card}
            lang={lang}
            selected={selected.has(card.id)}
            hinted={hinted?.has(card.id) ?? false}
            disabled={disabled}
            onClick={disabled ? undefined : () => onToggle(card.id)}
            label={`${cardFace(card)} · ${cardName(card, lang)} · ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export function CardFan({ lang }: { lang: Lang }) {
  const hero: Card[] = [
    { id: 'hero-3S', rank: 3, suit: 'S' },
    { id: 'hero-12H', rank: 12, suit: 'H' },
    { id: 'hero-14C', rank: 14, suit: 'C' },
    { id: 'hero-15D', rank: 15, suit: 'D' },
    { id: 'hero-SJ', rank: 16, suit: 'J' },
    { id: 'hero-BJ', rank: 17, suit: 'J' },
  ];
  return (
    <div className="hero-fan" aria-hidden="true">
      {hero.map((card, index) => (
        <span key={card.id} className={`hero-card hero-card-${index}`}>
          <PlayingCard card={card} lang={lang} />
        </span>
      ))}
    </div>
  );
}
