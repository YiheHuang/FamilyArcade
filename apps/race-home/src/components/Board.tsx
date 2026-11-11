import type { CSSProperties } from 'react';
import type { GameState, Color } from '../game/race-home';
import { HOME, LANE_START, RING_CELLS, ringCell } from '../game/race-home';
import type { Lang } from '../i18n';
import {
  BASE_POINTS,
  HOME_POINTS,
  LANE_POINTS,
  RING_POINTS,
  YARD_RECT,
  startColor,
} from '../game/geometry';

const COLOR_LABEL: Record<Color, { en: string; zh: string }> = {
  red: { en: 'Red', zh: '红方' },
  green: { en: 'Green', zh: '绿方' },
  yellow: { en: 'Yellow', zh: '黄方' },
  blue: { en: 'Blue', zh: '蓝方' },
};

interface Token {
  key: string;
  color: Color;
  pawn: number;
  pos: number;
  x: number;
  y: number;
  zone: 'base' | 'ring' | 'lane' | 'home';
  scale: number;
}

function stackOffsets(count: number): [number, number][] {
  if (count <= 1) return [[0, 0]];
  if (count === 2) return [
    [-1.15, 0],
    [1.15, 0],
  ];
  if (count === 3) return [
    [0, -1.15],
    [-1.1, 0.9],
    [1.1, 0.9],
  ];
  return [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ];
}

function targetPosition(state: GameState, color: Color, pawn: number): { x: number; y: number } | null {
  const pos = state.pawns[color][pawn];
  if (pos === undefined || state.die === null) return null;
  if (pos === HOME) return null;
  const to = pos === -1 ? 0 : pos + state.die;
  if (to === HOME) {
    return HOME_POINTS[color][pawn];
  }
  if (to >= LANE_START) {
    return LANE_POINTS[color][to - LANE_START];
  }
  const cell = ringCell(color, to);
  return cell === null ? null : RING_POINTS[cell];
}

