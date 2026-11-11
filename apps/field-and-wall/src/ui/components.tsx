import type { CSSProperties, ReactNode } from 'react';
import type { GameView } from '../game/types';
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
  options: { value: T; label: string; disabled?: boolean }[];
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
          disabled={opt.disabled}
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
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
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

export function SeatMark({ seat, size = 22 }: { seat: number; size?: number }) {
  const theme = seatTheme(seat);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="seat-mark" aria-hidden>
      <circle cx={12} cy={12} r={10.5} fill={theme.color} stroke={theme.deep} strokeWidth={1.2} />
      {theme.mark === 'dot' && <circle cx={12} cy={12} r={3.3} fill="#f8f1e0" />}
      {theme.mark === 'plus' && (
        <g stroke="#f8f1e0" strokeWidth={2} strokeLinecap="round">
          <line x1={6.5} y1={12} x2={17.5} y2={12} />
          <line x1={12} y1={6.5} x2={12} y2={17.5} />
        </g>
      )}
      {theme.mark === 'ring' && <circle cx={12} cy={12} r={4.2} fill="none" stroke="#f8f1e0" strokeWidth={1.9} />}
      {theme.mark === 'slash' && <line x1={7} y1={17} x2={17} y2={7} stroke="#f8f1e0" strokeWidth={2} strokeLinecap="round" />}
    </svg>
  );
}

export function FeatureIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === 'city') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="feature-icon">
        <path d="M4 20V9h3V6h3v3h4V6h3v3h3v11z" fill="currentColor" opacity={0.22} />
        <path d="M4 20V9h3V6h3v3h4V6h3v3h3v11" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M10 20v-4h4v4" fill="currentColor" opacity={0.4} />
      </svg>
    );
  }
  if (type === 'road') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="feature-icon">
        <path d="M5 21c0-7 2-9 7-9s7-2 7-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.25} />
        <path d="M5 21c0-7 2-9 7-9s7-2 7-9" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
        <path d="M8.5 14.5h.1M11 11.5h.1M14 11.5h.1" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="feature-icon">
      <path d="M6 21V11h12v10" fill="currentColor" opacity={0.18} />
      <path d="M6 21V11h12v10" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M10 21v-5h4v5" fill="currentColor" opacity={0.4} />
      <path d="M12 11V5m-2.5 2.5L12 4l2.5 3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function MeeplePips({ left, total = 7 }: { left: number; total?: number }) {
  return (
    <span className="meeple-pips" aria-label={`${left} of ${total} meeples left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`meeple-pip${i < left ? ' is-filled' : ''}`} aria-hidden />
      ))}
    </span>
  );
}

export function PlayerRail({
  state,
  t,
  localSeat = null,
}: {
  state: GameView;
  t: T;
  localSeat?: number | null;
}) {
  const leader = Math.max(1, ...state.scores);
  return (
    <div className="player-rail" aria-label={t('game.ranking')}>
      {state.config.seats.map((seat, i) => {
        const theme = seatTheme(i);
        const current = state.current === i && state.status === 'playing';
        const me = localSeat === i;
        return (
          <div
            key={i}
            className={`player-row${current ? ' is-current' : ''}`}
            style={{ '--seat-color': theme.color } as CSSProperties}
          >
            <SeatMark seat={i} size={26} />
            <div className="player-row__main">
              <div className="player-row__name">
                <span>{seat.name}</span>
                {me && <span className="pill">{t('game.you')}</span>}
                {seat.kind === 'ai' && (
                  <span className="pill pill--muted">{t(`ai.${seat.level}`)}</span>
                )}
              </div>
              <div className="player-row__sub">
                <span>
                  {t('game.completed')} {state.completed[i] ?? 0}
                </span>
                <span className="muted">
                  {t('game.meeples')} {state.meeplesLeft[i] ?? 0}
                </span>
              </div>
              <div className="progress" aria-hidden>
                <span style={{ width: `${Math.min(100, ((state.scores[i] ?? 0) / leader) * 100)}%` }} />
              </div>
            </div>
            <div className="player-row__score">
              <strong>{state.scores[i] ?? 0}</strong>
              <MeeplePips left={state.meeplesLeft[i] ?? 0} />
            </div>
            {current && <span className="turn-pip" aria-label={t('game.turnOf', { name: seat.name })} />}
          </div>
        );
      })}
    </div>
  );
}

export function TileBadge({ tileName, rot }: { tileName: string; rot: number }) {
  return (
    <span className="tile-badge">
      {tileName} <span className="tile-badge__rot">{rot * 90}°</span>
    </span>
  );
}
