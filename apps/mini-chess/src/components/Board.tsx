import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  BOARD_RANKS,
  FILES,
  colOf,
  rowOf,
  squareName,
  colorOf,
  typeOf,
  type Cell,
  type LegalMove,
  type PieceType,
} from '../game/chess';
import { t, type Lang } from '../i18n';

const GLYPHS: Record<PieceType, string> = {
  K: '♚',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
};

const PIECE_KEYS = {
  K: 'pieceK',
  R: 'pieceR',
  B: 'pieceB',
  N: 'pieceN',
  P: 'pieceP',
} as const;

export function PieceGlyph({ piece }: { piece: Cell }) {
  if (!piece) return null;
  return (
    <span className={`piece piece-${colorOf(piece)}`} aria-hidden="true">
      {GLYPHS[typeOf(piece)]}
    </span>
  );
}

export interface BoardProps {
  board: Cell[];
  selected?: number | null;
  targets?: LegalMove[];
  last?: { from: number; to: number } | null;
  checkSquare?: number | null;
  hint?: { from: number; to: number } | null;
  flipped?: boolean;
  interactive?: boolean;
  lang: Lang;
  onCell?: (index: number) => void;
}

export function Board({
  board,
  selected = null,
  targets = [],
  last = null,
  checkSquare = null,
  hint = null,
  flipped = false,
  interactive = true,
  lang,
  onCell,
}: BoardProps) {
  const order = useMemo(() => {
    const indices = Array.from({ length: board.length }, (_, index) => index);
    return flipped ? indices.reverse() : indices;
  }, [board.length, flipped]);

  const targetMap = useMemo(() => {
    const map = new Map<number, LegalMove>();
    for (const move of targets) {
      const existing = map.get(move.to);
      if (!existing || move.promotion) map.set(move.to, move);
    }
    return map;
  }, [targets]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (!key.startsWith('Arrow')) return;
    const active = document.activeElement as HTMLElement | null;
    const raw = active?.dataset.square;
    if (raw === undefined) return;
    const from = Number(raw);
    if (!Number.isInteger(from)) return;
    event.preventDefault();
    let row = rowOf(from);
    let col = colOf(from);
    if (key === 'ArrowUp') row += flipped ? 1 : -1;
    if (key === 'ArrowDown') row += flipped ? -1 : 1;
    if (key === 'ArrowLeft') col += flipped ? 1 : -1;
    if (key === 'ArrowRight') col += flipped ? -1 : 1;
    if (row < 0 || row >= BOARD_RANKS || col < 0 || col >= 5) return;
    const next = row * 5 + col;
    const element = event.currentTarget.querySelector<HTMLElement>(`[data-square="${next}"]`);
    element?.focus();
  };

  return (
    <div
      className={`board ${flipped ? 'board-flipped' : ''}`}
      role="grid"
      aria-label={t(lang, 'boardAria')}
      onKeyDown={moveFocus}
    >
      {order.map((index) => {
        const square = board[index];
        const row = rowOf(index);
        const col = colOf(index);
        const displayRow = flipped ? BOARD_RANKS - 1 - row : row;
        const displayCol = flipped ? 4 - col : col;
        const target = targetMap.get(index);
        const isSelected = selected === index;
        const isCheck = checkSquare === index;
        const isHintFrom = hint?.from === index;
        const isHintTo = hint?.to === index;
        const pieceLabel = square
          ? t(lang, PIECE_KEYS[typeOf(square)])
          : t(lang, 'squareEmpty');
        const label = `${t(lang, 'squareAria', {
          square: squareName(index),
          piece: pieceLabel,
        })}${isSelected ? ` · ${t(lang, 'selectedSquare')}` : ''}${
          target ? ` · ${t(lang, 'legalTarget')}` : ''
        }`;
        const classes = [
          'square',
          (row + col) % 2 === 0 ? 'light' : 'dark',
          square ? `has-${colorOf(square)}` : '',
          isSelected ? 'selected' : '',
          target ? 'target' : '',
          target?.captured ? 'target-capture' : '',
          last?.from === index ? 'last-from' : '',
          last?.to === index ? 'last-to' : '',
          isHintFrom ? 'hint-from' : '',
          isHintTo ? 'hint-to' : '',
          isCheck ? 'in-check' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const content = (
          <>
            {displayRow === BOARD_RANKS - 1 && (
              <span className="coord coord-file" aria-hidden="true">
                {FILES[col]}
              </span>
            )}
            {displayCol === 0 && (
              <span className="coord coord-rank" aria-hidden="true">
                {BOARD_RANKS - row}
              </span>
            )}
            {square ? (
              <PieceGlyph piece={square} />
            ) : target ? (
              <span className="target-dot" aria-hidden="true" />
            ) : null}
            {isCheck && <span className="check-ring" aria-hidden="true" />}
          </>
        );

        if (!interactive || !onCell) {
          return (
            <div key={index} className={classes} role="gridcell" aria-label={label}>
              {content}
            </div>
          );
        }

        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            data-square={index}
            className={classes}
            aria-label={label}
            aria-pressed={isSelected}
            onClick={() => onCell(index)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
