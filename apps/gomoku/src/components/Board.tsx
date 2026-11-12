import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CENTER, SIZE, colOf, indexOf, rowOf, type Cell } from '../game/gomoku';
import { t, type Lang } from '../i18n';

const STAR_POINTS = new Set([
  indexOf(3, 3),
  indexOf(3, 11),
  indexOf(7, 7),
  indexOf(11, 3),
  indexOf(11, 11),
]);

export function Stone({ mark, small = false }: { mark: Exclude<Cell, null>; small?: boolean }) {
  return (
    <span className={`stone stone-${mark.toLowerCase()}${small ? ' stone-small' : ''}`} aria-hidden="true">
      <span className="stone-shine" />
    </span>
  );
}

export function Board({
  board,
  line,
  last,
  hint,
  disabled,
  onCell,
  lang,
}: {
  board: Cell[];
  line: number[] | null;
  last: number | null;
  hint: number | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  lang: Lang;
}) {
  const [cursor, setCursor] = useState(CENTER);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    if (focusNext.current !== null) {
      refs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  }, [cursor]);

  const move = (row: number, col: number) => {
    const next = indexOf(
      Math.max(0, Math.min(SIZE - 1, row)),
      Math.max(0, Math.min(SIZE - 1, col)),
    );
    focusNext.current = next;
    setCursor(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = rowOf(cursor);
    const col = colOf(cursor);
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(row - 1, col);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(row + 1, col);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(row, col - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(row, col + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(SIZE - 1, SIZE - 1);
    }
  };

  return (
    <div
      className={`board${disabled ? ' is-locked' : ''}`}
      role="grid"
      aria-label={t(lang, 'boardLabel')}
      aria-rowcount={SIZE}
      aria-colcount={SIZE}
      onKeyDown={onKeyDown}
    >
      {board.map((cell, index) => {
        const winning = line?.includes(index) ?? false;
        const classes = [
          'cell',
          STAR_POINTS.has(index) ? 'star-point' : '',
          cell ? `has-${cell.toLowerCase()}` : '',
          winning ? 'winning' : '',
          last === index ? 'last' : '',
          hint === index ? 'hint' : '',
          index === cursor ? 'cursor' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const player = cell ? t(lang, cell === 'B' ? 'playerBlack' : 'playerWhite') : '';
        const label = cell
          ? t(lang, 'pointFilled', { row: rowOf(index) + 1, col: colOf(index) + 1, player })
          : t(lang, 'pointEmpty', { row: rowOf(index) + 1, col: colOf(index) + 1 });
        return (
          <button
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="gridcell"
            className={classes}
            aria-label={label}
            aria-disabled={disabled || Boolean(cell)}
            aria-rowindex={rowOf(index) + 1}
            aria-colindex={colOf(index) + 1}
            tabIndex={disabled ? -1 : index === cursor ? 0 : -1}
            onFocus={() => setCursor(index)}
            onClick={() => {
              setCursor(index);
              if (!disabled && !cell) onCell(index);
            }}
          >
            {cell ? <Stone mark={cell} /> : <span className="cell-ghost" aria-hidden="true" />}
            {hint === index && <span className="hint-ring" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
