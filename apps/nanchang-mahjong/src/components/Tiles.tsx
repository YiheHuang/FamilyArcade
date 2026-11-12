import {
  isSpirit,
  spiritKind,
  suitGlyph,
  tileFace,
  tileLabel,
  type Meld,
  type SpiritInfo,
  type Tile,
} from '../game/nanchang-mahjong';
import { t, type Lang } from '../i18n';

export function TileButton({
  tile,
  spirit,
  lang,
  selected = false,
  hint = false,
  disabled = false,
  small = false,
  markSpirit = true,
  onClick,
  testId,
}: {
  tile: Tile;
  spirit: SpiritInfo;
  lang: Lang;
  selected?: boolean;
  hint?: boolean;
  disabled?: boolean;
  small?: boolean;
  markSpirit?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const kind = markSpirit ? spiritKind(tile, spirit) : null;
  const classes = [
    'tile',
    `tile-${tile[0]}`,
    `tile-${tile}`,
    small ? 'tile-small' : '',
    kind ? `tile-spirit-${kind}` : '',
    selected ? 'selected' : '',
    hint ? 'hint' : '',
    onClick ? 'tile-button' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = `${tileLabel(tile, lang)}${kind ? `, ${t(lang, kind === 'true' ? 'trueSpirit' : 'secondarySpirit')}` : ''}`;
  const inner = (
    <>
      {kind && <span className="spirit-mark" aria-hidden="true">{kind === 'true' ? '★' : '☆'}</span>}
      {tile[0] === 'z' ? (
        <span className="tile-honour">{tileFace(tile)}</span>
      ) : (
        <>
          <span className="tile-num">{tileFace(tile)}</span>
          <span className="tile-suit">{suitGlyph(tile)}</span>
        </>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        aria-label={label}
        aria-pressed={selected}
        data-tile={tile}
        data-spirit={kind ?? ''}
        data-testid={testId}
        disabled={disabled}
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }
  return (
    <span
      className={classes}
      aria-label={label}
      data-tile={tile}
      data-spirit={kind ?? ''}
      data-testid={testId}
    >
      {inner}
    </span>
  );
}

export function TileBack({ small = false }: { small?: boolean }) {
  return <span className={`tile-back ${small ? 'tile-back-small' : ''}`} aria-hidden="true" />;
}

export function Hand({
  tiles,
  spirit,
  lang,
  selected,
  hint,
  disabled,
  onSelect,
}: {
  tiles: Tile[];
  spirit: SpiritInfo;
  lang: Lang;
  selected: Tile | null;
  hint: Tile | null;
  disabled?: boolean;
  onSelect: (tile: Tile) => void;
}) {
  return (
    <div className="hand" data-testid="hand" role="group" aria-label={t(lang, 'hand')}>
      {tiles.map((tile, index) => (
        <TileButton
          key={`${tile}-${index}`}
          tile={tile}
          spirit={spirit}
          lang={lang}
          selected={selected === tile}
          hint={hint === tile}
          disabled={disabled}
          onClick={() => onSelect(tile)}
          testId={`hand-tile-${index}`}
        />
      ))}
    </div>
  );
}

export function MeldGroup({
  meld,
  spirit,
  lang,
}: {
  meld: Meld;
  spirit: SpiritInfo;
  lang: Lang;
}) {
  const label = meld.kind === 'chi' ? t(lang, 'chi') : meld.kind === 'peng' ? t(lang, 'peng') : t(lang, 'kong');
  return (
    <div className={`meld-group meld-${meld.kind}`} data-meld-id={meld.id} data-meld-kind={meld.kind}>
      <span className="meld-label">{label}</span>
      <div className="meld-tiles">
        {meld.tiles.map((tile, index) => (
          <TileButton
            key={`${tile}-${index}`}
            tile={tile}
            spirit={spirit}
            lang={lang}
            small
          />
        ))}
      </div>
    </div>
  );
}

export function Melds({
  melds,
  spirit,
  lang,
}: {
  melds: Meld[];
  spirit: SpiritInfo;
  lang: Lang;
}) {
  if (melds.length === 0) return null;
  return (
    <div className="melds">
      {melds.map((meld) => (
        <MeldGroup key={meld.id} meld={meld} spirit={spirit} lang={lang} />
      ))}
    </div>
  );
}

export function Discards({
  tiles,
  spirit,
  lang,
  last,
}: {
  tiles: Tile[];
  spirit: SpiritInfo;
  lang: Lang;
  last: boolean;
}) {
  return (
    <div className="discards" aria-label={t(lang, 'lastDiscard')}>
      {tiles.map((tile, index) => (
        <TileButton
          key={`${tile}-${index}`}
          tile={tile}
          spirit={spirit}
          lang={lang}
          small
          hint={last && index === tiles.length - 1}
        />
      ))}
    </div>
  );
}

export function HandBacks({ count }: { count: number }) {
  return (
    <div className="hand-backs" aria-hidden="true">
      {Array.from({ length: Math.min(count, 13) }, (_, index) => (
        <TileBack key={index} small />
      ))}
      {count > 13 && <span className="hand-count">+{count - 13}</span>}
    </div>
  );
}

export function SpiritBadge({ tile, spirit, lang }: { tile: Tile; spirit: SpiritInfo; lang: Lang }) {
  const kind = spiritKind(tile, spirit);
  if (!kind) return <span className="spirit-none">—</span>;
  return (
    <span className={`spirit-badge ${kind}`}>
      {t(lang, kind === 'true' ? 'trueSpirit' : 'secondarySpirit')}
    </span>
  );
}

export function isSpiritTile(tile: Tile, spirit: SpiritInfo): boolean {
  return isSpirit(tile, spirit);
}
