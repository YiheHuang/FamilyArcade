import { useEffect, useRef, useState } from 'react';
import { FILES, fileOf, rankOf, squareName, type Cell, type Move, type PieceType } from '../game/chess';
import { t, type Lang } from '../i18n';

const GLYPHS: Record<PieceType, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

const ZH_FILES = ['一', '二', '三', '四', '五', '六', '七', '八'];

export function PieceGlyph({ cell }: { cell: Exclude<Cell, null> }) {
  return (
    <span className={`piece piece-${cell.color}`} aria-hidden="true">
      {GLYPHS[cell.type]}
    </span>
  );
}

function ariaSquare(square: number, lang: Lang): string {
  const file = lang === 'zh' ? ZH_FILES[fileOf(square)] : FILES[fileOf(square)];
  return `${file}${8 - rankOf(square)}`;
}

export function Board({
  board,
  last,
  hint,
  selected,
  targets,
  checkSquare,
  disabled,
  onSquare,
  lang,
}: {
  board: Cell[];
  last: Move | null;
  hint: { from: number; to: number } | null;
  selected: number | null;
  targets: number[];
  checkSquare: number | null;
  disabled?: boolean;
  onSquare: (index: number) => void;
  lang: Lang;
}) {
  const [focusIndex, setFocusIndex] = useState(60);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef(false);
  const targetSet = new Set(targets);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    buttons.current[focusIndex]?.focus();
  }, [focusIndex]);

  const moveFocus = (fileDelta: number, rankDelta: number) => {
    const file = Math.min(7, Math.max(0, fileOf(focusIndex) + fileDelta));
    const rank = Math.min(7, Math.max(0, rankOf(focusIndex) + rankDelta));
    pendingFocus.current = true;
    setFocusIndex(rank * 8 + file);
  };

  return (
    <div
      className="board"
      role="grid"
      aria-label={t(lang, 'boardLabel')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(0, -1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(0, 1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveFocus(-1, 0);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveFocus(1, 0);
        } else if (event.key === 'Home') {
          event.preventDefault();
          pendingFocus.current = true;
          setFocusIndex(rankOf(focusIndex) * 8);
        } else if (event.key === 'End') {
          event.preventDefault();
          pendingFocus.current = true;
          setFocusIndex(rankOf(focusIndex) * 8 + 7);
        }
      }}
    >
      {board.map((cell, index) => {
        const file = fileOf(index);
        const rank = rankOf(index);
        const dark = (file + rank) % 2 === 1;
        const classes = [
          'square',
          dark ? 'dark' : 'light',
          last?.from === index ? 'last-from' : '',
          last?.to === index ? 'last-to' : '',
          hint?.from === index ? 'hint-from' : '',
          hint?.to === index ? 'hint-to' : '',
          selected === index ? 'selected' : '',
          targetSet.has(index) ? 'target' : '',
          checkSquare === index ? 'in-check' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const pieceLabel = cell
          ? t(lang, 'pieceLabel', {
              color: t(lang, cell.color === 'w' ? 'white' : 'black'),
              piece: t(lang, `piece${cell.type.toUpperCase()}` as Parameters<typeof t>[1]),
            })
          : '';
        const label = cell
          ? t(lang, 'squareAria', { square: ariaSquare(index, lang), piece: pieceLabel })
          : t(lang, 'emptySquareAria', { square: ariaSquare(index, lang) });

        return (
          <button
            key={index}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="gridcell"
            data-square={squareName(index)}
            tabIndex={focusIndex === index ? 0 : -1}
            className={classes}
            aria-label={label}
            aria-pressed={selected === index}
            disabled={disabled}
            onFocus={() => setFocusIndex(index)}
            onClick={() => {
              setFocusIndex(index);
              onSquare(index);
            }}
          >
            {rank === 7 && <span className="coord-file">{lang === 'zh' ? ZH_FILES[file] : FILES[file]}</span>}
            {file === 0 && <span className="coord-rank">{8 - rank}</span>}
            {cell && <PieceGlyph cell={cell} />}
            {targetSet.has(index) && <span className={cell ? 'target-ring' : 'target-dot'} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
