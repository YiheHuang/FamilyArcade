import type { CSSProperties } from 'react';
import {
  POINTS,
  moveDestinations,
  type Cell,
  type Move,
  type Player,
} from '../game/abalone';
import { t, type Lang } from '../i18n';

export function Marble({ color, small }: { color: Player; small?: boolean }) {
  return (
    <span
      className={`marble marble-${color.toLowerCase()}${small ? ' marble-small' : ''}`}
      aria-hidden="true"
    />
  );
}

export function MarkGlyph({ mark }: { mark: Player }) {
  return <Marble color={mark} />;
}

export function Board({
  board,
  selected,
  targets,
  last,
  hint,
  disabled,
  onPoint,
  lang,
  preview,
}: {
  board: Cell[];
  selected?: number[];
  targets?: Map<number, Move>;
  last?: Move | null;
  hint?: Move | null;
  disabled?: boolean;
  onPoint?: (index: number) => void;
  lang: Lang;
  preview?: boolean;
}) {
  const selectedSet = new Set(selected ?? []);
  const lastSources = new Set(last?.cells ?? []);
  const lastTargets = new Set(last ? moveDestinations(last) : []);
  const hintSources = new Set(hint?.cells ?? []);
  const hintTargets = new Set(hint ? moveDestinations(hint) : []);

  return (
    <div
      className={`ab-board${preview ? ' ab-board-preview' : ''}`}
      role="grid"
      aria-label={t(lang, 'title')}
    >
      <span className="ab-board-back" aria-hidden="true" />
      {POINTS.map((point) => {
        const cell = board[point.index];
        const isSelected = selectedSet.has(point.index);
        const isTarget = targets?.has(point.index) ?? false;
        const classes = [
          'ab-point',
          cell ? `has-${cell.toLowerCase()}` : 'empty',
          isSelected ? 'selected' : '',
          isTarget ? 'target' : '',
          lastSources.has(point.index) ? 'last-source' : '',
          lastTargets.has(point.index) ? 'last-target' : '',
          hintSources.has(point.index) ? 'hint-source' : '',
          hintTargets.has(point.index) ? 'hint-target' : '',
        ]
          .filter(Boolean)
          .join(' ');

        let label = t(lang, cell ? 'marbleLabel' : 'emptyPoint', {
          n: point.index + 1,
          color: cell ? t(lang, cell === 'B' ? 'black' : 'white') : '',
        });
        if (isSelected) label = t(lang, 'selectedPoint', { n: point.index + 1 });
        if (isTarget) label = t(lang, 'targetPoint', { n: point.index + 1 });

        return (
          <button
            key={point.index}
            type="button"
            role="gridcell"
            className={classes}
            style={{ '--x': point.x, '--y': point.y } as CSSProperties}
            data-index={point.index}
            data-color={cell ?? ''}
            aria-label={label}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onPoint?.(point.index)}
          >
            {cell ? <Marble color={cell} /> : null}
            {!cell && isTarget ? <span className="target-dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
