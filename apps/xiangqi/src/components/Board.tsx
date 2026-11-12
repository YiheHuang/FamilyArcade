import { t, type Lang, type MessageKey } from '../i18n';
import type { Cell, Move, PieceType, Side } from '../game/xiangqi';

const EN_GLYPH: Record<PieceType, string> = {
  G: 'G',
  A: 'A',
  E: 'E',
  H: 'H',
  R: 'R',
  C: 'C',
  S: 'S',
};

const ZH_GLYPH: Record<Side, Record<PieceType, string>> = {
  R: { G: '帥', A: '仕', E: '相', H: '馬', R: '車', C: '炮', S: '兵' },
  B: { G: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', S: '卒' },
};

const PIECE_NAME: Record<PieceType, MessageKey> = {
  G: 'pieceGeneral',
  A: 'pieceAdvisor',
  E: 'pieceElephant',
  H: 'pieceHorse',
  R: 'pieceChariot',
  C: 'pieceCannon',
  S: 'pieceSoldier',
};

export function pieceGlyph(piece: Exclude<Cell, null>, lang: Lang): string {
  return lang === 'zh' ? ZH_GLYPH[piece.side][piece.type] : EN_GLYPH[piece.type];
}

export function SideGlyph({ side, lang }: { side: Side; lang: Lang }) {
  return (
    <span className={`side-glyph side-${side.toLowerCase()}`}>
      {lang === 'zh' ? (side === 'R' ? '帥' : '將') : side === 'R' ? 'R' : 'B'}
    </span>
  );
}

function BoardLines() {
  const lines = [];
  for (let row = 0; row <= 9; row += 1) {
    lines.push(
      <line key={`h${row}`} x1={0} y1={row} x2={8} y2={row} />,
    );
  }
  for (let col = 0; col <= 8; col += 1) {
    if (col === 0 || col === 8) {
      lines.push(<line key={`v${col}`} x1={col} y1={0} x2={col} y2={9} />);
    } else {
      lines.push(<line key={`vt${col}`} x1={col} y1={0} x2={col} y2={4} />);
      lines.push(<line key={`vb${col}`} x1={col} y1={5} x2={col} y2={9} />);
    }
  }
  return (
    <svg
      className="xq-lines"
      viewBox="0 0 8 9"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g>{lines}</g>
      <g>
        <line x1={3} y1={0} x2={5} y2={2} />
        <line x1={5} y1={0} x2={3} y2={2} />
        <line x1={3} y1={7} x2={5} y2={9} />
        <line x1={5} y1={7} x2={3} y2={9} />
      </g>
    </svg>
  );
}

export function Board({
  board,
  flipped = false,
  selected = null,
  targets = [],
  last = null,
  hint = null,
  checkSquare = null,
  cursor = null,
  disabled,
  lang,
  onPoint,
}: {
  board: Cell[];
  flipped?: boolean;
  selected?: number | null;
  targets?: number[];
  last?: Move | null;
  hint?: Move | null;
  checkSquare?: number | null;
  cursor?: number | null;
  disabled?: boolean;
  lang: Lang;
  onPoint: (index: number) => void;
}) {
  const targetSet = new Set(targets);
  return (
    <div className={`xq-board ${flipped ? 'is-flipped' : ''}`} role="grid" aria-label={t(lang, 'boardLabel')}>
      <div className="xq-grid">
        <BoardLines />
        <div className="river-word" aria-hidden="true">
          {lang === 'zh' ? '楚 河 · 汉 界' : 'R I V E R'}
        </div>
        {board.map((cell, index) => {
          const row = Math.floor(index / 9);
          const col = index % 9;
          const displayRow = flipped ? 9 - row : row;
          const displayCol = flipped ? 8 - col : col;
          const isTarget = targetSet.has(index);
          const classes = [
            'xq-point',
            cell ? `xq-${cell.side.toLowerCase()}` : 'xq-empty',
            selected === index ? 'is-selected' : '',
            isTarget ? (cell ? 'is-capture' : 'is-target') : '',
            last?.from === index ? 'last-from' : '',
            last?.to === index ? 'last-to' : '',
            hint?.from === index ? 'hint-from' : '',
            hint?.to === index ? 'hint-to' : '',
            checkSquare === index ? 'is-check' : '',
            cursor === index ? 'is-cursor' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label = cell
            ? t(lang, cell.side === 'R' ? 'pointRed' : 'pointBlack', {
                file: col + 1,
                rank: row + 1,
                piece: t(lang, PIECE_NAME[cell.type]),
              })
            : t(lang, 'pointEmpty', { file: col + 1, rank: row + 1 });
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              data-index={index}
              className={classes}
              aria-label={label}
              disabled={disabled}
              style={{
                left: `${displayCol * 12.5}%`,
                top: `${displayRow * (100 / 9)}%`,
              }}
              onClick={() => onPoint(index)}
            >
              {cell ? (
                <span className={`xq-disc xq-disc-${cell.side.toLowerCase()}`}>
                  <span className="xq-glyph">{pieceGlyph(cell, lang)}</span>
                </span>
              ) : null}
              {isTarget && !cell ? <span className="xq-target-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
