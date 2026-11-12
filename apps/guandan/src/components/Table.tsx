import type { CSSProperties } from 'react';
import { t, type Lang } from '../i18n';
import {
  BIG_JOKER,
  SMALL_JOKER,
  type Card,
  type Combo,
  type Team,
  cardPower,
  rankLabel,
  sequenceLabel,
  suitSymbol,
} from '../game/guandan';

function suitKey(suit: Card['suit']) {
  return suit === 'S'
    ? 'suitSpades'
    : suit === 'H'
      ? 'suitHearts'
      : suit === 'D'
        ? 'suitDiamonds'
        : 'suitClubs';
}

function jokerLabel(card: Card, lang: Lang): string {
  return card.rank === BIG_JOKER ? t(lang, 'jokerBig') : t(lang, 'jokerSmall');
}

function cardLabel(card: Card, lang: Lang, level: number, wild: boolean): string {
  if (card.rank >= SMALL_JOKER) {
    return t(lang, 'cardAriaJoker', { rank: jokerLabel(card, lang) });
  }
  const suit = t(lang, suitKey(card.suit));
  if (wild) return t(lang, 'cardAriaWild', { rank: rankLabel(card.rank), suit });
  if (card.rank === level) return t(lang, 'cardAriaLevel', { rank: rankLabel(card.rank), suit });
  return t(lang, 'cardAria', { rank: rankLabel(card.rank), suit });
}

