import { balloonName, type Balloon } from '../game/data';
import type { Lang } from '../i18n';
import { BalloonIcon } from './BalloonIcon';
import type { T } from './components';

function spacePoints(): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) points.push({ x: 82 + i * 92, y: 175 });
  for (let i = 10; i < 20; i++) points.push({ x: 910 - (i - 10) * 92, y: 415 });
  return points;
}

const SPACES = spacePoints();

function trackPath(): string {
  let d = `M ${SPACES[0].x} ${SPACES[0].y}`;
  for (let i = 1; i < 10; i++) d += ` L ${SPACES[i].x} ${SPACES[i].y}`;
  d += ` C 986 235, 986 355, ${SPACES[10].x} ${SPACES[10].y}`;
  for (let i = 11; i < 20; i++) d += ` L ${SPACES[i].x} ${SPACES[i].y}`;
  return d;
}

const PATH = trackPath();

export function Track({
  positions,
  balloons,
  t,
  lang,
  highlight = null,
  leading = [],
  className = '',
}: {
  positions: number[];
  balloons: readonly Balloon[];
  t: T;
  lang: Lang;
  highlight?: number | null;
  leading?: number[];
  className?: string;
}) {
  const leaders = leading.length ? leading : [];
  return (
    <div className={`track-wrap ${className}`}>
      <svg
        className="track"
        viewBox="0 0 1000 580"
        role="img"
        aria-label={t('a11y.track')}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="hill-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9efe3" />
            <stop offset="1" stopColor="#dfe8d8" />
          </linearGradient>
          <linearGradient id="hill-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dce7d3" />
            <stop offset="1" stopColor="#cdddc6" />
          </linearGradient>
          <filter id="track-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#5d4b32" floodOpacity="0.12" />
          </filter>
        </defs>

        <circle cx={70} cy={52} r={22} fill="#f2dca8" opacity={0.85} />
        <circle cx={70} cy={52} r={31} fill="#f2dca8" opacity={0.25} />
        <g className="cloud" opacity={0.5} fill="#fffdf7">
          <ellipse cx={800} cy={48} rx={44} ry={14} />
          <ellipse cx={828} cy={40} rx={26} ry={12} />
          <ellipse cx={770} cy={41} rx={22} ry={10} />
        </g>
        <g className="cloud cloud--two" opacity={0.38} fill="#fffdf7">
          <ellipse cx={470} cy={62} rx={36} ry={11} />
          <ellipse cx={492} cy={55} rx={20} ry={9} />
        </g>
        <g stroke="#6f7d68" strokeWidth={1.5} fill="none" opacity={0.45} strokeLinecap="round">
          <path d="M240 80 q7 -6 14 0 q7 -6 14 0" />
          <path d="M610 46 q6 -5 12 0 q6 -5 12 0" />
        </g>

        <path d="M0 330 Q 150 262 310 320 T 620 318 T 1000 292 L 1000 580 L 0 580 Z" fill="url(#hill-a)" />
        <path d="M0 430 Q 180 360 370 425 T 720 418 T 1000 390 L 1000 580 L 0 580 Z" fill="url(#hill-b)" opacity={0.85} />
        <g opacity={0.32} stroke="#8fa189" strokeWidth={1.4} fill="none">
          <path d="M95 522 q18 -24 36 0 M126 522 q18 -20 36 0" />
          <path d="M760 530 q20 -26 40 0 M794 530 q18 -22 36 0" />
        </g>

        <path d={PATH} fill="none" stroke="#d8c9af" strokeWidth={44} strokeLinecap="round" filter="url(#track-shadow)" />
        <path d={PATH} fill="none" stroke="#f7f1e4" strokeWidth={38} strokeLinecap="round" />
        <path
          d={PATH}
          fill="none"
          stroke="#c6b596"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray="3 13"
          opacity={0.75}
        />

        <g className="start-flag">
          <line x1={38} y1={175} x2={38} y2={128} stroke="#6e5536" strokeWidth={3} />
          <path d="M38 128 L74 138 L38 150 Z" fill="#5d8164" />
          <text x={38} y={205} textAnchor="middle" className="track-sign">
            {t('game.start')}
          </text>
        </g>
        <g className="finish-flag">
          <line x1={38} y1={415} x2={38} y2={368} stroke="#6e5536" strokeWidth={3} />
          <g>
            {[0, 1].map((row) =>
              [0, 1, 2].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={38 + col * 8}
                  y={368 + row * 8}
                  width={8}
                  height={8}
                  fill={(row + col) % 2 === 0 ? '#3f4a46' : '#fbf7ed'}
                />
              )),
            )}
          </g>
          <text x={62} y={365} textAnchor="middle" className="track-sign">
            {t('game.finish')}
          </text>
        </g>

        {SPACES.map((point, index) => (
          <g key={index} className={`track-space${index === 19 ? ' is-finish' : ''}`}>
            <circle cx={point.x} cy={point.y} r={14} fill="#fffdf8" stroke="#c9bda9" strokeWidth={1.6} />
            <text x={point.x} y={point.y + 3.6} textAnchor="middle" className="track-number">
              {index + 1}
            </text>
          </g>
        ))}

        {positions.map((position, balloonIndex) => {
          const point = SPACES[Math.max(0, Math.min(19, Math.round(position)))];
          const laneY = point.y < 300 ? point.y - 24 - balloonIndex * 20 : point.y + 24 + balloonIndex * 20;
          const isLeading = leaders.includes(balloonIndex);
          const isHighlight = highlight === balloonIndex;
          const balloon = balloons[balloonIndex];
          return (
            <g
              key={balloon.id}
              className={`track-balloon${isLeading ? ' is-leading' : ''}${isHighlight ? ' is-highlight' : ''}`}
              style={{ transform: `translate(${point.x}px, ${laneY}px)`, transitionDelay: `${balloonIndex * 60}ms` }}
              role="img"
              aria-label={t('a11y.balloonAt', { name: balloonName(balloon, lang), position })}
            >
              <title>{t('a11y.balloonAt', { name: balloonName(balloon, lang), position })}</title>
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={point.y - laneY}
                stroke={balloon.color}
                strokeWidth={1.6}
                strokeDasharray="2 4"
                opacity={0.55}
              />
              {isHighlight && <circle cx={0} cy={-30} r={35} fill={balloon.light} opacity={0.45} />}
              {isLeading && (
                <path
                  d="M -9 -64 L -5 -54 L 4 -62 L 2 -50 L -11 -50 Z"
                  fill="#c3932f"
                  stroke="#75521a"
                  strokeWidth={0.8}
                />
              )}
              <g transform="translate(-20 -58)">
                <BalloonIcon balloon={balloon} size={40} />
              </g>
              <circle cx={15} cy={-8} r={8.5} fill="#fffdf8" stroke={balloon.color} strokeWidth={1.6} />
              <text x={15} y={-4.8} textAnchor="middle" className="track-badge">
                {balloonIndex + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="track-legend" aria-label={t('game.track')}>
        {balloons.map((balloon, index) => (
          <span
            key={balloon.id}
            className={`legend-chip${leaders.includes(index) ? ' is-leading' : ''}`}
            style={{ borderColor: balloon.light }}
          >
            <span className="legend-chip__num" style={{ background: balloon.color }}>
              {index + 1}
            </span>
            <span>{balloonName(balloon, lang)}</span>
            <strong>{positions[index]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
