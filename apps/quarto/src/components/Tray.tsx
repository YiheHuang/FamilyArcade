import { ALL_PIECES } from '../game/quarto';
import { pieceAriaLabel, t, type Lang } from '../i18n';
import { Piece } from './Board';

export function Tray({
  pool,
  selected,
  interactive,
  hint,
  onPiece,
  lang,
}: {
  pool: number[];
  selected: number | null;
  interactive: boolean;
  hint: number | null;
  onPiece: (piece: number) => void;
  lang: Lang;
}) {
  const remaining = pool.length + (selected !== null ? 1 : 0);

  return (
    <section className="tray" aria-label={t(lang, 'pieceBank')}>
      <div className="tray-head">
        <h3>{t(lang, 'pieceBank')}</h3>
        <span>{t(lang, 'piecesLeft', { n: remaining })}</span>
      </div>
      <div className="tray-grid">
        {ALL_PIECES.map((piece) => {
          const available = pool.includes(piece);
          const inHand = selected === piece;
          const used = !available && !inHand;
          const classes = [
            'piece-slot',
            available ? 'available' : '',
            inHand ? 'in-hand' : '',
            used ? 'used' : '',
            hint === piece ? 'hint' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const status = inHand
            ? t(lang, 'inHand')
            : available
              ? t(lang, 'available')
              : t(lang, 'used');
          return (
            <button
              key={piece}
              type="button"
              className={classes}
              data-piece={piece}
              aria-label={`${pieceAriaLabel(lang, piece)} · ${status}`}
              aria-pressed={inHand}
              disabled={used || inHand || !interactive}
              onClick={() => onPiece(piece)}
            >
              {available || inHand ? (
                <Piece piece={piece} />
              ) : (
                <span className="slot-mark" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
