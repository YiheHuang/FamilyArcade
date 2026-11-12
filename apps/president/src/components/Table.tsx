import { t, type Lang } from '../i18n';
import { rankLabel, suitSymbol, type Card, type Role } from '../game/president';
import type { CSSProperties } from 'react';

export function RoleBadge({ role, lang }: { role: Role | null; lang: Lang }) {
  if (!role) return null;
  const key =
    role === 'president'
      ? 'rolePresident'
      : role === 'vice'
        ? 'roleVice'
        : role === 'vice-scum'
          ? 'roleViceScum'
          : role === 'scum'
            ? 'roleScum'
            : 'roleCitizen';
  return <span className={`role-badge role-${role}`}>{t(lang, key)}</span>;
}

export function comboLabel(lang: Lang, count: number, rank: number): string {
  if (count === 1) return rankLabel(rank);
  return t(lang, count === 2 ? 'comboPair' : 'comboTriple', { rank: rankLabel(rank) });
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
  if (!onClick) {
    return (
      <span className={classes} style={style} data-card={card.id} aria-label={label}>
        <span className="card-rank">{rankLabel(card.rank)}</span>
        <span className="card-suit">{suitSymbol(card.suit)}</span>
        <span className="card-rank foot">{rankLabel(card.rank)}</span>
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
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
      <span className="card-rank foot">{rankLabel(card.rank)}</span>
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
  role,
  turn,
  finished,
  passed,
  place,
  lastText,
  isYou,
  thinking,
  lang,
}: {
  name: string;
  seat: number;
  count: number;
  role: Role | null;
  turn: boolean;
  finished: boolean;
  passed: boolean;
  place: number | null;
  lastText: string;
  isYou: boolean;
  thinking: boolean;
  lang: Lang;
}) {
  const out = finished && count === 0;
  const classes = [
    'seat',
    turn ? 'is-turn' : '',
    out ? 'is-out' : '',
    passed ? 'is-passed' : '',
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
            <RoleBadge role={role} lang={lang} />
            {out
              ? t(lang, 'finishedSeat')
              : t(lang, 'cardsLeft', { n: count })}
          </span>
        </div>
        <CardBack count={count} small />
      </div>
      <div className="seat-bottom">
        <span className={`seat-state ${passed ? 'passed' : ''}`}>
          {out
            ? place
              ? `#${place}`
              : ''
            : passed
              ? t(lang, 'pass')
              : lastText}
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
