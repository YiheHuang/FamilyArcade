import type { ReactNode } from 'react';
import type { GameState } from '../game/types';
import { homeCount } from '../game/engine';
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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  wide?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${wide ? ' btn--wide' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
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

export function PlayerRail({
  state,
  t,
  localSeat = null,
}: {
  state: GameState;
  t: T;
  localSeat?: number | null;
}) {
  return (
    <div className="player-rail" aria-label={t('game.ranking')}>
      {state.config.seats.map((seat, i) => {
        const th = seatTheme(i);
        const home = homeCount(state, i);
        const remaining = 10 - home;
        const current = state.current === i && state.status === 'playing';
        return (
          <div key={i} className={`player-row${current ? ' is-current' : ''}`}>
            <span className={`seat-dot seat-dot--${th.mark}`} style={{ background: th.color }} aria-hidden>
              <span className="seat-dot__mark" />
            </span>
            <div className="player-row__main">
              <div className="player-row__name">
                <span>{seat.name}</span>
                {localSeat === i && <span className="pill">{t('game.you')}</span>}
                {seat.kind === 'ai' && <span className="pill pill--muted">{t('setup.ai')}</span>}
              </div>
              <div className="player-row__sub">
                <span>
                  {t('game.homeCount')} {home}
                  <span className="muted"> {t('game.of', { n: 10 })}</span>
                </span>
                <span className="muted">
                  {t('game.remaining')} {remaining}
                </span>
              </div>
              <div className="progress" aria-hidden>
                <span style={{ width: `${(home / 10) * 100}%`, background: th.color }} />
              </div>
            </div>
            {current && <span className="turn-pip" aria-label={t('game.turnOf', { name: seat.name })} />}
          </div>
        );
      })}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  actions?: ReactNode;
  wide?: boolean;
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
