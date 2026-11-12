import type { CSSProperties } from 'react';
import {
  cardLabel,
  rankLabel,
  suitSymbol,
  type Card,
  type Combo,
} from '../game/big-two';
import { t, type Lang } from '../i18n';

function suitKey(suit: Card['suit']) {
  return suit === 'C'
    ? 'suitClubs'
    : suit === 'D'
      ? 'suitDiamonds'
      : suit === 'H'
        ? 'suitHearts'
        : 'suitSpades';
}

export function comboLabel(lang: Lang, combo: Combo): string {
  if (combo.size === 1) return cardLabel(combo.cards[0]);
  const rank = rankLabel(combo.rank);
  if (combo.size === 2) return t(lang, 'comboPairLabel', { rank });
  if (combo.size === 3) return t(lang, 'comboTripleLabel', { rank });
  if (combo.type === 'straight') return t(lang, 'comboStraightLabel', { rank });
  if (combo.type === 'flush') return t(lang, 'comboFlushLabel', { rank });
  if (combo.type === 'full-house') {
    return t(lang, 'comboFullHouseLabel', { rank, pair: rankLabel(combo.secondary) });
  }
  if (combo.type === 'four-plus-one') return t(lang, 'comboFourLabel', { rank });
  return t(lang, 'comboStraightFlushLabel', { rank });
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
      <span className="card-corner-suit" aria-hidden="true">
        {suitSymbol(card.suit)}
      </span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
      <span className="card-rank foot">{rankLabel(card.rank)}</span>
    </>
  );
  if (!onClick) {
    return (
      <span className={classes} style={style} data-card={card.id} aria-label={label}>
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
  const shown = Math.min(5, Math.max(0, count));
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
  passed,
  lastText,
  isYou,
  thinking,
  leads,
  lang,
}: {
  name: string;
  seat: number;
  count: number;
  turn: boolean;
  passed: boolean;
  lastText: string;
  isYou: boolean;
  thinking: boolean;
  leads: boolean;
  lang: Lang;
}) {
  const classes = [
    'seat',
    turn ? 'is-turn' : '',
    passed ? 'is-passed' : '',
    isYou ? 'is-you' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={classes} data-seat={seat}>
      <div className="seat-top">
        <span className="seat-avatar" aria-hidden="true">
          {seat + 1}
        </span>
        <div className="seat-name">
          <strong>{name}</strong>
          <span className="seat-meta">
            {isYou && <span className="you-chip">{t(lang, 'you')}</span>}
            {count === 0 ? t(lang, 'finishedSeat') : t(lang, 'cardsLeft', { n: count })}
          </span>
        </div>
        <CardBack count={count} small />
      </div>
      <div className="seat-bottom">
        <span className={`seat-state ${passed ? 'passed' : ''}`}>
          {passed ? t(lang, 'pass') : lastText}
        </span>
        {leads && <span className="lead-chip">{t(lang, 'leadBadge')}</span>}
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
