import type { CSSProperties } from 'react';
import { rankLabel, suitSymbol, type Card, type Combo } from '../game/zheng-shangyou';
import { t, type Lang } from '../i18n';

export function comboName(lang: Lang, combo: Combo): string {
  switch (combo.type) {
    case 'single':
      return rankLabel(combo.rank);
    case 'pair':
      return t(lang, 'comboPair', { rank: rankLabel(combo.rank) });
    case 'triple':
      return t(lang, 'comboTriple', { rank: rankLabel(combo.rank) });
    case 'triple-single':
      return `${t(lang, 'tripleSingle')} ${rankLabel(combo.rank)}`;
    case 'triple-pair':
      return `${t(lang, 'triplePair')} ${rankLabel(combo.rank)}`;
    case 'straight':
      return t(lang, 'comboStraight', { rank: rankLabel(combo.rank) });
    case 'pair-straight':
      return t(lang, 'comboPairStraight', { rank: rankLabel(combo.rank) });
    case 'bomb':
      return t(lang, 'comboBomb', { rank: rankLabel(combo.rank) });
    default:
      return t(lang, 'comboGeneric', { type: combo.type });
  }
}

function suitKey(suit: Card['suit']) {
  return suit === 'clubs'
    ? 'suitClubs'
    : suit === 'diamonds'
      ? 'suitDiamonds'
      : suit === 'hearts'
        ? 'suitHearts'
        : 'suitSpades';
}

export function PlayingCard({
  card,
  lang,
  selected = false,
  hinted = false,
  disabled = false,
  compact = false,
  onClick,
  index = 0,
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  hinted?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const label = t(lang, 'cardAria', {
    rank: rankLabel(card.rank),
    suit: t(lang, suitKey(card.suit)),
  });
  const classes = [
    'playing-card',
    `suit-${card.suit}`,
    selected ? 'selected' : '',
    hinted ? 'hint' : '',
    compact ? 'compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--card-index': index } as CSSProperties;
  const body = (
    <>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
      <span className="card-pip" aria-hidden="true">
        {suitSymbol(card.suit)}
      </span>
      <span className="card-rank foot" aria-hidden="true">
        {rankLabel(card.rank)}
      </span>
    </>
  );
  if (!onClick) {
    return (
      <span className={classes} style={style} data-card={card.id} role="img" aria-label={label}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-card={card.id}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

export function CardBack({ count = 1, small = false }: { count?: number; small?: boolean }) {
  const shown = Math.min(4, Math.max(0, count));
  return (
    <span className={`card-backs ${small ? 'small' : ''}`} aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => (
        <span key={index} className="card-back" style={{ '--back-index': index } as CSSProperties} />
      ))}
    </span>
  );
}

export function PlayerSeat({
  name,
  seat,
  count,
  turn,
  finished,
  place,
  lastText,
  isYou,
  thinking,
  score,
  lang,
}: {
  name: string;
  seat: number;
  count: number;
  turn: boolean;
  finished: boolean;
  place: number | null;
  lastText: string;
  isYou: boolean;
  thinking: boolean;
  score: number;
  lang: Lang;
}) {
  const out = finished && count === 0;
  const classes = [
    'seat',
    turn ? 'is-turn' : '',
    out ? 'is-out' : '',
    isYou ? 'is-you' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={classes} data-seat={seat}>
      <div className="seat-top">
        <span className="seat-avatar" aria-hidden="true">
          {finished && place ? place : seat + 1}
        </span>
        <div className="seat-name">
          <strong>{name}</strong>
          <span className="seat-meta">
            {out ? t(lang, 'finishedSeat') : t(lang, 'cardsLeft', { n: count })}
          </span>
        </div>
        <CardBack count={count} small />
      </div>
      <div className="seat-bottom">
        <span className="seat-state">{finished && place ? `#${place}` : lastText}</span>
        <span className="seat-score">
          {score > 0 ? '+' : ''}
          {score}
        </span>
        {thinking && <span className="thinking-dots" aria-hidden="true">…</span>}
      </div>
    </article>
  );
}

export function PrivacyGate({
  name,
  lang,
  onReveal,
}: {
  name: string;
  lang: Lang;
  onReveal: () => void;
}) {
  return (
    <section className="privacy-gate" aria-live="polite">
      <span className="gate-icon" aria-hidden="true">✦</span>
      <strong>{t(lang, 'privacyTo', { name })}</strong>
      <p>{t(lang, 'revealHint')}</p>
      <button className="primary reveal-button" onClick={onReveal}>
        {t(lang, 'reveal')}
      </button>
    </section>
  );
}
