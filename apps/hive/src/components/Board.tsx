import {
  candidateHexes,
  keyOf,
  other,
  queenCell,
  type GameState,
  type Hex,
  type Move,
  type PieceKind,
  type Player,
} from '../game/hive';
import { t, type Lang, type MessageKey } from '../i18n';
import type { Hint } from '../ai/hint';

const R = 66;
const PAD = 34;
const MAX_HEIGHT = 520;

const PIECE_KEYS: Record<PieceKind, MessageKey> = {
  queen: 'pieceQueen',
  ant: 'pieceAnt',
  beetle: 'pieceBeetle',
  grasshopper: 'pieceGrasshopper',
  spider: 'pieceSpider',
};

const PLAYER_KEYS: Record<Player, MessageKey> = {
  W: 'amber',
  B: 'onyx',
};

export function PieceGlyph({ kind }: { kind: PieceKind }) {
  if (kind === 'queen') {
    return (
      <g className="glyph-path">
        <path d="M-13 8 L-13 -4 L-7 1 L0 -11 L7 1 L13 -4 L13 8 Z" />
        <path d="M-13 12 L13 12" />
        <circle cx="0" cy="4" r="2.1" className="glyph-fill" />
      </g>
    );
  }
  if (kind === 'ant') {
    return (
      <g className="glyph-path">
        <circle cx="0" cy="-9" r="3.6" className="glyph-fill" />
        <circle cx="0" cy="-1" r="2.8" className="glyph-fill" />
        <circle cx="0" cy="8" r="4.1" className="glyph-fill" />
        <path d="M-3 -1 L-11 3 M3 -1 L11 3 M-3 7 L-11 11 M3 7 L11 11 M-3 -8 L-11 -11 M3 -8 L11 -11" />
      </g>
    );
  }
  if (kind === 'beetle') {
    return (
      <g className="glyph-path">
        <ellipse cx="0" cy="2" rx="8.2" ry="11" />
        <path d="M0 -9 L0 13 M-8 -3 Q-12 0 -12 4 M8 -3 Q12 0 12 4 M-8 7 Q-12 10 -12 13 M8 7 Q12 10 12 13" />
        <path d="M-4 -9 Q0 -15 4 -9" />
      </g>
    );
  }
  if (kind === 'grasshopper') {
    return (
      <g className="glyph-path">
        <path d="M-10 8 C-14 -2 -3 -11 9 -8" />
        <path d="M9 -8 L14 -11 M9 -8 L13 -3" />
        <path d="M-4 2 L-13 0 M-4 2 L-11 7 M0 5 L-4 12 M0 5 L6 12" />
        <circle cx="9" cy="-8" r="2.8" className="glyph-fill" />
      </g>
    );
  }
  return (
    <g className="glyph-path">
      <circle cx="0" cy="-7" r="3.4" className="glyph-fill" />
      <circle cx="0" cy="2" r="5.2" className="glyph-fill" />
      <path d="M-4 -4 L-12 -9 M4 -4 L12 -9 M-5 -1 L-14 -1 M5 -1 L14 -1 M-4 4 L-12 9 M4 4 L12 9 M-3 6 L-9 14 M3 6 L9 14" />
    </g>
  );
}

export function PieceIcon({
  kind,
  owner,
  className = '',
}: {
  kind: PieceKind;
  owner?: Player;
  className?: string;
}) {
  return (
    <svg
      viewBox="-20 -20 40 40"
      className={`piece-icon ${owner ? `owner-${owner.toLowerCase()}` : ''} ${className}`}
      aria-hidden="true"
    >
      <circle cx="0" cy="0" r="19" className="piece-icon-disc" />
      <PieceGlyph kind={kind} />
    </svg>
  );
}

