import type { CSSProperties, ReactNode } from 'react';
import { dessertMeta, typeOf } from '../game/data';
import type { Crown, DessertId, RoundBreakdown } from '../game/types';
import { seatTheme, type Mark } from './theme';

export type T = (key: string, params?: Record<string, string | number>) => string;

export function dessertName(t: T, dessert: DessertId): string {
  return t(`dessert.${dessert}`);
}

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
  autoFocus = false,
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
  autoFocus?: boolean;
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
      autoFocus={autoFocus}
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
  testId,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  testId?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`segmented__item${option.value === value ? ' is-active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          data-testid={testId ? `${testId}-${String(option.value)}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SeatDot({ seat, size = 24 }: { seat: number; size?: number }) {
  const theme = seatTheme(seat);
  return (
    <span
      className={`seat-dot seat-dot--${theme.mark}`}
      style={{ background: theme.color, width: size, height: size, flexBasis: size }}
      aria-hidden
    >
      <span className="seat-dot__mark" />
    </span>
  );
}

const SHAPE_PATHS: Record<DessertId, ReactNode> = {
  macaron: (
    <>
      <ellipse cx="32" cy="43" rx="21" ry="8.5" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <rect x="11" y="34" width="42" height="9" rx="4.5" fill="var(--dessert-light)" stroke="var(--dessert-deep)" strokeWidth="1.4" />
      <ellipse cx="32" cy="28" rx="21" ry="10" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <ellipse cx="25" cy="25" rx="7" ry="2.8" fill="#fffdf8" opacity="0.42" />
    </>
  ),
  tart: (
    <>
      <path d="M9 33h46l-5.5 15.5a6 6 0 0 1-5.6 3.8H20.1a6 6 0 0 1-5.6-3.8z" fill="#d9a45a" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <ellipse cx="32" cy="33" rx="23" ry="7" fill="var(--dessert-light)" stroke="var(--dessert-deep)" strokeWidth="1.5" />
      <circle cx="23" cy="32" r="3.2" fill="var(--dessert-color)" />
      <circle cx="32" cy="30.5" r="3.6" fill="var(--dessert-color)" />
      <circle cx="41" cy="32.5" r="3" fill="var(--dessert-color)" />
      <path d="M18 39h28" stroke="var(--dessert-deep)" opacity="0.25" strokeWidth="1.4" />
    </>
  ),
  eclair: (
    <>
      <rect x="7" y="24" width="50" height="19" rx="9.5" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <path d="M12 29.5h40" stroke="var(--dessert-light)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M14 38.5h36" stroke="var(--dessert-deep)" opacity="0.28" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="21" cy="34.5" r="1.5" fill="#fffdf8" opacity="0.55" />
      <circle cx="43" cy="34.5" r="1.5" fill="#fffdf8" opacity="0.55" />
    </>
  ),
  pudding: (
    <>
      <ellipse cx="32" cy="51" rx="18" ry="4.5" fill="var(--dessert-light)" stroke="var(--dessert-deep)" strokeWidth="1.3" />
      <path d="M18 25h28l-4 21.5a5 5 0 0 1-5 4.3H27a5 5 0 0 1-5-4.3z" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <ellipse cx="32" cy="25" rx="14" ry="5" fill="var(--dessert-light)" stroke="var(--dessert-deep)" strokeWidth="1.5" />
      <path d="M23 26c2.5 6 15.5 6 18 0" fill="var(--dessert-deep)" opacity="0.18" />
      <path d="M27 39h10" stroke="var(--dessert-light)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
    </>
  ),
  candy: (
    <>
      <path d="M14 32L5 23v18z" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M50 32l9-9v18z" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="32" cy="32" rx="16" ry="11.5" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.6" />
      <path d="M22 32h20" stroke="var(--dessert-light)" strokeWidth="3" strokeLinecap="round" />
      <path d="M27 27.5h10M27 36.5h10" stroke="var(--dessert-deep)" opacity="0.2" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  cake: (
    <>
      <path d="M13 42L32 15l19 27z" fill="var(--dessert-light)" stroke="var(--dessert-deep)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 38h24l-3.4 7.5a3 3 0 0 1-2.8 1.8H26.2a3 3 0 0 1-2.8-1.8z" fill="var(--dessert-color)" stroke="var(--dessert-deep)" strokeWidth="1.4" />
      <path d="M18 34.5h28" stroke="var(--dessert-color)" strokeWidth="4" />
      <circle cx="32" cy="15" r="4.2" fill="#b34a52" stroke="#6f2830" strokeWidth="1.2" />
      <path d="M32 19c0 3 2 4 3 6" stroke="#5c7d4a" strokeWidth="1.6" fill="none" />
    </>
  ),
};

export function DessertIcon({
  type,
  size = 48,
  className = '',
}: {
  type: DessertId;
  size?: number;
  className?: string;
}) {
  const meta = dessertMeta(type);
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`dessert-icon ${className}`}
      style={
        {
          '--dessert-color': meta.color,
          '--dessert-deep': meta.deep,
          '--dessert-light': meta.light,
        } as CSSProperties
      }
      aria-hidden
      focusable="false"
    >
      {SHAPE_PATHS[type]}
    </svg>
  );
}

