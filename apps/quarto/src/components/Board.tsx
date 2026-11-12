import {
  attributeValueName,
  pieceAriaLabel,
  t,
  type Lang,
} from '../i18n';
import type { Cell, Player } from '../game/quarto';

export function Piece({ piece }: { piece: number }) {
  const shade = piece & 1 ? 'dark' : 'light';
  const shape = (piece >> 1) & 1 ? 'square' : 'round';
  const height = (piece >> 2) & 1 ? 'tall' : 'short';
  const top = (piece >> 3) & 1 ? 'hollow' : 'solid';
  return (
    <span
      className={`piece shade-${shade} shape-${shape} height-${height} top-${top}`}
      aria-hidden="true"
    >
      <span className="piece-body">
        <span className="piece-cap" />
        <span className="piece-sheen" />
      </span>
    </span>
  );
}

export function PlayerDot({
  player,
  size = 'md',
}: {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`player-dot p${player + 1} ${size}`} aria-hidden="true">
      {player + 1}
    </span>
  );
}

export function PieceTags({ piece, lang }: { piece: number; lang: Lang }) {
  return (
    <div className="attr-tags">
      {[0, 1, 2, 3].map((attribute) => (
        <span className="attr-tag" key={attribute}>
          {attributeValueName(lang, attribute, ((piece >> attribute) & 1) as 0 | 1)}
        </span>
      ))}
    </div>
  );
}

export function Board({
  board,
  line,
  last,
  hint,
  interactive,
  onCell,
  lang,
}: {
  board: Cell[];
  line: number[] | null;
  last: number | null;
  hint: number | null;
  interactive: boolean;
  onCell: (index: number) => void;
  lang: Lang;
}) {
  return (
    <div className="board" role="grid" aria-label={t(lang, 'boardAria')}>
      {board.map((cell, index) => {
        const row = Math.floor(index / 4) + 1;
        const col = (index % 4) + 1;
        const winning = line?.includes(index) ?? false;
        const classes = [
          'cell',
          cell === null ? 'empty-cell' : 'has-piece',
          winning ? 'winning' : '',
          last === index ? 'last' : '',
          hint === index ? 'hint' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const stateLabel =
          cell === null ? t(lang, 'empty') : pieceAriaLabel(lang, cell);
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={classes}
            data-cell={index}
            aria-label={t(lang, 'cellAria', { row, col, state: stateLabel })}
            disabled={!interactive || cell !== null}
            onClick={() => onCell(index)}
          >
            {cell === null ? (
              <span className="cell-hole" aria-hidden="true" />
            ) : (
              <Piece piece={cell} />
            )}
          </button>
        );
      })}
    </div>
  );
}
