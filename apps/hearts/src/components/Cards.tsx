import { rankOf, suitOf, type Card, type Suit } from '../game/hearts';
import { t, type Lang, type MessageKey } from '../i18n';

const SUIT_KEY: Record<Suit, MessageKey> = {
  clubs: 'suitClubs',
  diamonds: 'suitDiamonds',
  spades: 'suitSpades',
  hearts: 'suitHearts',
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  spades: '♠',
  hearts: '♥',
};

export function rankText(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

export function suitName(card: Card, lang: Lang): string {
  return t(lang, SUIT_KEY[suitOf(card)]);
}

export function cardLabel(card: Card, lang: Lang): string {
  return t(lang, 'cardAria', {
    rank: rankText(rankOf(card)),
    suit: suitName(card, lang),
  });
}

export function PlayingCard({
  card,
  lang,
  selected = false,
  disabled = false,
  legal = false,
  hint = false,
  onClick,
  title,
  compact = false,
  decorative = false,
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  disabled?: boolean;
  legal?: boolean;
  hint?: boolean;
  onClick?: () => void;
  title?: string;
  compact?: boolean;
  decorative?: boolean;
}) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const red = suit === 'hearts' || suit === 'diamonds';
  const classes = [
    'playing-card',
    `suit-${suit}`,
    red ? 'is-red' : 'is-black',
    selected ? 'is-selected' : '',
    disabled ? 'is-disabled' : '',
    legal ? 'is-legal' : '',
    hint ? 'is-hint' : '',
    compact ? 'is-compact' : '',
    decorative ? 'is-decorative' : '',
    card === 36 ? 'is-queen-spades' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="card-corner">
        <span className="card-rank">{rankText(rank)}</span>
        <span className="card-suit">{SUIT_SYMBOL[suit]}</span>
      </span>
      <span className="card-centre" aria-hidden="true">
        {SUIT_SYMBOL[suit]}
      </span>
      <span className="card-corner card-corner-bottom" aria-hidden="true">
        <span className="card-rank">{rankText(rank)}</span>
        <span className="card-suit">{SUIT_SYMBOL[suit]}</span>
      </span>
      {card === 36 && <span className="queen-badge">13</span>}
    </>
  );

  if (decorative) {
    return (
      <div className={classes} aria-hidden="true">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      data-card={card}
      aria-label={cardLabel(card, lang)}
      aria-pressed={selected || undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function CardBack({ small = false }: { small?: boolean }) {
  return (
    <span className={`card-back ${small ? 'is-small' : ''}`} aria-hidden="true">
      <span className="card-back-inner">
        <span className="card-back-heart">♥</span>
      </span>
    </span>
  );
}

export function SuitRow({ className = '' }: { className?: string }) {
  return (
    <span className={`suit-row ${className}`} aria-hidden="true">
      <span className="is-red">♥</span>
      <span>♠</span>
      <span className="is-red">♦</span>
      <span>♣</span>
    </span>
  );
}
