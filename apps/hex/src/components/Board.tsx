import { useRef, useState } from 'react';
import { SIZE, colOf, rowOf, type Cell } from '../game/hex';
import { t, type Lang } from '../i18n';

interface BoardProps {
  board: Cell[];
  path: number[] | null;
  last: number | null;
  hint: number | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  lang: Lang;
}

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function Board({ board, path, last, hint, disabled, onCell, lang }: BoardProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const firstEmpty = board.findIndex((cell) => cell === null);
  const tabStop = board[focusIndex] === null ? focusIndex : firstEmpty;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = ARROWS[event.key];
    if (!delta || disabled) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-index]');
    if (!button) return;
    const from = Number(button.dataset.index);
    let row = rowOf(from);
    let col = colOf(from);
    let target = -1;
    for (let step = 0; step < SIZE; step++) {
      row += delta[0];
      col += delta[1];
      if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) break;
      const candidate = row * SIZE + col;
      if (board[candidate] === null) {
        target = candidate;
        break;
      }
    }
    if (target >= 0) {
      event.preventDefault();
      setFocusIndex(target);
      refs.current[target]?.focus();
    }
  };

  return (
    <div className="board-stage">
      <span className="edge-label edge-label-n" aria-hidden="true">
        {t(lang, 'redSide')} ↓
      </span>
      <span className="edge-label edge-label-s" aria-hidden="true">
        ↑ {t(lang, 'redSide')}
      </span>
      <span className="edge-label edge-label-w" aria-hidden="true">
        {t(lang, 'blueSide')} →
      </span>
      <span className="edge-label edge-label-e" aria-hidden="true">
        ← {t(lang, 'blueSide')}
      </span>
      <div className="hex-board" role="grid" aria-label={t(lang, 'boardLabel')} onKeyDown={onKeyDown}>
        {board.map((cell, index) => {
          const row = rowOf(index);
          const col = colOf(index);
          const edges = [
            row === 0 ? 'edge-n' : '',
            row === SIZE - 1 ? 'edge-s' : '',
            col === 0 ? 'edge-w' : '',
            col === SIZE - 1 ? 'edge-e' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const winning = path?.includes(index) ?? false;
          const classes = [
            'hex-cell',
            cell === 'R' ? 'has-red' : '',
            cell === 'B' ? 'has-blue' : '',
            edges,
            winning ? 'winning' : '',
            last === index ? 'last' : '',
            hint === index ? 'hint' : '',
            focusIndex === index ? 'focused' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label = cell
            ? t(lang, cell === 'R' ? 'cellRed' : 'cellBlue', { row: row + 1, col: col + 1 })
            : t(lang, 'cellEmpty', { row: row + 1, col: col + 1 });
          return (
            <button
              key={index}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="gridcell"
              data-index={index}
              data-player={cell ?? ''}
              tabIndex={index === tabStop ? 0 : -1}
              className={classes}
              style={{
                left: `${((col + row / 2 - 0.5) / 16) * 100}%`,
                top: `${((row * 1.5 - 1) / 17) * 100}%`,
              }}
              aria-label={label}
              title={`${row + 1} · ${col + 1}`}
              disabled={disabled || Boolean(cell)}
              onFocus={() => setFocusIndex(index)}
              onClick={() => onCell(index)}
            >
              <span className="hex-face" aria-hidden="true">
                <span className="hex-gem" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