export function CardFace({
  cardId,
  name,
  selected = false,
  disabled = false,
  onClick,
  size = 'normal',
  testId,
  ariaLabel,
  className = '',
  hinted = false,
}: {
  cardId: number;
  name: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small' | 'tiny';
  testId?: string;
  ariaLabel?: string;
  className?: string;
  hinted?: boolean;
}) {
  const type = typeOf(cardId);
  const meta = dessertMeta(type);
  const style = {
    '--card-color': meta.color,
    '--card-deep': meta.deep,
    '--card-light': meta.light,
  } as CSSProperties;
  const inner = (
    <>
      <span className="card-face__band" aria-hidden />
      <span className="card-face__corner" aria-hidden>
        <span className="card-face__corner-mark" />
      </span>
      <span className="card-face__art">
        <DessertIcon type={type} size={size === 'tiny' ? 26 : size === 'small' ? 40 : 58} />
      </span>
      <span className="card-face__name">{name}</span>
      <span className="card-face__foot" aria-hidden>
        <span className="card-face__dot" />
        <span className="card-face__dot" />
        <span className="card-face__dot" />
      </span>
    </>
  );
  const classes = `card-face card-face--${size}${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}${hinted ? ' is-hinted' : ''} ${className}`;
  if (!onClick) {
    return (
      <span className={classes} style={style} data-card-id={cardId} data-dessert={type} data-testid={testId}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel ?? name}
      data-card-id={cardId}
      data-dessert={type}
      data-testid={testId}
    >
      {inner}
    </button>
  );
}

