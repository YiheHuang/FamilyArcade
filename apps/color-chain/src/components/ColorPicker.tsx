import type { Card, Color } from '../game/color-chain';
import { COLORS } from '../game/color-chain';
import { t, type Lang } from '../i18n';
import { colorName } from '../labels';
import { PlayingCard } from './PlayingCard';

export function ColorPicker({
  card,
  lang,
  onPick,
  onCancel,
}: {
  card: Card;
  lang: Lang;
  onPick: (color: Color) => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="color-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="color-modal-card">
          <PlayingCard card={card} lang={lang} size="lg" decorative />
        </div>
        <div className="color-modal-copy">
          <p className="kicker">{t(lang, 'wild')}</p>
          <h2 id="color-title">{t(lang, 'chooseColor')}</h2>
          <p>{t(lang, 'chooseColorLede')}</p>
          <div className="color-grid">
            {COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                className={`color-choice color-${color}`}
                onClick={() => onPick(color)}
                autoFocus={index === 0}
              >
                <span className={`color-dot color-${color}`} />
                <strong>{colorName(lang, color)}</strong>
              </button>
            ))}
          </div>
          <button type="button" className="text-button" onClick={onCancel}>
            {t(lang, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
