import { useRef, useState, type KeyboardEvent } from 'react';
import { coord, type Cell, type Disc } from '../game/flip';

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function DiscGlyph({ disc }: { disc: Disc }) {
  return <span className={`disc disc-${disc.toLowerCase()}`} aria-hidden="true" />;
}

export function Board({
  board,
  legal,
  last,
  hint,
  disabled,
  onCell,
  label,
  describe,
}: {
  board: Cell[];
  legal: number[];
  last: number | null;
  hint: number | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  label: string;
  describe: (index: number, cell: Cell, legal: boolean) => string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(63, index));
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const row = Math.floor(index / 8);
    const col = index % 8;
    let next: number | null = null;
    if (event.key === 'ArrowUp') next = row > 0 ? index - 8 : index;
    else if (event.key === 'ArrowDown') next = row < 7 ? index + 8 : index;
    else if (event.key === 'ArrowLeft') next = col > 0 ? index - 1 : index;
    else if (event.key === 'ArrowRight') next = col < 7 ? index + 1 : index;
    else if (event.key === 'Home') next = row * 8;
    else if (event.key === 'End') next = row * 8 + 7;
    if (next !== null) {
      event.preventDefault();
      moveFocus(next);
    }
  };

  return (
    <div className="board-frame">
      <div className="board-grid-wrap">
        <span className="corner-label" aria-hidden="true" />
        <div className="col-labels" aria-hidden="true">
          {COLUMNS.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <div className="row-labels" aria-hidden="true">
          {ROWS.map((row) => (
            <span key={row}>{row}</span>
          ))}
        </div>
        <div className="board" role="grid" aria-label={label}>
          {board.map((cell, index) => {
            const isLegal = legal.includes(index);
            const classes = [
              'cell',
              cell ? `has-${cell.toLowerCase()}` : '',
              isLegal ? 'legal' : '',
              last === index ? 'last' : '',
              hint === index ? 'hint' : '',
              disabled ? 'is-disabled' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={index}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                type="button"
                role="gridcell"
                aria-rowindex={Math.floor(index / 8) + 1}
                aria-colindex={(index % 8) + 1}
                aria-label={describe(index, cell, isLegal)}
                aria-disabled={disabled || Boolean(cell)}
                tabIndex={disabled ? -1 : focusIndex === index ? 0 : -1}
                data-cell={index}
                data-coord={coord(index)}
                className={classes}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  if (!disabled && !cell) onCell(index);
                }}
              >
                {cell ? (
                  <DiscGlyph disc={cell} />
                ) : isLegal ? (
                  <span className="legal-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
