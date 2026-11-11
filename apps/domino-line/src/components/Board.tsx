import type { End, LegalPlay, PlacedTile, Tile } from '../game/domino';
import { tileKey } from '../game/domino';

const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Half({ value }: { value: number }) {
  const lit = new Set(PIPS[value] ?? []);
  return (
    <span className="domino-half" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={lit.has(index) ? 'pip lit' : 'pip'} />
      ))}
    </span>
  );
}

export function DominoFace({
  tile,
  className = '',
  selected = false,
  playable = false,
  faded = false,
}: {
  tile: Tile;
  className?: string;
  selected?: boolean;
  playable?: boolean;
  faded?: boolean;
}) {
  const classes = ['domino', className, selected ? 'selected' : '', playable ? 'playable' : '', faded ? 'faded' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-label={`Domino ${tile.a}–${tile.b}`}>
      <Half value={tile.a} />
      <span className="domino-spine" aria-hidden="true" />
      <Half value={tile.b} />
    </span>
  );
}

export function HandTile({
  tile,
  index,
  selected,
  playable,
  disabled,
  onSelect,
}: {
  tile: Tile;
  index: number;
  selected: boolean;
  playable: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`hand-tile ${selected ? 'selected' : ''} ${playable ? 'playable' : ''} ${disabled ? 'is-disabled' : ''}`}
      data-tile={tileKey(tile)}
      data-index={index}
      aria-pressed={selected}
      aria-label={`Select domino ${tile.a}–${tile.b}${playable ? ', playable' : ', blocked'}`}
      onClick={onSelect}
      disabled={disabled}
    >
      <DominoFace tile={tile} selected={selected} playable={playable} />
      <span className="hand-index">{index + 1}</span>
    </button>
  );
}

function PlacedDomino({ placed, last }: { placed: PlacedTile; last: boolean }) {
  return (
    <span className={`placed-domino ${last ? 'is-last' : ''}`}>
      <DominoFace tile={{ a: placed.left, b: placed.right }} />
    </span>
  );
}

export function Board({
  board,
  left,
  right,
  selected,
  legal,
  hintEnd,
  disabled,
  onEnd,
  emptyText,
  startText,
  leftLabel,
  rightLabel,
}: {
  board: PlacedTile[];
  left: number | null;
  right: number | null;
  selected: Tile | null;
  legal: LegalPlay[];
  hintEnd: End | null;
  disabled?: boolean;
  onEnd: (end: End) => void;
  emptyText: string;
  startText: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const ends = new Set(legal.filter((play) => selected && tileKey(play.tile) === tileKey(selected)).map((play) => play.end));
  const canLeft = ends.has('left');
  const canRight = ends.has('right');
  const lastKey = board.length > 0 ? tileKey(board[board.length - 1].tile) : '';
  const lastIndex = lastKey
    ? board.reduce((found, placed, index) => (tileKey(placed.tile) === lastKey ? index : found), -1)
    : -1;

  return (
    <div className="board" aria-label="Domino line">
      <div className="board-ends">
        <button
          type="button"
          className={`board-end left ${canLeft ? 'ready' : ''} ${hintEnd === 'left' ? 'hinted' : ''}`}
          onClick={() => onEnd('left')}
          disabled={disabled || !canLeft}
          aria-label={left === null ? 'Left end empty' : `Play on the left end, ${left}`}
        >
          <span className="end-arrow">←</span>
          <span className="end-pip">{left ?? '·'}</span>
          <span className="end-label">{leftLabel}</span>
        </button>

        <div className={`line-scroll ${board.length === 0 ? 'empty' : ''}`}>
          {board.length === 0 ? (
            <div className="line-empty">
              <span className="line-empty-rule" />
              <p>{selected ? startText : emptyText}</p>
              <span className="line-empty-rule" />
            </div>
          ) : (
            <div className="line" role="list">
              {board.map((placed, index) => (
                <span role="listitem" key={`${tileKey(placed.tile)}-${index}`}>
                  <PlacedDomino placed={placed} last={index === lastIndex} />
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`board-end right ${canRight ? 'ready' : ''} ${hintEnd === 'right' ? 'hinted' : ''}`}
          onClick={() => onEnd('right')}
          disabled={disabled || !canRight}
          aria-label={right === null ? 'Right end empty' : `Play on the right end, ${right}`}
        >
          <span className="end-label">{rightLabel}</span>
          <span className="end-pip">{right ?? '·'}</span>
          <span className="end-arrow">→</span>
        </button>
      </div>
    </div>
  );
}
