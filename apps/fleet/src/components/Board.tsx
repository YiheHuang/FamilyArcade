import type { ShipId } from '../game/fleet';
import { coordLabel } from '../game/fleet';
import { shipLabelKey, t, type Lang } from '../i18n';

export interface BoardShip {
  id: ShipId;
  cells: number[];
  sunk: boolean;
}

export interface BoardMark {
  cell: number;
  result: 'miss' | 'hit' | 'sunk';
}

export interface BoardProps {
  kind: 'own' | 'enemy';
  label: string;
  ships: BoardShip[];
  marks: BoardMark[];
  lang: Lang;
  onCell?: (cell: number) => void;
  onHover?: (cell: number | null) => void;
  preview?: number[] | null;
  previewInvalid?: boolean;
  hint?: number | null;
  last?: number | null;
  disabled?: boolean;
  flash?: number | null;
}

const ROWS = Array.from({ length: 10 }, (_, index) => index);
const COLS = Array.from({ length: 10 }, (_, index) => index);
const LETTERS = 'ABCDEFGHIJ';

export function Board({
  kind,
  label,
  ships,
  marks,
  lang,
  onCell,
  onHover,
  preview,
  previewInvalid,
  hint,
  last,
  disabled,
  flash,
}: BoardProps) {
  const shipCells = new Map<number, ShipId>();
  const sunkCells = new Set<number>();
  for (const ship of ships) {
    for (const cell of ship.cells) {
      shipCells.set(cell, ship.id);
      if (ship.sunk) sunkCells.add(cell);
    }
  }
  const markByCell = new Map<number, BoardMark>();
  for (const mark of marks) markByCell.set(mark.cell, mark);
  const previewSet = new Set(preview ?? []);
  const aimable = kind === 'enemy' && !disabled && Boolean(onCell);
  let firstFocusable = -1;
  for (let cell = 0; cell < 100; cell += 1) {
    const blocked = kind === 'enemy' && markByCell.has(cell);
    if (!disabled && !blocked) {
      firstFocusable = cell;
      break;
    }
  }

  return (
    <div className={`board-panel ${kind}-board`} data-testid={`${kind}-board`}>
      <div className="board-heading">
        <h3>{label}</h3>
        <span className="board-axis-note">A–J · 1–10</span>
      </div>
      <div
        className={`board-grid ${previewInvalid ? 'preview-invalid' : ''}`}
        role="grid"
        aria-label={label}
        onMouseLeave={() => onHover?.(null)}
      >
        <span className="axis-corner" aria-hidden="true" />
        {COLS.map((col) => (
          <span key={`col-${col}`} className="axis-label axis-top" aria-hidden="true">
            {col + 1}
          </span>
        ))}
        {ROWS.map((row) => (
          <div key={`row-${row}`} className="board-row" role="row" style={{ display: 'contents' }}>
            <span className="axis-label axis-left" aria-hidden="true">
              {LETTERS[row]}
            </span>
            {COLS.map((col) => {
              const cell = row * 10 + col;
              const shipId = shipCells.get(cell);
              const mark = markByCell.get(cell);
              const classes = ['cell'];
              if (shipId) classes.push('ship');
              if (sunkCells.has(cell)) classes.push('sunk');
              if (mark) classes.push(`mark-${mark.result}`);
              if (shipId) {
                if (shipCells.get(cell + 1) === shipId && col < 9) classes.push('join-r');
                if (shipCells.get(cell - 1) === shipId && col > 0) classes.push('join-l');
                if (shipCells.get(cell + 10) === shipId && row < 9) classes.push('join-d');
                if (shipCells.get(cell - 10) === shipId && row > 0) classes.push('join-u');
              }
              if (previewSet.has(cell)) classes.push('preview');
              if (hint === cell) classes.push('hint');
              if (last === cell) classes.push('last');
              if (flash === cell) classes.push('flash');
              const state = mark ? mark.result : shipId ? 'ship' : 'unknown';
              const prefix = kind === 'own' ? t(lang, 'cellShip') : '';
              const aria = `${coordLabel(cell)} ${translateState(lang, state)}${prefix && kind === 'own' ? `, ${prefix}` : ''}`;
              const isShot = Boolean(mark);
              return (
                <button
                  key={cell}
                  type="button"
                  role="gridcell"
                  tabIndex={cell === firstFocusable ? 0 : -1}
                  data-cell={cell}
                  data-row={row}
                  data-col={col}
                  className={classes.join(' ')}
                  aria-label={aria}
                  disabled={disabled || (kind === 'enemy' && isShot)}
                  onClick={() => onCell?.(cell)}
                  onMouseEnter={() => onHover?.(cell)}
                  onFocus={() => onHover?.(cell)}
                >
                  {mark ? <ShotGlyph result={mark.result} /> : null}
                  {aimable && !isShot ? <span className="aim-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function translateState(lang: Lang, state: 'unknown' | 'miss' | 'hit' | 'sunk' | 'ship'): string {
  if (state === 'unknown') return t(lang, 'cellUnknown');
  if (state === 'miss') return t(lang, 'cellMiss');
  if (state === 'hit') return t(lang, 'cellHit');
  if (state === 'sunk') return t(lang, 'cellSunk');
  return t(lang, 'cellShip');
}

function ShotGlyph({ result }: { result: 'miss' | 'hit' | 'sunk' }) {
  if (result === 'miss') return <span className="shot shot-miss" aria-hidden="true" />;
  return <span className={`shot shot-${result}`} aria-hidden="true"><i /><i /></span>;
}

export function ShipPips({ length, sunk }: { length: number; sunk: boolean }) {
  return (
    <span className={`pips ${sunk ? 'pips-sunk' : ''}`} aria-hidden="true">
      {Array.from({ length }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

export function FleetStatus({
  lang,
  ships,
  title,
}: {
  lang: Lang;
  ships: { id: ShipId; length: number; sunk: boolean }[];
  title?: string;
}) {
  return (
    <section className="fleet-status" aria-label={title ?? t(lang, 'fleetStatus')}>
      {title ? <h3>{title}</h3> : null}
      <ul>
        {ships.map((ship) => (
          <li key={ship.id} className={ship.sunk ? 'is-sunk' : ''}>
            <span className="fleet-name">{t(lang, shipLabelKey(ship.id))}</span>
            <ShipPips length={ship.length} sunk={ship.sunk} />
            <span className="fleet-state">{ship.sunk ? t(lang, 'sunk') : t(lang, 'afloat')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
