import type { Cell } from '../game/guandan';

export function MarkGlyph({ mark }: { mark: Exclude<Cell, null> }) {
  return <span className={`mark mark-${mark.toLowerCase()}`} aria-hidden="true" />;
}

export function Board({
  board,
  line,
  last,
  hint,
  disabled,
  onCell,
}: {
  board: Cell[];
  line: number[] | null;
  last: number | null;
  hint: number | null;
  disabled?: boolean;
  onCell: (index: number) => void;
}) {
  return (
    <div className="board" role="grid" aria-label="Guandan board">
      {board.map((cell, index) => {
        const winning = line?.includes(index) ?? false;
        const classes = [
          'cell',
          cell ? `has-${cell.toLowerCase()}` : '',
          winning ? 'winning' : '',
          last === index ? 'last' : '',
          hint === index ? 'hint' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={classes}
            aria-label={`Square ${index + 1}${cell ? `, ${cell}` : ', empty'}`}
            disabled={disabled || Boolean(cell)}
            onClick={() => onCell(index)}
          >
            {cell ? <MarkGlyph mark={cell} /> : <span className="cell-number">{index + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}
