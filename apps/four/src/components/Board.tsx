import { COLS, ROWS, dropRow, indexAt, type Cell, type Disc } from '../game/four';

export function DiscGlyph({ disc, small = false }: { disc: Disc; small?: boolean }) {
  return <span className={`disc disc-${disc.toLowerCase()}${small ? ' disc-small' : ''}`} aria-hidden="true" />;
}

export function Board({
  board,
  line,
  last,
  hint,
  turn,
  disabled,
  onColumn,
  label,
  columnLabel,
}: {
  board: Cell[];
  line: number[] | null;
  last: number | null;
  hint: number | null;
  turn: Disc;
  disabled?: boolean;
  onColumn: (column: number) => void;
  label: string;
  columnLabel: (column: number) => string;
}) {
  return (
    <div className={`board turn-${turn.toLowerCase()}`} role="group" aria-label={label}>
      {Array.from({ length: COLS }, (_, col) => {
        const landing = dropRow(board, col);
        const full = landing < 0;
        return (
          <button
            key={col}
            type="button"
            className={`col${hint === col ? ' hint' : ''}${full ? ' full' : ''}`}
            aria-label={columnLabel(col)}
            disabled={disabled || full}
            onClick={() => onColumn(col)}
          >
            {Array.from({ length: ROWS }, (_, row) => {
              const index = indexAt(row, col);
              const cell = board[index];
              const classes = [
                'slot',
                cell ? `has-${cell.toLowerCase()}` : 'empty',
                landing === row && !cell ? 'landing' : '',
                line?.includes(index) ? 'winning' : '',
                last === index ? 'last' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <span key={row} className={classes}>
                  {cell ? <DiscGlyph disc={cell} /> : row === 0 ? <span className="col-key">{col + 1}</span> : null}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}
