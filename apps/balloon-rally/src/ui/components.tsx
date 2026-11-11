import type { ReactNode } from 'react';
import type { GameView, ScoreRow } from '../game/types';
import { seatTheme } from './theme';

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
      data-testid={testId}
      title={title}
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

export function SeatDot({ seat, small = false }: { seat: number; small?: boolean }) {
  const theme = seatTheme(seat);
  return (
    <span
      className={`seat-dot seat-dot--${theme.mark}${small ? ' seat-dot--small' : ''}`}
      style={{ background: theme.color }}
      aria-hidden
    >
      <span className="seat-dot__mark" />
    </span>
  );
}

export function TokenDots({ left, total = 2, label }: { left: number; total?: number; label: string }) {
  return (
    <span className="token-dots" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`token-dot${i < left ? ' is-left' : ''}`} aria-hidden />
      ))}
    </span>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
  wide = false,
  testId,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  actions?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="modal__head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
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

export function Scoreboard({ view, t, compact = false }: { view: GameView; t: T; compact?: boolean }) {
  const scores = view.scores;
  return (
    <div className={`scoreboard${compact ? ' scoreboard--compact' : ''}`} aria-label={t('a11y.scoreboard')}>
      {scores.map((row: ScoreRow) => {
        const current = view.phase === 'support' && view.current === row.seat;
        const submitted = view.submitted[row.seat];
        const theme = seatTheme(row.seat);
        return (
          <div
            key={row.seat}
            className={`score-row${current ? ' is-current' : ''}${row.rank === 1 && view.phase === 'ended' ? ' is-winner' : ''}`}
          >
            <SeatDot seat={row.seat} />
            <div className="score-row__main">
              <div className="score-row__name">
                <span>{row.name}</span>
                {current && view.mySeat === row.seat && <span className="pill pill--live">{t('game.you')}</span>}
              </div>
              <div className="score-row__sub">
                <span>
                  {t('game.correct')} {row.correctSupports}
                </span>
                <span>{t('game.tokens')} {row.tokensLeft}</span>
              </div>
            </div>
            <div className="score-row__right">
              <strong>{row.total}</strong>
              <span className="score-row__rank">#{row.rank}</span>
            </div>
            {view.phase === 'support' && (
              <span
                className={`submit-pip${submitted ? ' is-done' : ''}`}
                title={submitted ? t('game.submitted') : t('game.waiting')}
                style={{ borderColor: theme.color }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
