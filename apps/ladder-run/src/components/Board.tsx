import { useId } from 'react';
import { LADDERS, SNAKES, type Move, type PlayerState } from '../game/ladder-run';
import { seatTheme } from '../theme';

const CELLS: number[] = (() => {
  const out: number[] = [];
  for (let row = 9; row >= 0; row--) {
    const start = row * 10 + 1;
    if (row % 2 === 0) {
      for (let n = start; n < start + 10; n++) out.push(n);
    } else {
      for (let n = start + 9; n >= start; n--) out.push(n);
    }
  }
  return out;
})();

/** Centre of a numbered square in a 1000 × 1000 SVG. */
export function tileCenter(n: number): { x: number; y: number } {
  const row = Math.floor((n - 1) / 10);
  const col = row % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10);
  return { x: (col + 0.5) * 100, y: (9 - row + 0.5) * 100 };
}

function LadderArt({ from, to }: { from: number; to: number }) {
  const a = tileCenter(from);
  const b = tileCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 7;
  const ny = (dx / len) * 7;
  const rungs = Math.max(4, Math.round(len / 52));
  const rungLines = Array.from({ length: rungs + 1 }, (_, index) => {
    const t = 0.08 + (index / rungs) * 0.84;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    return (
      <line
        key={index}
        x1={x + nx}
        y1={y + ny}
        x2={x - nx}
        y2={y - ny}
        stroke="#c49355"
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    );
  });
  return (
    <g opacity={0.62}>
      <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} stroke="#a9783d" strokeWidth={4.2} strokeLinecap="round" />
      <line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} stroke="#a9783d" strokeWidth={4.2} strokeLinecap="round" />
      {rungLines}
      <circle cx={a.x} cy={a.y} r={5} fill="#8e642f" />
      <circle cx={b.x} cy={b.y} r={5} fill="#8e642f" />
    </g>
  );
}

function SnakeArt({ from, to, index, gradient }: { from: number; to: number; index: number; gradient: string }) {
  const a = tileCenter(from);
  const b = tileCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = index % 2 === 0 ? 1 : -1;
  const bend = Math.min(54, Math.max(26, len * 0.18)) * sign;
  const nx = -dy / len;
  const ny = dx / len;
  const c1x = a.x + dx * 0.28 + nx * bend;
  const c1y = a.y + dy * 0.28 + ny * bend;
  const c2x = a.x + dx * 0.68 - nx * bend;
  const c2y = a.y + dy * 0.68 - ny * bend;
  const headAngle = Math.atan2(c1y - a.y, c1x - a.x);
  const eye1 = { x: a.x + Math.cos(headAngle + 1.2) * 4.5, y: a.y + Math.sin(headAngle + 1.2) * 4.5 };
  const eye2 = { x: a.x + Math.cos(headAngle - 1.2) * 4.5, y: a.y + Math.sin(headAngle - 1.2) * 4.5 };
  return (
    <g opacity={0.6}>
      <path
        d={`M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth={11}
        strokeLinecap="round"
      />
      <path
        d={`M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`}
        fill="none"
        stroke="rgba(255,250,240,0.38)"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      <circle cx={a.x} cy={a.y} r={11} fill="#5e7f61" />
      <circle cx={eye1.x} cy={eye1.y} r={2.3} fill="#fffaf0" />
      <circle cx={eye2.x} cy={eye2.y} r={2.3} fill="#fffaf0" />
      <circle cx={eye1.x} cy={eye1.y} r={1.1} fill="#2c2a22" />
      <circle cx={eye2.x} cy={eye2.y} r={1.1} fill="#2c2a22" />
    </g>
  );
}

function Token({ player, active, compact }: { player: PlayerState; active: boolean; compact: boolean }) {
  const theme = seatTheme(player.seat);
  return (
    <span
      className={`token seat-${player.seat}${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      style={{
        background: `radial-gradient(circle at 32% 26%, ${theme.color}, ${theme.deep})`,
        borderColor: theme.ink,
      }}
      title={`${player.name} · ${player.position}`}
      aria-label={`${player.name}, square ${player.position}`}
    >
      <span className="token__num">{player.seat + 1}</span>
    </span>
  );
}

export function Board({
  players,
  lastMove,
  activeSeat,
  compact = false,
  label = 'Ladder Run board',
  startLabel = 'Start',
}: {
  players: PlayerState[];
  lastMove?: Move | null;
  activeSeat?: number | null;
  compact?: boolean;
  label?: string;
  startLabel?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const snakeGradient = `snake-${uid}`;
  const byPosition = new Map<number, PlayerState[]>();
  for (const player of players) {
    const list = byPosition.get(player.position) ?? [];
    list.push(player);
    byPosition.set(player.position, list);
  }
  const atStart = byPosition.get(0) ?? [];
  return (
    <div className={`board-panel${compact ? ' is-compact' : ''}`} role="group" aria-label={label}>
      <div className="board-bezel">
        <div className="board-grid">
          {CELLS.map((n) => {
            const ladder = LADDERS[n];
            const snake = SNAKES[n];
            const tokens = byPosition.get(n) ?? [];
            const isLadder = ladder !== undefined;
            const isSnake = snake !== undefined;
            const isLast = lastMove?.to === n;
            const isTakeoff = lastMove?.from === n;
            const classes = [
              'tile',
              n % 2 === 0 ? 'tile--warm' : 'tile--light',
              isLadder ? 'tile--ladder' : '',
              isSnake ? 'tile--snake' : '',
              n === 100 ? 'tile--finish' : '',
              isLast ? 'tile--last' : '',
              isTakeoff ? 'tile--from' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={n} className={classes} data-tile={n}>
                <span className="tile__num">{n}</span>
                {tokens.length > 0 && (
                  <div className="tile__tokens">
                    {tokens.map((player) => (
                      <Token key={player.seat} player={player} active={activeSeat === player.seat} compact={compact} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <svg className="board-art" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={snakeGradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7a9d7a" />
              <stop offset="55%" stopColor="#5e8b78" />
              <stop offset="100%" stopColor="#8a5b86" />
            </linearGradient>
          </defs>
          {Object.entries(SNAKES).map(([from, to], index) => (
            <SnakeArt key={`s${from}`} from={Number(from)} to={to} index={index} gradient={snakeGradient} />
          ))}
          {Object.entries(LADDERS).map(([from, to]) => (
            <LadderArt key={`l${from}`} from={Number(from)} to={to} />
          ))}
        </svg>
      </div>
      <div className="start-tray" aria-label={`${startLabel}: ${atStart.map((player) => player.name).join(', ') || 'empty'}`}>
        <span className="start-tray__label">● {startLabel.toUpperCase()}</span>
        <div className="start-tray__tokens">
          {atStart.map((player) => (
            <Token key={player.seat} player={player} active={activeSeat === player.seat} compact={compact} />
          ))}
        </div>
        <span className="start-tray__meta">1 → 100</span>
      </div>
    </div>
  );
}
