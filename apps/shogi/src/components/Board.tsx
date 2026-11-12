import {
  HAND_TYPES,
  squareName,
  type Board as BoardModel,
  type Hand,
  type HandType,
  type Move,
  type Piece,
  type Side,
} from '../game/shogi';
import { pieceName, t, type Lang } from '../i18n';

export function PieceGlyph({ piece: pieceOn, lang }: { piece: Piece; lang: Lang }) {
  const glyph = pieceName(lang, pieceOn.type, pieceOn.promoted);
  return (
    <span
      className={`piece piece-${pieceOn.side} ${pieceOn.promoted ? 'is-promoted' : ''}`}
      data-side={pieceOn.side}
      data-type={pieceOn.type}
      data-promoted={pieceOn.promoted ? 'true' : 'false'}
    >
      <span className="piece-glyph">{glyph}</span>
      {pieceOn.promoted && <span className="promote-mark" aria-hidden="true">+</span>}
    </span>
  );
}

function destinationMatches(
  move: Move,
  selected: number | null,
  dropType: HandType | null,
): boolean {
  if (dropType) return move.kind === 'drop' && move.type === dropType;
  if (selected === null) return false;
  return move.kind === 'move' && move.from === selected;
}

export function Board({
  board,
  legal,
  selected,
  dropType,
  hint,
  lastMove,
  checkSide,
  cursor,
  disabled,
  onCell,
  lang,
  compact = false,
}: {
  board: BoardModel;
  legal: Move[];
  selected: number | null;
  dropType: HandType | null;
  hint: Move | null;
  lastMove: Move | null;
  checkSide: Side | null;
  cursor?: number | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  lang: Lang;
  compact?: boolean;
}) {
  const targetMap = new Map<number, boolean>();
  for (const move of legal) {
    if (destinationMatches(move, selected, dropType)) {
      targetMap.set(move.to, targetMap.get(move.to) === true || Boolean(board[move.to]));
    }
  }

  return (
    <div
      className={`board-frame ${compact ? 'is-compact' : ''}`}
      role="grid"
      aria-label={lang === 'zh' ? '将棋盘' : 'Shogi board'}
    >
      <div className="board">
        {board.map((square, index) => {
          const isTarget = targetMap.has(index);
          const isCapture = targetMap.get(index) === true;
          const isCheck =
            checkSide !== null &&
            square?.side === checkSide &&
            square.type === 'K';
          const classes = [
            'cell',
            square ? `has-${square.side}` : 'is-empty',
            selected === index ? 'selected' : '',
            isTarget ? 'target' : '',
            isCapture ? 'capture-target' : '',
            hint && (hint.to === index || (hint.kind === 'move' && hint.from === index))
              ? 'hint'
              : '',
            lastMove && lastMove.kind === 'move' && lastMove.from === index ? 'last-from' : '',
            lastMove && lastMove.to === index ? 'last-to' : '',
            isCheck ? 'in-check' : '',
            cursor === index ? 'cursor' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label = square
            ? `${squareName(index)}, ${pieceName(lang, square.type, square.promoted, true)}`
            : `${squareName(index)}, ${lang === 'zh' ? '空格' : 'empty'}`;
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={classes}
              aria-label={label}
              disabled={disabled}
              onClick={() => onCell(index)}
            >
              {square ? <PieceGlyph piece={square} lang={lang} /> : null}
              {isTarget && !square ? <span className="target-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HandTray({
  hand,
  side,
  active,
  selectedType,
  hintType,
  onPick,
  lang,
}: {
  hand: Hand;
  side: Side;
  active: boolean;
  selectedType: HandType | null;
  hintType?: HandType | null;
  onPick: (type: HandType) => void;
  lang: Lang;
}) {
  const types = HAND_TYPES.filter((type) => hand[type] > 0);
  return (
    <div className={`hand-tray hand-${side} ${active ? 'is-active' : ''}`}>
      <span className="hand-label">{t(lang, side === 'b' ? 'handBlack' : 'handWhite')}</span>
      <div className="hand-pieces">
        {types.length === 0 && <span className="hand-empty">—</span>}
        {types.map((type) => {
          const content = (
            <>
              <span className="hand-glyph">{pieceName(lang, type)}</span>
              <span className="hand-count">{hand[type]}</span>
            </>
          );
          if (!active) {
            return (
              <span key={type} className="hand-piece is-static" aria-label={`${pieceName(lang, type, false, true)} ${hand[type]}`}>
                {content}
              </span>
            );
          }
          return (
            <button
              key={type}
              type="button"
              className={`hand-piece ${selectedType === type ? 'selected' : ''} ${hintType === type ? 'hint' : ''}`}
              onClick={() => onPick(type)}
              aria-pressed={selectedType === type}
              aria-label={`${pieceName(lang, type, false, true)} ${hand[type]}`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PromotionDialog({
  lang,
  onPromote,
  onKeep,
  onCancel,
}: {
  lang: Lang;
  onPromote: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="promotion-overlay" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
      <div className="promotion-dialog">
        <h3 id="promotion-title">{t(lang, 'promotion')}</h3>
        <div className="promotion-actions">
          <button className="primary" onClick={onPromote} autoFocus>
            {t(lang, 'promote')}
          </button>
          <button className="secondary" onClick={onKeep}>
            {t(lang, 'keep')}
          </button>
          <button className="text-button" onClick={onCancel}>
            {t(lang, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
