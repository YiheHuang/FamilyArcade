import type { CSSProperties } from 'react';
import { dessert, PLAYER_COLORS } from '../desserts';
import { t, type Lang } from '../i18n';
import { initial } from '../ui';

export interface BoardTile {
  value: number | null;
  matchedBy: number | null;
}

export function Board({
  tiles,
  size,
  flipped,
  hint,
  disabled,
  onFlip,
  names,
  lang,
  label,
}: {
  tiles: BoardTile[];
  size: number;
  flipped: readonly number[];
  hint: readonly number[];
  disabled?: boolean;
  onFlip: (index: number) => void;
  names: readonly string[];
  lang: Lang;
  label: string;
}) {
  return (
    <div
      className={`tile-grid size-${size}`}
      style={{ '--n': size } as CSSProperties}
      role="grid"
      aria-label={label}
    >
      {tiles.map((tile, index) => {
        const open = tile.value !== null;
        const matched = tile.matchedBy !== null;
        const owner = tile.matchedBy;
        const ownerName = owner !== null ? names[owner] ?? `P${owner + 1}` : '';
        const food = tile.value !== null ? dessert(tile.value, lang) : null;
        const blocked = Boolean(disabled) || matched || flipped.includes(index);
        const classes = [
          'tile',
          open ? 'face-up' : 'face-down',
          matched ? 'matched' : '',
          flipped.includes(index) && !matched ? 'showing' : '',
          hint.includes(index) ? 'hint' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const aria = matched && food
          ? t(lang, 'matchedCard', { name: food.name, player: ownerName })
          : food
            ? t(lang, 'openCard', { name: food.name })
            : t(lang, 'faceDown', { n: index + 1 });
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            data-index={index}
            className={classes}
            aria-label={aria}
            aria-pressed={open}
            disabled={blocked}
            onClick={() => onFlip(index)}
            style={
              owner !== null
                ? ({ '--owner': PLAYER_COLORS[owner % PLAYER_COLORS.length] } as CSSProperties)
                : undefined
            }
          >
            <span className="tile-inner" aria-hidden="true">
              <span className="tile-face tile-back">
                <span className="tile-back-mark">27</span>
              </span>
              <span className="tile-face tile-front">
                {food ? <span className="tile-emoji">{food.emoji}</span> : null}
              </span>
            </span>
            {matched && owner !== null ? (
              <span className="tile-owner" title={ownerName}>
                {initial(ownerName)}
              </span>
            ) : null}
            {hint.includes(index) && !matched ? <span className="tile-hint-ring" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
