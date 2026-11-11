import type { CSSProperties, ReactNode } from 'react';
import type { Card } from '../game/color-chain';
import { cardAria } from '../labels';
import { t, type Lang } from '../i18n';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

function SkipIcon() {
  return (
    <svg viewBox="0 0 48 48" className="card-icon" aria-hidden="true">
      <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M13 35 35 13" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function ReverseIcon() {
  return (
    <svg viewBox="0 0 48 48" className="card-icon" aria-hidden="true">
      <path
        d="M12 19h19a7 7 0 0 1 0 14h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="m12 19 8-7M12 19l8 7" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="m31 28-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function cornerFor(card: Card): ReactNode {
  if (card.kind === 'number') return card.value ?? 0;
  if (card.kind === 'skip') return <SkipIcon />;
  if (card.kind === 'reverse') return <ReverseIcon />;
  if (card.kind === 'draw2') return '+2';
  if (card.kind === 'wild4') return '+4';
  return 'W';
}

function centreFor(card: Card, lang: Lang): ReactNode {
  if (card.kind === 'number') return <span className="pcard-number">{card.value ?? 0}</span>;
  if (card.kind === 'skip') return <SkipIcon />;
  if (card.kind === 'reverse') return <ReverseIcon />;
  if (card.kind === 'draw2') {
    return (
      <span className="pcard-action">
        <span className="pcard-plus">+2</span>
      </span>
    );
  }
  return (
    <span className="wild-wheel" aria-hidden="true">
      <span className="wild-centre">
        {card.kind === 'wild4' ? '+4' : 'W'}
        <small>{t(lang, card.kind === 'wild4' ? 'wild4' : 'wild')}</small>
      </span>
    </span>
  );
}

export function PlayingCard({
  card,
  lang,
  size = 'md',
  onClick,
  disabled = false,
  playable = false,
  hint = false,
  dim = false,
  selected = false,
  decorative = false,
  className = '',
  style,
}: {
  card: Card;
  lang: Lang;
  size?: CardSize;
  onClick?: () => void;
  disabled?: boolean;
  playable?: boolean;
  hint?: boolean;
  dim?: boolean;
  selected?: boolean;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const classes = [
    'pcard',
    `pcard--${size}`,
    `color-${card.color}`,
    `kind-${card.kind}`,
    playable ? 'is-playable' : '',
    hint ? 'is-hint' : '',
    dim ? 'is-dim' : '',
    selected ? 'is-selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const label = cardAria(lang, card);
  const body = (
    <>
      <span className="pcard-corner pcard-tl">{cornerFor(card)}</span>
      <span className="pcard-centre">{centreFor(card, lang)}</span>
      <span className="pcard-corner pcard-br">{cornerFor(card)}</span>
      <span className="pcard-grain" aria-hidden="true" />
      {hint && <span className="hint-ribbon">{t(lang, 'hint')}</span>}
    </>
  );
  const data = {
    'data-card-id': card.id,
    'data-color': card.color,
    'data-kind': card.kind,
    'data-wild': card.color === 'wild' ? 'true' : 'false',
  } as const;
  if (decorative) {
    return (
      <span className={classes} style={style} aria-hidden="true" {...data}>
        {body}
      </span>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-disabled={disabled}
        {...data}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={classes} style={style} aria-label={label} role="img" {...data}>
      {body}
    </span>
  );
}

export function CardBack({
  size = 'md',
  count,
  className = '',
  style,
}: {
  size?: CardSize;
  count?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`pcard pcard-back pcard--${size} ${className}`.trim()} style={style} aria-hidden="true">
      <span className="back-pattern">
        <span className="back-ring" />
        <span className="back-ring back-ring-2" />
        <span className="back-dots">
          <i className="dot-red" />
          <i className="dot-yellow" />
          <i className="dot-green" />
          <i className="dot-blue" />
        </span>
      </span>
      {typeof count === 'number' && <span className="back-count">{count}</span>}
    </span>
  );
}
