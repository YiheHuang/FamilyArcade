import type { CSSProperties } from 'react';
import { t, type Lang } from '../i18n';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({
  value,
  lang,
  small = false,
  muted = false,
  index = 0,
}: {
  value: number;
  lang: Lang;
  small?: boolean;
  muted?: boolean;
  index?: number;
}) {
  const pips = PIPS[value] ?? PIPS[1];
  const classes = ['die', small ? 'die-small' : '', muted ? 'die-muted' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={classes}
      role="img"
      aria-label={t(lang, 'dieAria', { n: value })}
      data-value={value}
      style={{ '--die-index': index } as CSSProperties}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={pips.includes(cell) ? 'pip on' : 'pip'} />
      ))}
    </span>
  );
}

export function DiceTray({
  dice,
  lang,
  label,
  testId = 'own-dice',
  compact = false,
}: {
  dice: number[];
  lang: Lang;
  label?: string;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`dice-tray ${compact ? 'dice-tray-compact' : ''}`}
      data-testid={testId}
      aria-label={label ?? t(lang, 'ownDiceLabel')}
    >
      {dice.map((value, index) => (
        <Die key={`${value}-${index}`} value={value} lang={lang} index={index} small={compact} />
      ))}
    </div>
  );
}

export function CupStack({
  count,
  lang,
  out = false,
}: {
  count: number;
  lang: Lang;
  out?: boolean;
}) {
  return (
    <span
      className={`cup-stack ${out ? 'is-out' : ''}`}
      role="img"
      aria-label={t(lang, 'cupAria', { n: count })}
      data-count={count}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`mini-cup ${index < count ? 'full' : 'empty'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function PlayerSeat({
  seat,
  name,
  count,
  turn,
  out,
  isYou,
  thinking,
  winner,
  place,
  bidText,
  lang,
}: {
  seat: number;
  name: string;
  count: number;
  turn: boolean;
  out: boolean;
  isYou: boolean;
  thinking: boolean;
  winner: boolean;
  place: number | null;
  bidText: string;
  lang: Lang;
}) {
  const classes = [
    'seat-card',
    turn ? 'is-turn' : '',
    out ? 'is-out' : '',
    isYou ? 'is-you' : '',
    winner ? 'is-winner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article
      className={classes}
      data-seat={seat}
      data-turn={turn ? 'true' : 'false'}
      data-count={count}
      aria-label={t(lang, 'seatAria', { name, n: count })}
    >
      <div className="seat-head">
        <span className="seat-number" aria-hidden="true">
          {winner ? '★' : place ?? seat + 1}
        </span>
        <div className="seat-name">
          <strong>{name}</strong>
          <span>
            {out
              ? t(lang, 'out')
              : count === 1
                ? t(lang, 'diceOne')
                : t(lang, 'diceLeft', { n: count })}
          </span>
        </div>
        {thinking && <span className="thinking-dots" aria-hidden="true">…</span>}
      </div>
      <div className="seat-cups">
        <CupStack count={count} lang={lang} out={out} />
      </div>
      <div className="seat-foot">
        {bidText ? <span className="seat-bid">{bidText}</span> : <span className="seat-empty">·</span>}
        {winner && <span className="seat-crown" aria-hidden="true">◆</span>}
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
      <span className="gate-mark" aria-hidden="true">⌄</span>
      <strong>{t(lang, 'privacyTo', { name })}</strong>
      <p>{t(lang, 'revealHint')}</p>
      <button className="primary reveal-button" onClick={onReveal} data-testid="lift-cup">
        {t(lang, 'liftCup')}
      </button>
    </section>
  );
}

export function BidChip({
  quantity,
  face,
  lang,
  compact = false,
}: {
  quantity: number;
  face: number;
  lang: Lang;
  compact?: boolean;
}) {
  return (
    <span className={`bid-chip ${compact ? 'compact' : ''}`}>
      <strong>{quantity}</strong>
      <span aria-hidden="true">×</span>
      <Die value={face} lang={lang} small />
    </span>
  );
}
