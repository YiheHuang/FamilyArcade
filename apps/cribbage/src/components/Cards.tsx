import { isRed, rankOf, suitOf, type Card } from '../game/cribbage';
import type { Lang } from '../i18n';

const SUIT_GLYPH = ['♣', '♦', '♥', '♠'];
const SUIT_EN = ['clubs', 'diamonds', 'hearts', 'spades'];
const SUIT_ZH = ['梅花', '方块', '红桃', '黑桃'];

export function rankLabel(card: Card, lang: Lang): string {
  const rank = rankOf(card);
  if (lang === 'zh') return String(rank);
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function suitGlyph(card: Card): string {
  return SUIT_GLYPH[suitOf(card)] ?? '♣';
}

function rankName(card: Card, lang: Lang): string {
  const rank = rankOf(card);
  if (lang === 'zh') return String(rank);
  if (rank === 1) return 'Ace';
  if (rank === 11) return 'Jack';
  if (rank === 12) return 'Queen';
  if (rank === 13) return 'King';
  return String(rank);
}

export function cardAria(card: Card, lang: Lang): string {
  const suit = (lang === 'zh' ? SUIT_ZH : SUIT_EN)[suitOf(card)] ?? '';
  return lang === 'zh' ? `${suit} ${rankName(card, lang)}` : `${rankName(card, lang)} of ${suit}`;
}

export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b));
}

export function PlayingCard({
  card,
  lang,
  selected,
  dim,
  hinted,
  small,
  onClick,
  disabled,
  label,
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  dim?: boolean;
  hinted?: boolean;
  small?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const classes = [
    'playing-card',
    isRed(card) ? 'is-red' : 'is-black',
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : '',
    hinted ? 'is-hinted' : '',
    small ? 'is-small' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label ?? cardAria(card, lang)}
      aria-pressed={selected}
    >
      <span className="card-corner">
        <b>{rankLabel(card, lang)}</b>
        <i>{suitGlyph(card)}</i>
      </span>
      <span className="card-pip">{suitGlyph(card)}</span>
      <span className="card-corner card-corner-bottom">
        <b>{rankLabel(card, lang)}</b>
        <i>{suitGlyph(card)}</i>
      </span>
    </button>
  );
}

export function CardBack({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span
      className={`card-back ${small ? 'is-small' : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span />
    </span>
  );
}

export function Hand({
  cards,
  lang,
  selected = [],
  legal,
  hinted = [],
  onCard,
  disabled,
  small,
}: {
  cards: Card[];
  lang: Lang;
  selected?: Card[];
  legal?: Card[];
  hinted?: Card[];
  onCard?: (card: Card) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const sorted = sortHand(cards);
  return (
    <div className={`hand ${small ? 'hand-small' : ''}`}>
      {sorted.map((card) => {
        const isLegal = legal ? legal.includes(card) : true;
        return (
          <PlayingCard
            key={card}
            card={card}
            lang={lang}
            small={small}
            selected={selected.includes(card)}
            dim={!isLegal}
            hinted={hinted.includes(card)}
            onClick={onCard ? () => onCard(card) : undefined}
            disabled={disabled || !isLegal}
          />
        );
      })}
    </div>
  );
}

export function CardRow({
  cards,
  lang,
  small,
  highlight,
}: {
  cards: Card[];
  lang: Lang;
  small?: boolean;
  highlight?: Card | null;
}) {
  return (
    <div className={`card-row ${small ? 'card-row-small' : ''}`}>
      {cards.map((card, index) => (
        <PlayingCard
          key={`${card}-${index}`}
          card={card}
          lang={lang}
          small={small}
          hinted={highlight === card}
        />
      ))}
    </div>
  );
}
