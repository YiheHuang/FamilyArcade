import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { RANKS, type Animal, type Cell, type Move, type Side } from '../game/jungle-chess';
import { t, type Lang } from '../i18n';

export const ANIMAL_EMOJI: Record<Animal, string> = {
  elephant: '🐘',
  lion: '🦁',
  tiger: '🐯',
  leopard: '🐆',
  wolf: '🐺',
  dog: '🐕',
  cat: '🐈',
  rat: '🐀',
};

export const ANIMAL_KEY: Record<Animal, Parameters<typeof t>[1]> = {
  elephant: 'animalElephant',
  lion: 'animalLion',
  tiger: 'animalTiger',
  leopard: 'animalLeopard',
  wolf: 'animalWolf',
  dog: 'animalDog',
  cat: 'animalCat',
  rat: 'animalRat',
};

export function animalName(lang: Lang, animal: Animal): string {
  return t(lang, ANIMAL_KEY[animal]);
}

export function sideName(lang: Lang, side: Side): string {
  return t(lang, side === 'X' ? 'sideRed' : 'sideBlue');
}

export function SideGlyph({ side }: { side: Side }) {
  return (
    <span className={`side-glyph side-glyph-${side.toLowerCase()}`} aria-hidden="true">
      <span>🐾</span>
    </span>
  );
}

export function PieceToken({ piece }: { piece: Exclude<Cell, null> }) {
  return (
    <span
      className={`piece piece-${piece.side.toLowerCase()} animal-${piece.kind}`}
      aria-hidden="true"
    >
      <span className="piece-animal">{ANIMAL_EMOJI[piece.kind]}</span>
      <span className="piece-rank">{RANKS[piece.kind]}</span>
    </span>
  );
}

function terrainKey(index: number): Parameters<typeof t>[1] {
  if (index === 3 || index === 59) return 'terrainDen';
  if ([2, 4, 10, 52, 58, 60].includes(index)) return 'terrainTrap';
  const row = Math.floor(index / 7);
  const col = index % 7;
  if (row >= 3 && row <= 5 && (col === 1 || col === 2 || col === 4 || col === 5)) {
    return 'terrainWater';
  }
  return 'terrainLand';
}

export function Board({
  board,
  lastMove,
  hint,
  selected,
  destinations,
  disabled,
  onCell,
  onEscape,
  lang,
}: {
  board: Cell[];
  lastMove: Move | null;
  hint: Move | null;
  selected: number | null;
  destinations: number[];
  disabled?: boolean;
  onCell: (index: number) => void;
  onEscape?: () => void;
  lang: Lang;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const selectedPiece = selected === null ? null : board[selected];

  const focusCell = (index: number) => {
    const button = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-index="${index}"]`,
    );
    button?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (onEscape) {
        event.preventDefault();
        onEscape();
      }
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const current = Number(active?.dataset?.index);
    if (!Number.isInteger(current)) return;
    const row = Math.floor(current / 7);
    const col = current % 7;
    let nextRow = row;
    let nextCol = col;
    if (event.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
    else if (event.key === 'ArrowDown') nextRow = Math.min(8, row + 1);
    else if (event.key === 'ArrowLeft') nextCol = Math.max(0, col - 1);
    else if (event.key === 'ArrowRight') nextCol = Math.min(6, col + 1);
    else return;
    event.preventDefault();
    focusCell(nextRow * 7 + nextCol);
  };

  return (
    <div
      className="board"
      role="grid"
      aria-label={t(lang, 'boardLabel')}
      ref={gridRef}
      onKeyDown={onKeyDown}
    >
      {board.map((cell, index) => {
        const row = Math.floor(index / 7);
        const col = index % 7;
        const den = index === 3 || index === 59;
        const trap = [2, 4, 10, 52, 58, 60].includes(index);
        const water = terrainKey(index) === 'terrainWater';
        const trapSide = [2, 4, 10].includes(index) ? 'O' : [52, 58, 60].includes(index) ? 'X' : null;
        const denSide = index === 3 ? 'O' : index === 59 ? 'X' : null;
        const classes = [
          'cell',
          water ? 'terrain-water' : '',
          trap ? 'terrain-trap' : '',
          den ? 'terrain-den' : '',
          trapSide ? `trap-${trapSide.toLowerCase()}` : '',
          denSide ? `den-${denSide.toLowerCase()}` : '',
          cell ? `has-${cell.side.toLowerCase()}` : '',
          lastMove?.from === index ? 'last-from' : '',
          lastMove?.to === index ? 'last-to' : '',
          selected === index ? 'selected' : '',
          hint?.from === index ? 'hint-from' : '',
          hint?.to === index ? 'hint-to' : '',
          destinations.includes(index) ? 'destination' : '',
          destinations.includes(index) && cell ? 'destination-capture' : '',
        ]
          .filter(Boolean)
          .join(' ');

        let label: string;
        if (cell) {
          label = t(lang, 'cellPiece', {
            r: row + 1,
            c: col + 1,
            side: sideName(lang, cell.side),
            animal: animalName(lang, cell.kind),
            rank: RANKS[cell.kind],
          });
        } else {
          label = t(lang, 'cellEmpty', {
            r: row + 1,
            c: col + 1,
            terrain: t(lang, terrainKey(index)),
          });
        }

        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            data-index={index}
            data-side={cell?.side ?? ''}
            className={classes}
            aria-label={label}
            title={label}
            aria-selected={selected === index}
            tabIndex={focusIndex === index ? 0 : -1}
            disabled={disabled}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onCell(index)}
          >
            {water && <span className="water-wave" aria-hidden="true" />}
            {trap && <span className="terrain-tag" aria-hidden="true">{t(lang, 'trapLabel')}</span>}
            {den && <span className="terrain-tag" aria-hidden="true">{t(lang, 'denLabel')}</span>}
            {cell ? (
              <PieceToken piece={cell} />
            ) : (
              destinations.includes(index) && <span className="move-dot" aria-hidden="true" />
            )}
            {selected === index && selectedPiece && (
              <span className="select-ring" aria-hidden="true" />
            )}
            {hint?.to === index && <span className="hint-pin" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
