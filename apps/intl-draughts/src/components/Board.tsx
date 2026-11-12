import { t, type Lang } from '../i18n';
import {
  colOf,
  isDarkSquare,
  isKing,
  rowOf,
  type Move,
  type Piece,
} from '../game/intl-draughts';

function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.8 8.4 8.4 11 12 4.8 15.6 11l4.6-2.6-1.7 9.3H5.5L3.8 8.4Z" fill="currentColor" />
      <rect x="5.8" y="19" width="12.4" height="2.1" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PieceDisc({ piece, small }: { piece: Piece; small?: boolean }) {
  return (
    <span
      className={`piece ${piece === 'w' || piece === 'W' ? 'white' : 'black'} ${
        isKing(piece) ? 'king' : ''
      } ${small ? 'small' : ''}`}
      aria-hidden="true"
    >
      {isKing(piece) ? <Crown /> : null}
    </span>
  );
}

function pieceName(lang: Lang, piece: Piece): string {
  if (piece === 'w') return t(lang, 'whiteMan');
  if (piece === 'W') return t(lang, 'whiteKing');
  if (piece === 'b') return t(lang, 'blackMan');
  return t(lang, 'blackKing');
}

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((square, index) => path[index] === square);
}

export function Board({
  board,
  legal,
  selected,
  partial,
  last,
  hint,
  disabled,
  onCell,
  lang,
}: {
  board: (Piece | null)[];
  legal: Move[];
  selected: number | null;
  partial: number[];
  last: Move | null;
  hint: Move | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  lang: Lang;
}) {
  const movable = new Set(legal.map((move) => move.from));
  const targets = new Map<number, boolean>();
  const previewCaptures = new Set<number>();

  if (selected !== null) {
    const prefix = [selected, ...partial];
    for (const move of legal) {
      if (move.from !== selected || !pathStartsWith(move.path, prefix)) continue;
      const next = move.path[prefix.length];
      if (next === undefined) continue;
      targets.set(next, move.captures.length > 0);
    }
    if (partial.length > 0) {
      const sample = legal.find(
        (move) => move.from === selected && pathStartsWith(move.path, prefix),
      );
      for (const square of sample?.captures.slice(0, partial.length) ?? []) {
        previewCaptures.add(square);
      }
    }
  }

  const hintPath = new Set(hint?.path.slice(1) ?? []);
  const hintCaptured = new Set(hint?.captures ?? []);
  const lastPath = new Set(last?.path.slice(1, -1) ?? []);

  return (
    <div className="board" role="group" aria-label={t(lang, 'boardLabel')}>
      {board.map((piece, index) => {
        const row = rowOf(index);
        const col = colOf(index);
        if (!isDarkSquare(index)) {
          return <div key={index} className="square light" aria-hidden="true" />;
        }
        const classes = [
          'square',
          'dark',
          piece ? 'occupied' : '',
          movable.has(index) ? 'playable' : '',
          selected === index ? 'selected' : '',
          targets.has(index) ? 'target' : '',
          targets.get(index) ? 'capture-target' : '',
          previewCaptures.has(index) ? 'captured-preview' : '',
          hint?.from === index ? 'hint-from' : '',
          hintPath.has(index) ? 'hint-path' : '',
          hintCaptured.has(index) ? 'hint-captured' : '',
          last?.to === index ? 'last-to' : '',
          lastPath.has(index) ? 'last-path' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = piece
          ? t(lang, 'squarePiece', {
              row: row + 1,
              col: col + 1,
              piece: pieceName(lang, piece),
            })
          : t(lang, 'squareEmpty', { row: row + 1, col: col + 1 });
        return (
          <button
            key={index}
            type="button"
            className={classes}
            data-square={index}
            aria-label={label}
            aria-pressed={selected === index}
            disabled={disabled}
            onClick={() => onCell(index)}
          >
            {piece ? <PieceDisc piece={piece} /> : null}
            {targets.has(index) ? <span className="target-dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
