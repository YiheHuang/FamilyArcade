import { useId } from 'react';
import { t, type Lang } from '../i18n';
import {
  starPoints,
  type BoardSize,
  type Cell,
  type Color,
} from '../game/go';

const MARGIN: Record<BoardSize, number> = { 9: 48, 13: 40, 19: 32 };
const VIEW = 440;

export function StoneGlyph({ color }: { color: Color }) {
  return <span className={`stone stone-${color === 'B' ? 'black' : 'white'}`} aria-hidden="true" />;
}

export function Board({
  size,
  board,
  turn,
  lastMove,
  hint,
  cursor,
  koPoint = null,
  territory = null,
  disabled,
  lang,
  onCell,
  onCursor,
  legend = false,
  legendText,
}: {
  size: BoardSize;
  board: Cell[];
  turn: Color;
  lastMove: number | null;
  hint: number | null;
  cursor: number;
  koPoint?: number | null;
  territory?: (Color | null)[] | null;
  disabled?: boolean;
  lang: Lang;
  onCell: (index: number) => void;
  onCursor?: (index: number) => void;
  legend?: boolean;
  legendText?: string;
}) {
  const grainId = `goban-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const margin = MARGIN[size];
  const span = VIEW - margin * 2;
  const step = span / (size - 1);
  const at = (rowOrCol: number) => margin + step * rowOrCol;
  const pointWidth = (step / VIEW) * 100;
  const stars = new Set(starPoints(size));

  return (
    <div className="go-board-wrap">
      <div
        className={`go-board ${disabled ? 'is-disabled' : ''}`}
        role="grid"
        aria-label={t(lang, 'boardLabel')}
      >
        <svg className="go-lines" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" role="presentation">
          <defs>
            <linearGradient id={grainId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e6c28b" />
              <stop offset="45%" stopColor="#dcb277" />
              <stop offset="100%" stopColor="#cea268" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={VIEW} height={VIEW} rx="18" fill={`url(#${grainId})`} />
          {Array.from({ length: size }, (_, i) => (
            <g key={i} stroke="#6b4a2b" strokeWidth={size === 19 ? 0.95 : 1.15} strokeLinecap="round">
              <line x1={at(i)} y1={margin} x2={at(i)} y2={VIEW - margin} />
              <line x1={margin} y1={at(i)} x2={VIEW - margin} y2={at(i)} />
            </g>
          ))}
          {[...stars].map((index) => {
            const row = Math.floor(index / size);
            const col = index % size;
            return <circle key={index} cx={at(col)} cy={at(row)} r={size === 19 ? 2.5 : 3.1} fill="#5a3d24" />;
          })}
          {Array.from({ length: size }, (_, i) => (
            <text
              key={`top-${i}`}
              x={at(i)}
              y={margin - (size === 19 ? 11 : 15)}
              textAnchor="middle"
              className="coord"
              style={{ fontSize: size === 19 ? 7.5 : 9 }}
            >
              {i + 1}
            </text>
          ))}
          {Array.from({ length: size }, (_, row) => (
            <text
              key={`left-${row}`}
              x={margin - (size === 19 ? 13 : 17)}
              y={at(row) + (size === 19 ? 2.6 : 3.2)}
              textAnchor="middle"
              className="coord"
              style={{ fontSize: size === 19 ? 7.5 : 9 }}
            >
              {size - row}
            </text>
          ))}
        </svg>

        {Array.from({ length: size * size }, (_, index) => {
          const cell = board[index] ?? null;
          const row = Math.floor(index / size);
          const col = index % size;
          const classes = [
            'go-point',
            cell ? `has-${cell === 'B' ? 'black' : 'white'}` : '',
            lastMove === index ? 'last' : '',
            hint === index ? 'hint' : '',
            cursor === index ? 'cursor' : '',
            koPoint === index ? 'ko' : '',
            territory?.[index] === 'B' ? 'territory-b' : '',
            territory?.[index] === 'W' ? 'territory-w' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label = cell
            ? t(lang, 'pointFilled', {
                row: size - row,
                col: col + 1,
                color: t(lang, cell === 'B' ? 'black' : 'white'),
              })
            : t(lang, 'pointEmpty', { row: size - row, col: col + 1 });
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              tabIndex={cursor === index ? 0 : -1}
              className={classes}
              style={{
                left: `${(at(col) / VIEW) * 100}%`,
                top: `${(at(row) / VIEW) * 100}%`,
                width: `${pointWidth}%`,
              }}
              aria-label={label}
              disabled={disabled || Boolean(cell)}
              onClick={() => onCell(index)}
              onFocus={() => onCursor?.(index)}
            >
              {cell ? <StoneGlyph color={cell} /> : null}
              {!cell && !disabled ? (
                <span className={`preview-stone preview-${turn === 'B' ? 'black' : 'white'}`} aria-hidden="true" />
              ) : null}
              {!cell && territory?.[index] === 'B' ? <span className="eye eye-black" aria-hidden="true" /> : null}
              {!cell && territory?.[index] === 'W' ? <span className="eye eye-white" aria-hidden="true" /> : null}
              {!cell && koPoint === index ? <span className="ko-mark" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {legend ? (
        <p className="board-legend">
          {legendText ?? `${size} × ${size}`}
        </p>
      ) : null}
    </div>
  );
}
