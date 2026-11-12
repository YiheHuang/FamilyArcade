import type { Meld, Tile } from '../game/mahjong';
import { tileKey } from '../game/mahjong';
import { seatPositionName, t, tileName, windName, type Lang } from '../i18n';

export function tileFaceText(lang: Lang, tile: Tile): { rank: string; suit: string } {
  if (tile.suit === 'z') {
    if (tile.rank <= 4) {
      const letters = ['E', 'S', 'W', 'N'];
      const wind = windName(lang, tile.rank);
      return {
        rank: lang === 'zh' ? wind : letters[Math.max(0, Math.min(3, tile.rank - 1))],
        suit: '',
      };
    }
    const dragon = tile.rank === 5 ? '中' : tile.rank === 6 ? '發' : '白';
    return { rank: dragon, suit: '' };
  }
  const suit = tile.suit === 'm' ? '萬' : tile.suit === 'p' ? '筒' : '條';
  return { rank: String(tile.rank), suit };
}

export function TileFace({
  lang,
  tile,
  small = false,
  selected = false,
  hint = false,
  last = false,
}: {
  lang: Lang;
  tile: Tile;
  small?: boolean;
  selected?: boolean;
  hint?: boolean;
  last?: boolean;
}) {
  const face = tileFaceText(lang, tile);
  const classes = [
    'tile-face',
    `tile-${tile.suit}`,
    small ? 'tile-small' : '',
    selected ? 'is-selected' : '',
    hint ? 'is-hint' : '',
    last ? 'is-last' : '',
    tile.suit === 'z' ? 'tile-honour' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <span className="tile-rank">{face.rank}</span>
      <span className="tile-suit">{face.suit}</span>
    </span>
  );
}

export function HandTile({
  lang,
  tile,
  index,
  selected,
  hint,
  disabled,
  onSelect,
}: {
  lang: Lang;
  tile: Tile;
  index: number;
  selected: boolean;
  hint: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`hand-tile ${selected ? 'selected' : ''} ${hint ? 'hint' : ''}`}
      data-tile={tileKey(tile)}
      data-index={index}
      aria-label={tileName(lang, tile)}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <TileFace lang={lang} tile={tile} selected={selected} hint={hint} />
      <span className="hand-index" aria-hidden="true">
        {index < 9 ? index + 1 : index === 9 ? 0 : ''}
      </span>
    </button>
  );
}

export function TileBack({ small = false }: { small?: boolean }) {
  return <span className={`tile-back ${small ? 'tile-back-small' : ''}`} aria-hidden="true" />;
}

export function MeldGroup({
  lang,
  meld,
  compact = false,
}: {
  lang: Lang;
  meld: Meld;
  compact?: boolean;
}) {
  const labels: Record<Meld['kind'], string> =
    lang === 'zh'
      ? { chi: '吃', peng: '碰', kong: '杠', 'concealed-kong': '暗', 'added-kong': '加' }
      : { chi: 'C', peng: 'P', kong: 'K', 'concealed-kong': 'C', 'added-kong': 'A' };
  const titles: Record<Meld['kind'], string> =
    lang === 'zh'
      ? { chi: '吃', peng: '碰', kong: '杠', 'concealed-kong': '暗杠', 'added-kong': '加杠' }
      : { chi: 'Chow', peng: 'Pong', kong: 'Kong', 'concealed-kong': 'Concealed kong', 'added-kong': 'Added kong' };
  return (
    <span
      className={`meld meld-${meld.kind} ${compact ? 'compact' : ''}`}
      title={titles[meld.kind]}
    >
      <span className="meld-label" aria-hidden="true">
        {labels[meld.kind]}
      </span>
      <span className="meld-tiles">
        {meld.tiles.map((tile, index) => (
          <TileFace
            key={`${tileKey(tile)}-${index}`}
            lang={lang}
            tile={tile}
            small={compact}
          />
        ))}
      </span>
    </span>
  );
}

export function SeatPanel({
  lang,
  seat,
  name,
  wind,
  dealer,
  active,
  handCount,
  melds,
  isAI,
  isYou,
  compact = false,
}: {
  lang: Lang;
  seat: number;
  name: string;
  wind: number;
  dealer: boolean;
  active: boolean;
  handCount: number;
  melds: Meld[];
  isAI: boolean;
  isYou: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`seat-panel seat-${seat} ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}>
      <div className="seat-head">
        <span className="seat-name">
          {isYou ? <span className="seat-you">{name}</span> : name}
          {isAI ? <span className="seat-ai" aria-hidden="true" /> : null}
        </span>
        <span className="seat-meta">
          {dealer ? (
            <span className="dealer-badge" title={t(lang, 'dealer')}>
              {lang === 'zh' ? '庄' : 'D'}
            </span>
          ) : null}
          <span className="wind-badge">{windName(lang, wind)}</span>
        </span>
      </div>
      <div className="seat-backs" aria-label={`${handCount} ${t(lang, 'handLabel')}`}>
        {Array.from({ length: Math.min(handCount, 14) }).map((_, index) => (
          <TileBack key={index} small />
        ))}
        {handCount > 14 ? <span className="seat-extra">+{handCount - 14}</span> : null}
      </div>
      {melds.length > 0 ? (
        <div className="seat-melds">
          {melds.map((meld, index) => (
            <MeldGroup key={index} lang={lang} meld={meld} compact />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function River({
  lang,
  discards,
  last,
  compact = false,
}: {
  lang: Lang;
  discards: { seat: number; tile: Tile; claimed: boolean; last: boolean }[];
  last: { seat: number; tile: Tile; last: boolean } | null;
  compact?: boolean;
}) {
  return (
    <div className={`river ${compact ? 'compact' : ''}`} data-testid="river" data-count={discards.length}>
      {[0, 1, 2, 3].map((seat) => {
        const items = discards.filter((discard) => discard.seat === seat);
        return (
          <div className={`river-seat river-${seat}`} key={seat}>
            <span className="river-label">{seatPositionName(lang, seat)}</span>
            <span className="river-tiles">
              {items.map((discard, index) => {
                const isLast =
                  last?.seat === seat &&
                  last.tile.suit === discard.tile.suit &&
                  last.tile.rank === discard.tile.rank &&
                  index === items.length - 1;
                return (
                  <span
                    key={`${tileKey(discard.tile)}-${index}`}
                    className={`river-tile ${discard.claimed ? 'claimed' : ''} ${isLast ? 'last' : ''}`}
                    title={tileName(lang, discard.tile)}
                  >
                    <TileFace lang={lang} tile={discard.tile} small={compact} last={isLast} />
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
