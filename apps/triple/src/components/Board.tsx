import { t, type Lang } from '../i18n';
import type { Cell } from '../game/triple';

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
  return (
    <div className="board" role="grid" aria-label={t(lang, 'boardLabel')}>
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
        const label = cell
          ? t(lang, 'squareFilled', { n: index + 1, mark: cell })
          : t(lang, 'squareEmpty', { n: index + 1 });
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={classes}
            aria-label={label}
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
