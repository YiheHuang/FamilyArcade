import { useRef, type KeyboardEvent } from 'react';
import {
  colOf,
  inBounds,
  indexOf,
  isDark,
  isKing,
  rowOf,
  sideOf,
  squareName,
  type Move,
  type Piece,
} from '../game/draughts';

const DARK_SQUARES = Array.from({ length: 64 }, (_, index) => index).filter((index) =>
  isDark(rowOf(index), colOf(index)),
);

function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.2 8 12l4-7 4 7 5-3.8-1.7 9.3H4.7L3 8.2Z" />
      <path d="M5 19.2h14V21H5z" />
    </svg>
  );
}

export function PieceDisc({ piece, small = false }: { piece: Piece; small?: boolean }) {
  const side = sideOf(piece);
  return (
    <span className={`piece ${side}${isKing(piece) ? ' king' : ''}${small ? ' small' : ''}`} aria-hidden="true">
      <span className="piece-ring" />
      {isKing(piece) ? <Crown /> : null}
    </span>
  );
}

export function MiniBoard({ board, flipped = false }: { board: (Piece | null)[]; flipped?: boolean }) {
  return (
    <div className={`board mini-board${flipped ? ' flipped' : ''}`} aria-hidden="true">
      {Array.from({ length: 64 }, (_, visual) => {
        const index = flipped ? 63 - visual : visual;
        const dark = isDark(rowOf(index), colOf(index));
        return (
          <div key={index} className={`square ${dark ? 'dark' : 'light'}`}>
            {board[index] ? <PieceDisc piece={board[index] as Piece} /> : null}
          </div>
        );
      })}
    </div>
  );
}

interface BoardProps {
  board: (Piece | null)[];
  legalMoves: Move[];
  selected: number | null;
  chain: number[];
  hintPath?: number[];
  lastMove?: Move | null;
  flipped?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  label: string;
  onSquare?: (index: number) => void;
}

export function Board({
  board,
  legalMoves,
  selected,
  chain,
  hintPath = [],
  lastMove = null,
  flipped = false,
  interactive = true,
  disabled = false,
  label,
  onSquare,
}: BoardProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const canMoveFrom = new Set(legalMoves.map((move) => move.from));
  const candidates =
    selected === null
      ? []
      : legalMoves.filter(
          (move) =>
            move.from === selected &&
            chain.every((square, index) => move.path[index] === square),
        );
  const targets = new Set(
    candidates
      .map((move) => move.path[chain.length])
      .filter((square): square is number => square !== undefined),
  );
  const hint = new Set(hintPath);
  const captures = new Set(lastMove?.captures ?? []);

  const focusDirection = (from: number, dr: number, dc: number) => {
    const row = rowOf(from);
    const col = colOf(from);
    if (dc !== 0) {
      let nextRow = row;
      let nextCol = col + dc;
      while (inBounds(nextRow, nextCol)) {
        if (isDark(nextRow, nextCol)) {
          refs.current[indexOf(nextRow, nextCol)]?.focus();
          return;
        }
        nextCol += dc;
      }
      return;
    }
    const nextRow = row + dr;
    if (!inBounds(nextRow, 0)) return;
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const candidate of DARK_SQUARES) {
      if (rowOf(candidate) !== nextRow) continue;
      const distance = Math.abs(colOf(candidate) - col);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best !== null) refs.current[best]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const direction = moves[event.key];
    if (!direction) return;
    event.preventDefault();
    focusDirection(index, direction[0], direction[1]);
  };

  return (
    <div
      className={`board${flipped ? ' flipped' : ''}${interactive ? ' interactive' : ''}`}
      role={interactive ? 'grid' : undefined}
      aria-label={label}
      aria-rowcount={8}
      aria-colcount={8}
    >
      {Array.from({ length: 64 }, (_, visual) => {
        const index = flipped ? 63 - visual : visual;
        const dark = isDark(rowOf(index), colOf(index));
        const piece = board[index];
        const isTarget = dark && targets.has(index);
        const isSelected = dark && selected === index;
        const isHint = dark && hint.has(index);
        const isLast = Boolean(
          dark && lastMove && (lastMove.from === index || lastMove.to === index),
        );
        const wasCaptured = dark && captures.has(index);
        const classes = [
          'square',
          dark ? 'dark' : 'light',
          isTarget ? 'target' : '',
          isSelected ? 'selected' : '',
          isHint ? 'hint' : '',
          isLast ? 'last' : '',
          wasCaptured ? 'was-captured' : '',
          dark && canMoveFrom.has(index) && selected === null ? 'movable' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const pieceLabel = piece
          ? `${sideOf(piece)} ${isKing(piece) ? 'king' : 'man'}`
          : 'empty';

        if (!dark) {
          return (
            <div
              key={index}
              className={classes}
              role={interactive ? 'gridcell' : undefined}
              aria-label={interactive ? `${squareName(index)}, light square` : undefined}
            >
              {piece ? <PieceDisc piece={piece} /> : null}
            </div>
          );
        }

        return (
          <button
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role={interactive ? 'gridcell' : undefined}
            tabIndex={interactive ? 0 : -1}
            className={classes}
            aria-label={`${squareName(index)}, ${pieceLabel}`}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!interactive || disabled) return;
              onSquare?.(index);
            }}
            onKeyDown={interactive ? (event) => onKeyDown(event, index) : undefined}
          >
            {piece ? <PieceDisc piece={piece} /> : null}
            {isTarget ? <span className="target-dot" aria-hidden="true" /> : null}
            {wasCaptured ? <span className="capture-mark" aria-hidden="true" /> : null}
            {isLast ? <span className="last-mark" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