export function PlayingCard({
  card,
  lang,
  level,
  selected = false,
  hinted = false,
  disabled = false,
  compact = false,
  onClick,
  index = 0,
}: {
  card: Card;
  lang: Lang;
  level: number;
  selected?: boolean;
  hinted?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const wild = card.suit === 'H' && card.rank === level;
  const isLevel = card.rank === level;
  const joker = card.rank >= SMALL_JOKER;
  const classes = [
    'playing-card',
    `suit-${card.suit}`,
    selected ? 'selected' : '',
    hinted ? 'hint' : '',
    compact ? 'compact' : '',
    wild ? 'is-wild' : '',
    isLevel ? 'is-level' : '',
    joker ? 'is-joker' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--card-index': index } as CSSProperties;
  const label = cardLabel(card, lang, level, wild);
  const face = joker ? (
    <>
      <span className="card-rank">{card.rank === BIG_JOKER ? t(lang, 'jokerShortBig') : t(lang, 'jokerShortSmall')}</span>
      <span className="card-joker" aria-hidden="true">{card.rank === BIG_JOKER ? '★' : '☆'}</span>
      <span className="card-rank foot">{card.rank === BIG_JOKER ? t(lang, 'jokerShortBig') : t(lang, 'jokerShortSmall')}</span>
    </>
  ) : (
    <>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className={`card-suit suit-mark-${card.suit}`}>{suitSymbol(card.suit)}</span>
      <span className="card-rank foot">{rankLabel(card.rank)}</span>
    </>
  );
  const flags = wild ? (
    <span className="card-flag wild">{t(lang, 'wildShort')}</span>
  ) : isLevel ? (
    <span className="card-flag level">{t(lang, 'levelShort')}</span>
  ) : null;
  const content = (
    <>
      {face}
      {flags}
    </>
  );
  const data = {
    'data-card': card.id,
    'data-power': cardPower(card, level),
    'data-rank': card.rank,
    'data-suit': card.suit,
  } as const;
  if (!onClick) {
    return (
      <span className={classes} style={style} aria-label={label} {...data}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      style={style}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      {...data}
    >
      {content}
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

export function TeamBadge({ team, lang, short = false }: { team: Team; lang: Lang; short?: boolean }) {
  return (
    <span className={`team-badge team-${team}`}>
      {short
        ? team === 0
          ? t(lang, 'teamShortNS')
          : t(lang, 'teamShortEW')
        : team === 0
          ? t(lang, 'teamNS')
          : t(lang, 'teamEW')}
    </span>
  );
}

export function LevelLadder({
  levels,
  current,
  lang,
}: {
  levels: [number, number];
  current: number;
  lang: Lang;
}) {
  const steps = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  return (
    <div className="level-ladder" aria-label={t(lang, 'levelLadder')}>
      {([0, 1] as const).map((team) => (
        <div className={`ladder-row ladder-team-${team}`} key={team}>
          <span className="ladder-name">
            {team === 0 ? t(lang, 'teamShortNS') : t(lang, 'teamShortEW')}
          </span>
          <div className="ladder-steps">
            {steps.map((step) => (
              <span
                key={step}
                className={[
                  'ladder-step',
                  step <= levels[team] ? 'reached' : '',
                  step === levels[team] ? 'team-current' : '',
                  step === current ? 'table-current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={t(lang, 'levelN', { rank: rankLabel(step) })}
              >
                {rankLabel(step)}
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="ladder-note">
        {t(lang, 'currentLevel')} · {rankLabel(current)}
      </p>
    </div>
  );
}

export function comboLabel(lang: Lang, combo: Combo): string {
  const rank = combo.rank === 15 ? t(lang, 'comboLevel') : rankLabel(combo.rank);
  switch (combo.type) {
    case 'single':
      return t(lang, 'comboSingle', { rank });
    case 'pair':
      return t(lang, 'comboPair', { rank });
    case 'triple':
      return t(lang, 'comboTriple', { rank });
    case 'full-house': {
      const triple = combo.rank === 15 ? t(lang, 'comboLevel') : rankLabel(combo.rank);
      const pair =
        combo.pairRank === 15 ? t(lang, 'comboLevel') : rankLabel(combo.pairRank ?? 0);
      return t(lang, 'comboFullHouse', { triple, pair });
    }
    case 'straight':
      return t(lang, 'comboStraight', { range: sequenceLabel(combo.low, combo.high) });
    case 'pair-chain':
      return t(lang, 'comboPairChain', { range: sequenceLabel(combo.low, combo.high) });
    case 'triple-chain':
      return t(lang, 'comboTripleChain', { range: sequenceLabel(combo.low, combo.high) });
    case 'bomb':
      return t(lang, 'comboBomb', { n: combo.size, rank });
    case 'straight-flush':
      return t(lang, 'comboStraightFlush', { range: sequenceLabel(combo.low, combo.high) });
    case 'joker-bomb':
      return t(lang, 'comboJokerBomb');
    default:
      return '';
  }
}

export function PlayerSeat({
  name,
  seat,
  team,
  count,
  turn,
  finished,
  passed,
  place,
  lastText,
  isYou,
  thinking,
  isPartner,
  lang,
}: {
  name: string;
  seat: number;
  team: Team;
  count: number;
  turn: boolean;
  finished: boolean;
  passed: boolean;
  place: number | null;
  lastText: string;
  isYou: boolean;
  thinking: boolean;
  isPartner: boolean;
  lang: Lang;
}) {
  const out = finished;
  const classes = [
    'seat',
    `seat-${seat}`,
    turn ? 'is-turn' : '',
    out ? 'is-out' : '',
    passed ? 'is-passed' : '',
    isYou ? 'is-you' : '',
    isPartner ? 'is-partner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={classes} data-seat={seat} data-team={team}>
      <div className="seat-top">
        <span className="seat-avatar" aria-hidden="true">
          {out && place ? place : seat + 1}
        </span>
        <div className="seat-name">
          <strong>{name}</strong>
          <span className="seat-meta">
            <TeamBadge team={team} lang={lang} short />
            {isPartner && <span className="partner-mark">{t(lang, 'partner')}</span>}
            <span>
              {out && place
                ? `#${place} · ${t(lang, 'cardsLeft', { n: count })}`
                : t(lang, 'cardsLeft', { n: count })}
            </span>
          </span>
        </div>
        <CardBack count={count} small />
      </div>
      <div className="seat-bottom">
        <span className={`seat-state ${passed ? 'passed' : ''}`}>
          {out ? t(lang, 'finishedOrderShort', { n: place ?? 0 }) : passed ? t(lang, 'pass') : lastText}
        </span>
        {thinking && <span className="thinking-dots" aria-hidden="true">…</span>}
        {turn && <span className="turn-dot" aria-hidden="true" />}
      </div>
    </article>
  );
}

export function PrivacyGate({
  name,
  lang,
  partner,
  onReveal,
}: {
  name: string;
  lang: Lang;
  partner: string;
  onReveal: () => void;
}) {
  return (
    <section className="privacy-gate" aria-live="polite">
      <span className="gate-icon" aria-hidden="true">✦</span>
      <span className="gate-kicker">{t(lang, 'hotSeat')}</span>
      <strong>{t(lang, 'privacyTo', { name })}</strong>
      <p>{t(lang, 'privacyHint')}</p>
      <p className="gate-partner">
        {t(lang, 'partner')} · {partner}
      </p>
      <button className="primary reveal-button" onClick={onReveal}>
        {t(lang, 'reveal')}
      </button>
    </section>
  );
}