export function Die({ value, small = false, lang = 'en' }: { value: number | null; small?: boolean; lang?: Lang }) {
  const pipMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const pips = value ? (pipMap[value] ?? []) : [];
  return (
    <div
      className={`die ${small ? 'die-small' : ''} ${value ? '' : 'die-empty'}`}
      data-value={value ?? ''}
      role="img"
      aria-label={
        value
          ? lang === 'zh'
            ? `骰子显示 ${value}`
            : `Die showing ${value}`
          : lang === 'zh'
            ? '骰子未掷'
            : 'Die not rolled'
      }
    >
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={pips.includes(index) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

export function Board({
  state,
  legal,
  hint,
  disabled,
  lang = 'en',
  onPawn,
}: {
  state: GameState;
  legal: number[];
  hint: number | null;
  disabled?: boolean;
  lang?: Lang;
  onPawn: (pawn: number) => void;
}) {
  const tokens: Token[] = [];
  for (const color of state.players) {
    state.pawns[color].forEach((pos, pawn) => {
      let x = 0;
      let y = 0;
      let zone: Token['zone'] = 'base';
      if (pos === -1) {
        const point = BASE_POINTS[color][pawn];
        x = point.x;
        y = point.y;
        zone = 'base';
      } else if (pos >= 0 && pos < RING_CELLS) {
        const cell = ringCell(color, pos);
        const point = RING_POINTS[cell ?? 0];
        x = point.x;
        y = point.y;
        zone = 'ring';
      } else if (pos >= LANE_START && pos < HOME) {
        const point = LANE_POINTS[color][pos - LANE_START];
        x = point.x;
        y = point.y;
        zone = 'lane';
      } else {
        const point = HOME_POINTS[color][pawn];
        x = point.x;
        y = point.y;
        zone = 'home';
      }
      tokens.push({ key: `${color}:${pawn}`, color, pawn, pos, x, y, zone, scale: 1 });
    });
  }

  // Group tokens that share a ring/lane square and fan them out a little.
  const groups = new Map<string, Token[]>();
  for (const token of tokens) {
    const key =
      token.zone === 'ring'
        ? `ring:${ringCell(token.color, token.pos)}`
        : token.zone === 'lane'
          ? `lane:${token.color}:${token.pos}`
          : `${token.zone}:${token.color}:${token.pawn}`;
    const list = groups.get(key) ?? [];
    list.push(token);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const offsets = stackOffsets(group.length);
    group.forEach((token, index) => {
      const [dx, dy] = offsets[index] ?? [0, 0];
      token.x += dx;
      token.y += dy;
      token.scale = group.length > 1 ? 0.76 : 1;
    });
  }

  const currentColor = state.players[state.turn];
  const showTargets = !disabled && legal.length > 0;
  const targets = showTargets
    ? legal
        .map((pawn) => ({ pawn, point: targetPosition(state, currentColor, pawn) }))
        .filter((item): item is { pawn: number; point: { x: number; y: number } } => item.point !== null)
    : [];

  return (
    <div className="board" role="group" aria-label={lang === 'zh' ? '飞行棋棋盘' : 'Race Home board'}>
      {(['red', 'green', 'yellow', 'blue'] as const).map((color) => (
        <div
          key={color}
          className={`yard yard-${color} ${state.players.includes(color) ? 'yard-active' : 'yard-idle'}`}
          style={{ left: `${YARD_RECT[color].x}%`, top: `${YARD_RECT[color].y}%` }}
          aria-hidden="true"
        >
          <div className="yard-inner">
            <span className="yard-dot" />
            <span className="yard-dot" />
            <span className="yard-dot" />
            <span className="yard-dot" />
          </div>
        </div>
      ))}

      <div className="arm arm-top" aria-hidden="true" />
      <div className="arm arm-left" aria-hidden="true" />
      <div className="arm arm-right" aria-hidden="true" />
      <div className="arm arm-bottom" aria-hidden="true" />

      {RING_POINTS.map((point, index) => {
        const color = startColor(index);
        return (
          <div
            key={`ring-${index}`}
            className={`track-cell ${color ? `start-cell start-${color}` : index % 2 ? 'track-alt' : ''}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            data-cell={index}
            aria-hidden="true"
          >
            {color ? <span className={`start-star star-${color}`} /> : null}
          </div>
        );
      })}

      {(['red', 'green', 'yellow', 'blue'] as const).map((color) =>
        LANE_POINTS[color].map((point, index) => (
          <div
            key={`lane-${color}-${index}`}
            className={`lane-cell lane-${color}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            aria-hidden="true"
          />
        )),
      )}

      <div className="house" aria-hidden="true">
        <div className="house-tri house-tri-red" />
        <div className="house-tri house-tri-green" />
        <div className="house-tri house-tri-yellow" />
        <div className="house-tri house-tri-blue" />
        <div className="house-roof" />
        <div className="house-body">
          <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
            <path d="M16 4 L29 15 H25 V27 H7 V15 H3 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M13 27 V19 H19 V27" fill="none" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </div>
      </div>

      {targets.map((target) => (
        <div
          key={`target-${target.pawn}`}
          className={`target-marker target-${currentColor}`}
          style={{ left: `${target.point.x}%`, top: `${target.point.y}%` }}
          aria-hidden="true"
        />
      ))}

      {tokens.map((token) => {
        const isLegal = legal.includes(token.pawn) && token.color === currentColor;
        const isHint = hint === token.pawn && token.color === currentColor;
        return (
          <button
            key={token.key}
            type="button"
            className={`pawn pawn-${token.color} ${token.zone === 'home' ? 'pawn-home' : ''} ${isLegal ? 'legal' : ''} ${isHint ? 'hint' : ''}`}
            data-zone={token.zone}
            data-pawn={token.pawn}
            style={{ left: `${token.x}%`, top: `${token.y}%`, '--pawn-scale': token.scale } as CSSProperties}
            disabled={disabled || !isLegal}
            onClick={() => onPawn(token.pawn)}
            aria-label={`${COLOR_LABEL[token.color][lang]} ${lang === 'zh' ? '棋子' : 'pawn'} ${token.pawn + 1}, ${
              token.zone === 'base'
                ? lang === 'zh'
                  ? '在家门'
                  : 'in the yard'
                : token.zone === 'home'
                  ? lang === 'zh'
                    ? '已到家'
                    : 'home'
                  : token.zone === 'lane'
                    ? lang === 'zh'
                      ? `归家跑道第 ${token.pos - LANE_START + 1} 格`
                      : `lane square ${token.pos - LANE_START + 1}`
                    : lang === 'zh'
                      ? `跑道第 ${token.pos + 1} 格`
                      : `track square ${token.pos + 1}`
            }${isLegal ? (lang === 'zh' ? '，可以移动' : ', ready to move') : ''}`}
            title={isLegal ? (lang === 'zh' ? '移动这枚棋子' : 'Move this pawn') : undefined}
          >
            <span className="pawn-body">
              <span className="pawn-shine" />
              <span className="pawn-number">{token.pawn + 1}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
