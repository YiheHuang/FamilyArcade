import type { ReactNode } from 'react';
import type { PlayerView } from '../game/types';
import type { Lang } from '../i18n';
import { colorTheme, SEAT_MARKS } from './theme';

export type T = (key: string, params?: Record<string, string | number>) => string;

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  wide = false,
  type = 'button',
  ariaLabel,
  testId,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  wide?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${wide ? ' btn--wide' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`segmented__item${opt.value === value ? ' is-active' : ''}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
  wide = false,
  closeLabel = 'Close',
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  actions?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
              ×
            </button>
          )}
        </div>
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast${message ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function SeatToken({ seat, size = 26 }: { seat: number; size?: number }) {
  const c = colorTheme(seat);
  return (
    <span
      className="seat-token"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: c.hex,
        color: c.ink,
      }}
      aria-hidden
    >
      {SEAT_MARKS[seat % 4]}
    </span>
  );
}

export function BloomMark({ count }: { count: number }) {
  return (
    <span className="bloom-mark" title={`${count}`}>
      <svg viewBox="0 0 20 20" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} cx={10} cy={5.2} rx={2.5} ry={3.6} transform={`rotate(${i * 60} 10 10)`} />
        ))}
        <circle cx={10} cy={10} r={2.3} className="bloom-mark__centre" />
      </svg>
      <span>{count}</span>
    </span>
  );
}

export function PlayerRail({
  playerView,
  t,
  localSeat = null,
}: {
  playerView: PlayerView;
  t: T;
  localSeat?: number | null;
}) {
  const maxScore = Math.max(1, ...playerView.scores);
  return (
    <div className="player-rail" aria-label={t('game.ranking')}>
      {playerView.config.seats.map((seat, i) => {
        const current = playerView.current === i && playerView.status === 'playing';
        const winner = playerView.winners.includes(i);
        const pct = Math.round((playerView.scores[i] / maxScore) * 100);
        return (
          <div
            key={i}
            className={`player-row${current ? ' is-current' : ''}${winner ? ' is-winner' : ''}`}
          >
            <SeatToken seat={i} />
            <div className="player-row__main">
              <div className="player-row__name">
                <span>{seat.name}</span>
                {localSeat === i && <span className="pill">{t('game.you')}</span>}
                {seat.kind === 'ai' && (
                  <span className={`pill pill--ai pill--${seat.level}`}>{t(`ai.${seat.level}`)}</span>
                )}
              </div>
              <div className="player-row__sub">
                <span>
                  {t('game.handCount', { n: playerView.handCounts[i] })}
                  <span className="muted"> · {t('game.blooms')} {playerView.blooms[i]}</span>
                </span>
                <strong className="player-row__score">{playerView.scores[i]}</strong>
              </div>
              <div className="progress" aria-hidden>
                <span style={{ width: `${pct}%`, background: colorTheme(i).hex }} />
              </div>
            </div>
            {current && <span className="turn-pip" aria-label={t('game.turnOf', { name: seat.name })} />}
          </div>
        );
      })}
    </div>
  );
}

export function SealLegend({ lang, t }: { lang: Lang; t: T }) {
  return (
    <div className="seal-legend" aria-label={t('rules.legendText')}>
      {Array.from({ length: 6 }, (_, i) => {
        const c = colorTheme(i);
        return (
          <span key={i} className="seal-legend__item">
            <span className="seal" style={{ background: c.hex, color: c.ink }}>
              {c.letter}
            </span>
            {lang === 'zh' ? c.zh : c.en}
          </span>
        );
      })}
    </div>
  );
}
