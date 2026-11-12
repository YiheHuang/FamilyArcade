import { meldPoints, type Card, type Meld } from '../game/rummy-500';
import { cardFace, meldLabel, rankText, suitSymbol } from '../format';
import type { Lang } from '../i18n';

const RED = new Set(['H', 'D']);

export function PlayingCard({
  card,
  faceDown = false,
  selected = false,
  hinted = false,
  disabled = false,
  small = false,
  onClick,
  label,
  className = '',
}: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  hinted?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const red = card ? RED.has(card[1]) : false;
  const classes = [
    'playing-card',
    faceDown ? 'is-back' : '',
    red ? 'is-red' : '',
    selected ? 'is-selected' : '',
    hinted ? 'is-hinted' : '',
    small ? 'is-small' : '',
    onClick ? 'is-button' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return (
      <span className={classes} aria-hidden="true">
        <span className="back-pattern" />
        <span className="back-mark">500</span>
      </span>
    );
  }

  if (!card) return null;
  const face = (
    <>
      <span className="pc-top">
        <span className="pc-rank">{rankText(card)}</span>
        <span className="pc-suit">{suitSymbol(card)}</span>
      </span>
      <span className="pc-centre">{suitSymbol(card)}</span>
      <span className="pc-bottom">
        <span className="pc-rank">{rankText(card)}</span>
        <span className="pc-suit">{suitSymbol(card)}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-label={label ?? cardFace(card)}
        aria-pressed={selected}
      >
        {face}
      </button>
    );
  }

  return (
    <span className={classes} aria-label={label ?? cardFace(card)}>
      {face}
    </span>
  );
}

export function MeldGroup({
  meld,
  lang,
  selectedCard,
  canLayoff,
  hinted,
  onLayoff,
  nameFor,
  compact = false,
}: {
  meld: Meld;
  lang: Lang;
  selectedCard?: Card | null;
  canLayoff?: boolean;
  hinted?: boolean;
  onLayoff?: () => void;
  nameFor: (seat: number) => string;
  compact?: boolean;
}) {
  const points = meldPoints(meld);
  const classes = [
    'meld-group',
    hinted ? 'is-hinted' : '',
    canLayoff ? 'can-layoff' : '',
    compact ? 'is-compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const title = `${meldLabel(meld, lang)} · ${points}`;
  const body = (
    <>
      <span className="meld-head">
        <span className="meld-kind">{meldLabel(meld, lang)}</span>
        <span className="meld-score">{points}</span>
      </span>
      <span className="meld-cards">
        {meld.cards.map((item) => {
          const red = RED.has(item.card[1]);
          const laid = item.by !== meld.owner;
          return (
            <span
              key={item.card}
              className={`table-card ${red ? 'is-red' : ''} ${laid ? 'is-laid' : ''}`}
              title={laid ? `${cardFace(item.card)} · ${nameFor(item.by)}` : cardFace(item.card)}
            >
              <span className="tc-rank">{rankText(item.card)}</span>
              <span className="tc-suit">{suitSymbol(item.card)}</span>
              {laid && <span className="laid-dot" aria-hidden="true" />}
            </span>
          );
        })}
      </span>
      <span className="meld-owner">
        {nameFor(meld.owner)}
        {selectedCard && canLayoff ? <span className="meld-action">+</span> : null}
      </span>
    </>
  );

  if (onLayoff) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onLayoff}
        title={title}
        aria-label={`${title}${selectedCard ? ` · ${lang === 'zh' ? '可接牌' : 'lay off target'}` : ''}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={classes} title={title}>
      {body}
    </div>
  );
}

export function CardBackRow({ count }: { count: number }) {
  const shown = Math.min(Math.max(count, 0), 7);
  return (
    <span className="card-back-row" aria-hidden="true">
      {Array.from({ length: shown }).map((_, index) => (
        <span key={index} className="card-back-mini" style={{ left: `${index * 7}px` }} />
      ))}
    </span>
  );
}
