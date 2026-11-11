import {
  COLUMN_LABELS,
  SIZE,
  STARS,
  type Cell,
  type Color,
} from '../game/little-go';
import type { Lang } from '../i18n';

const MARGIN = 50;
const SPAN = 440 - MARGIN * 2;
const STEP = SPAN / (SIZE - 1);
const at = (rowOrCol: number) => MARGIN + STEP * rowOrCol;

export function StoneGlyph({ color }: { color: Color }) {
  return <span className={`stone stone-${color === 'B' ? 'black' : 'white'}`} aria-hidden="true" />;
}

function percent(index: number): { left: string; top: string } {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  return { left: `${(at(col) / 440) * 100}%`, top: `${(at(row) / 440) * 100}%` };
}

export function Board({
  board,
  turn,
  lastMove,
  hint,
  cursor,
  territory,
  disabled,
  lang,
  onCell,
  onCursor,
  legend = true,
}: {
  board: Cell[];
  turn: Color;
  lastMove: number | null;
  hint: number | null;
  cursor: number;
  territory?: (Color | null)[] | null;
  disabled?: boolean;
  lang: Lang;
  onCell: (index: number) => void;
  onCursor?: (index: number) => void;
  legend?: boolean;
}) {
  const zh = lang === 'zh';
  return (
    <div className="go-board-wrap">
      <div className={`go-board ${disabled ? 'is-disabled' : ''}`}>
        <svg className="go-lines" viewBox="0 0 440 440" aria-hidden="true" role="presentation">
          <defs>
            <linearGradient id="board-grain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e4bf85" />
              <stop offset="48%" stopColor="#d9ad6d" />
              <stop offset="100%" stopColor="#cfa163" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="440" height="440" rx="18" fill="url(#board-grain)" />
          {Array.from({ length: SIZE }, (_, i) => (
            <g key={i} stroke="#63452a" strokeWidth="1.15" strokeLinecap="round">
              <line x1={at(i)} y1={MARGIN} x2={at(i)} y2={440 - MARGIN} />
              <line x1={MARGIN} y1={at(i)} x2={440 - MARGIN} y2={at(i)} />
            </g>
          ))}
          {STARS.map((index) => {
            const row = Math.floor(index / SIZE);
            const col = index % SIZE;
            return <circle key={index} cx={at(col)} cy={at(row)} r="3.1" fill="#5a3d24" />;
          })}
          {COLUMN_LABELS.map((label, col) => (
            <text key={label} x={at(col)} y="24" textAnchor="middle" className="coord">
              {label}
            </text>
          ))}
          {Array.from({ length: SIZE }, (_, row) => (
            <text key={row} x="20" y={at(row) + 4} textAnchor="middle" className="coord">
              {SIZE - row}
            </text>
          ))}
        </svg>

        {board.map((cell, index) => {
          const pos = percent(index);
          const classes = [
            'go-point',
            cell ? `has-${cell === 'B' ? 'black' : 'white'}` : '',
            lastMove === index ? 'last' : '',
            hint === index ? 'hint' : '',
            cursor === index ? 'cursor' : '',
            territory?.[index] === 'B' ? 'territory-b' : '',
            territory?.[index] === 'W' ? 'territory-w' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const row = Math.floor(index / SIZE) + 1;
          const label = COLUMN_LABELS[index % SIZE];
          const stoneName = cell === 'B' ? (zh ? '黑子' : 'black stone') : zh ? '白子' : 'white stone';
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              tabIndex={cursor === index ? 0 : -1}
              className={classes}
              style={pos}
              aria-label={
                cell
                  ? `${label}${row}, ${stoneName}`
                  : `${label}${row}, ${zh ? '空点' : 'empty point'}`
              }
              disabled={disabled || Boolean(cell)}
              onClick={() => onCell(index)}
              onFocus={() => onCursor?.(index)}
            >
              {cell ? <StoneGlyph color={cell} /> : null}
              {!cell && !disabled ? <span className={`preview-stone preview-${turn === 'B' ? 'black' : 'white'}`} aria-hidden="true" /> : null}
              {!cell && territory?.[index] === 'B' ? <span className="eye eye-black" aria-hidden="true" /> : null}
              {!cell && territory?.[index] === 'W' ? <span className="eye eye-white" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {legend ? (
        <p className="board-legend">
          {zh
            ? '黑先 · 白贴 6.5 目 · 连续两次停一手结束'
            : 'Black moves first · White gets 6.5 komi · two passes end the game'}
        </p>
      ) : null}
    </div>
  );
}