export function HandFan({
  cards,
  selected,
  onSelect,
  disabled,
  t,
  testId = 'hand-fan',
  hintCard = null,
}: {
  cards: number[];
  selected: number | null;
  onSelect: (cardId: number) => void;
  disabled: boolean;
  t: T;
  testId?: string;
  hintCard?: number | null;
}) {
  const count = cards.length;
  return (
    <div className="hand-fan" data-testid={testId} role="group" aria-label={t('game.hand')}>
      {cards.map((cardId, index) => {
        const middle = (count - 1) / 2;
        const offset = index - middle;
        return (
          <div
            key={cardId}
            className={`hand-fan__slot${selected === cardId ? ' is-selected' : ''}`}
            style={
              {
                '--angle': `${offset * 3.4}deg`,
                '--lift': `${Math.abs(offset) * 4}px`,
                zIndex: selected === cardId ? 20 : index + 1,
              } as CSSProperties
            }
          >
            <CardFace
              cardId={cardId}
              name={dessertName(t, typeOf(cardId))}
              selected={selected === cardId}
              disabled={disabled}
              onClick={() => onSelect(cardId)}
              testId={`card-${cardId}`}
              hinted={hintCard === cardId}
              ariaLabel={`${dessertName(t, typeOf(cardId))}${selected === cardId ? ` — ${t('game.selected', { name: dessertName(t, typeOf(cardId)) })}` : ''}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function DessertTally({
  cards,
  t,
  max = 6,
  size = 18,
}: {
  cards: number[];
  t: T;
  max?: number;
  size?: number;
}) {
  const counts = new Map<DessertId, number>();
  for (const id of cards) {
    const type = typeOf(id);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
  if (rows.length === 0) return <span className="tally tally--empty">—</span>;
  return (
    <span className="tally">
      {rows.map(([type, count]) => (
        <span key={type} className="tally__item" title={`${dessertName(t, type)} ×${count}`}>
          <DessertIcon type={type} size={size} />
          <span className="tally__count">×{count}</span>
        </span>
      ))}
    </span>
  );
}

export function MiniCards({ cards, t }: { cards: number[]; t: T }) {
  return (
    <div className="mini-cards">
      {cards.map((cardId) => (
        <CardFace
          key={cardId}
          cardId={cardId}
          name={dessertName(t, typeOf(cardId))}
          size="tiny"
          testId={`mini-card-${cardId}`}
        />
      ))}
    </div>
  );
}

export function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="#c79a43" stroke="#7d5a1d" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="3" cy="8" r="1.4" fill="#c79a43" />
      <circle cx="21" cy="8" r="1.4" fill="#c79a43" />
      <circle cx="12" cy="16" r="1.4" fill="#fff2cf" />
    </svg>
  );
}

export function CrownBadge({ count, t }: { count: number; t: T }) {
  if (count <= 0) return null;
  return (
    <span className="crown-badge" title={t('game.crowns')}>
      <CrownIcon size={14} /> {count}
    </span>
  );
}

export function comboLabel(t: T, combo: RoundBreakdown['combos'][number]): string {
  const dessert = dessertName(t, combo.dessert);
  if (combo.kind === 'pair') return t('game.comboPair', { dessert });
  if (combo.kind === 'triple') return t('game.comboTriple', { dessert });
  return t('game.comboQuad', { dessert });
}

export function ScoreBreakdown({
  breakdown,
  t,
  showCards = false,
}: {
  breakdown: RoundBreakdown;
  t: T;
  showCards?: boolean;
}) {
  const chips: ReactNode[] = [];
  for (const combo of breakdown.combos) {
    chips.push(
      <span key={`${combo.kind}-${combo.dessert}`} className={`score-chip score-chip--${combo.kind}`}>
        <DessertIcon type={combo.dessert} size={18} />
        <span>{comboLabel(t, combo)}</span>
        <strong>+{combo.points}</strong>
      </span>,
    );
  }
  if (breakdown.sampler) {
    chips.push(
      <span key="sampler" className="score-chip score-chip--sampler">
        <span className="score-chip__tri" aria-hidden>
          {breakdown.sampler.desserts.map((dessert) => (
            <DessertIcon key={dessert} type={dessert} size={15} />
          ))}
        </span>
        <span>{t('game.sampler')}</span>
        <strong>+{breakdown.sampler.points}</strong>
      </span>,
    );
  }
  if (breakdown.leftoverPoints > 0) {
    chips.push(
      <span key="leftover" className="score-chip score-chip--leftover">
        <span>{t('game.leftovers')} ×{breakdown.leftovers.length}</span>
        <strong>+{breakdown.leftoverPoints}</strong>
      </span>,
    );
  }
  return (
    <div className="score-breakdown">
      <div className="score-breakdown__chips">{chips.length > 0 ? chips : <span className="muted">{t('game.noCombos')}</span>}</div>
      {showCards && breakdown.leftovers.length > 0 && (
        <div className="score-breakdown__cards">
          <DessertTally cards={breakdown.leftovers} t={t} size={16} />
        </div>
      )}
      <div className="score-breakdown__total">
        <span>{t('game.roundScore')}</span>
        <strong>{breakdown.total}</strong>
      </div>
    </div>
  );
}

export function CrownList({ crowns, t, names }: { crowns: Crown[]; t: T; names: string[] }) {
  if (crowns.length === 0) return <p className="muted">{t('game.noAwards')}</p>;
  return (
    <div className="crown-list">
      {crowns.map((crown) => (
        <span key={`${crown.dessert}-${crown.seat}`} className="crown-list__item">
          <CrownIcon size={16} />
          <DessertIcon type={crown.dessert} size={18} />
          <span>
            {names[crown.seat]} · {dessertName(t, crown.dessert)} {crown.count}
          </span>
          <strong>+{crown.points}</strong>
        </span>
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

export function MarkIcon({ mark }: { mark: Mark }) {
  return <span className={`mark mark--${mark}`} aria-hidden />;
}