function hexPoints(radius: number): string {
  const points: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index + 30);
    points.push(`${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

const POINTS = hexPoints(R * 0.97);

function cellLabel(state: GameState, hex: Hex, lang: Lang, legal: boolean): string {
  const stack = state.cells[keyOf(hex)] ?? [];
  if (stack.length === 0) {
    return legal ? t(lang, 'cellLegal') : t(lang, 'cellEmpty');
  }
  const top = stack[stack.length - 1];
  if (stack.length === 1) {
    return t(lang, 'cellPiece', {
      owner: t(lang, PLAYER_KEYS[top.owner]),
      piece: t(lang, PIECE_KEYS[top.kind]),
    });
  }
  return t(lang, 'cellStack', {
    owner: t(lang, PLAYER_KEYS[top.owner]),
    piece: t(lang, PIECE_KEYS[top.kind]),
    n: stack.length,
  });
}

export function Board({
  state,
  legal,
  hint,
  selected,
  actor,
  disabled,
  canMovePieces = true,
  onHex,
  lang,
}: {
  state: GameState;
  legal: Move[];
  hint: Hint | null;
  selected: Hex | null;
  actor: Player;
  disabled?: boolean;
  canMovePieces?: boolean;
  onHex: (hex: Hex) => void;
  lang: Lang;
}) {
  const cells = candidateHexes(state);
  const centers = cells.map((hex) => ({
    hex,
    x: R * Math.sqrt(3) * (hex.q + hex.r / 2),
    y: R * 1.5 * hex.r,
  }));
  const minX = Math.min(...centers.map((item) => item.x)) - R;
  const maxX = Math.max(...centers.map((item) => item.x)) + R;
  const minY = Math.min(...centers.map((item) => item.y)) - R;
  const maxY = Math.max(...centers.map((item) => item.y)) + R;
  const contentWidth = maxX - minX + PAD * 2;
  const contentHeight = maxY - minY + PAD * 2;
  const width = contentWidth;
  const height = contentHeight;

  const legalKeys = new Set<string>();
  for (const move of legal) {
    if (move.type === 'place') legalKeys.add(keyOf(move.at));
    else if (move.type === 'move') legalKeys.add(keyOf(move.to));
  }
  const selectedKey = selected ? keyOf(selected) : null;
  const hintFrom = hint?.move.type === 'move' ? keyOf(hint.move.from) : null;
  const hintTo = hint
    ? hint.move.type === 'place'
      ? keyOf(hint.move.at)
      : hint.move.type === 'move'
        ? keyOf(hint.move.to)
        : null
    : null;
  const lastFrom = state.last?.type === 'move' ? keyOf(state.last.from) : null;
  const lastTo = state.last
    ? state.last.type === 'place'
      ? keyOf(state.last.at)
      : state.last.type === 'move'
        ? keyOf(state.last.to)
        : null
    : null;
  const loser = state.status === 'won' && state.winner ? other(state.winner) : null;
  const fallingQueen = loser ? queenCell(state, loser) : null;
  const fallingKey = fallingQueen ? keyOf(fallingQueen) : null;

  return (
    <svg
      className="hive-board"
      viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
      style={{
        width: `${width.toFixed(1)}px`,
        maxWidth: `min(100%, ${Math.round((MAX_HEIGHT * width) / height)}px)`,
        height: 'auto',
      }}
      role="group"
      aria-label={t(lang, 'boardLabel')}
    >
      {centers.map(({ hex, x, y }) => {
        const key = keyOf(hex);
        const stack = state.cells[key] ?? [];
        const top = stack[stack.length - 1];
        const isLegal = legalKeys.has(key);
        const isOwn = top?.owner === actor;
        const isSelected = selectedKey === key;
        const isHint = hintTo === key;
        const isHintFrom = hintFrom === key;
        const isLast = lastTo === key;
        const isLastFrom = lastFrom === key;
        const isFalling = fallingKey === key;
        const actionable = !disabled && (isLegal || (isOwn && canMovePieces));
        const cx = x - minX + PAD;
        const cy = y - minY + PAD;
        const classes = [
          'hex',
          stack.length > 0 ? 'occupied' : 'empty',
          top ? `owner-${top.owner.toLowerCase()}` : '',
          isOwn ? 'own-piece' : '',
          isLegal ? 'legal' : '',
          isSelected ? 'selected' : '',
          isHint ? 'hint' : '',
          isHintFrom ? 'hint-from' : '',
          isLast ? 'last-to' : '',
          isLastFrom ? 'last-from' : '',
          isFalling ? 'queen-fall' : '',
          actionable ? 'actionable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <g
            key={key}
            className={classes}
            data-key={key}
            data-q={hex.q}
            data-r={hex.r}
            transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
            role="button"
            tabIndex={actionable ? 0 : -1}
            aria-label={cellLabel(state, hex, lang, isLegal)}
            aria-disabled={!actionable}
            onClick={() => {
              if (!disabled) onHex(hex);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onHex(hex);
              }
            }}
          >
            <polygon className="hex-bg" points={POINTS} />
            <polygon className="hex-rim" points={POINTS} />
            {stack.length === 0 && isLegal && (
              <g className="hex-plus" aria-hidden="true">
                <path d="M-11 0 L11 0 M0 -11 L0 11" />
              </g>
            )}
            {stack.map((piece, index) => (
              <g
                key={piece.id}
                className={`piece-layer owner-${piece.owner.toLowerCase()}`}
                transform={`translate(0 ${-index * 5})`}
                aria-hidden="true"
              >
                <circle cx="0" cy="0" r={R * 0.64} className="piece-disc" />
                <circle cx="0" cy="0" r={R * 0.64} className="piece-sheen" />
                <g transform={`scale(${(R / 58).toFixed(2)})`}>
                  <PieceGlyph kind={piece.kind} />
                </g>
              </g>
            ))}
            {stack.length > 1 && (
              <g className="stack-count" aria-hidden="true" transform="translate(24 -24)">
                <circle cx="0" cy="0" r="11" />
                <text x="0" y="0" dominantBaseline="central" textAnchor="middle">
                  {stack.length}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function piece(id: string, kind: PieceKind, owner: Player) {
  return { id, kind, owner };
}

/** A legal-looking midgame used only on the home screen. */
export const PREVIEW_STATE: GameState = {
  cells: {
    '0,0': [piece('preview-w-queen', 'queen', 'W'), piece('preview-b-beetle', 'beetle', 'B')],
    '1,0': [piece('preview-b-ant-1', 'ant', 'B')],
    '0,-1': [piece('preview-w-ant-1', 'ant', 'W')],
    '-1,0': [piece('preview-b-grasshopper-1', 'grasshopper', 'B')],
    '1,-1': [piece('preview-w-beetle-1', 'beetle', 'W')],
    '2,-1': [piece('preview-b-spider-1', 'spider', 'B')],
    '-1,1': [piece('preview-w-spider-1', 'spider', 'W')],
    '2,0': [piece('preview-b-queen', 'queen', 'B')],
    '0,1': [piece('preview-w-grasshopper-1', 'grasshopper', 'W')],
    '1,1': [piece('preview-b-ant-2', 'ant', 'B')],
    '-2,1': [piece('preview-w-ant-2', 'ant', 'W')],
    '3,-1': [piece('preview-b-grasshopper-2', 'grasshopper', 'B')],
  },
  turn: 'W',
  status: 'playing',
  winner: null,
  first: 'W',
  moveCount: 19,
  last: { type: 'move', from: { q: 1, r: 1 }, to: { q: -2, r: 1 } },
};
