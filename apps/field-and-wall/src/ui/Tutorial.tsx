import { useState } from 'react';
import type { Rotation } from '../game/types';
import type { T } from './components';
import { TileArt, TilePreview } from './TileArt';
import { palette } from './theme';

function MiniMeeple({ on }: { on: boolean }) {
  return (
    <span className={`tut-meeple${on ? ' is-on' : ''}`} aria-hidden>
      {on ? (
        <svg viewBox="0 0 24 30" width={24} height={30}>
          <circle cx={12} cy={7} r={4.4} fill={palette.ink} />
          <path d="M8 12 L3 16 L4.4 19 L8 16 L8 26 L10.2 26 L12 21 L13.8 26 L16 26 L16 16 L19.6 19 L21 16 L16 12 Z" fill={palette.ink} />
        </svg>
      ) : (
        <span className="tut-meeple__ring" />
      )}
    </span>
  );
}

export function Tutorial({ t, onDone, onSkip }: { t: T; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(1);
  const [rot, setRot] = useState<Rotation>(0);
  const [rotated, setRotated] = useState(false);
  const [slot, setSlot] = useState(false);
  const [meeple, setMeeple] = useState<null | 'city' | 'none'>(null);

  const canNext =
    step === 1 ? rotated : step === 2 ? slot : step === 3 ? meeple != null : true;

  const next = (): void => {
    if (step < 4 && canNext) setStep(step + 1);
    else if (step === 4) onDone();
  };

  return (
    <div className="tutorial-backdrop" role="presentation" onClick={onSkip}>
      <div
        className="tutorial"
        role="dialog"
        aria-modal="true"
        aria-label={t('tutorial.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tutorial__head">
          <div>
            <p className="eyebrow">{t('tutorial.step', { n: step })}</p>
            <h2>{t('tutorial.title')}</h2>
          </div>
          <button type="button" className="text-btn" onClick={onSkip}>
            {t('tutorial.skip')} →
          </button>
        </div>

        <div className="tutorial__stage">
          {step === 1 && (
            <div className="tut-demo tut-demo--rotate">
              <div className="tut-tile">
                <TilePreview typeId="city-corner" rot={rot} size={170} />
              </div>
              <div className="tut-demo__side">
                <h3>{t('tutorial.step1Title')}</h3>
                <p>{t('tutorial.step1')}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setRot((prev) => ((prev + 1) % 4) as Rotation);
                    setRotated(true);
                  }}
                >
                  ↻ {t('tutorial.tryRotate')}
                </button>
                {rotated && <p className="tut-check">✓ {t('tutorial.rotated')}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="tut-demo tut-demo--slot">
              <div className="tut-mini-board">
                <div className="tut-mini-cell">
                  <TilePreview typeId="city-gate" rot={0} size={118} />
                </div>
                <div
                  className={`tut-mini-cell tut-mini-slot${slot ? ' is-chosen' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSlot(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSlot(true);
                    }
                  }}
                  aria-label={t('tutorial.trySlot')}
                >
                  {slot ? <TilePreview typeId="road-end" rot={3} size={118} /> : <span className="tut-slot-plus">＋</span>}
                </div>
              </div>
              <div className="tut-demo__side">
                <h3>{t('tutorial.step2Title')}</h3>
                <p>{t('tutorial.step2')}</p>
                {slot ? (
                  <p className="tut-check">✓ {t('tutorial.slotChosen')}</p>
                ) : (
                  <p className="muted small">{t('tutorial.trySlot')}</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="tut-demo tut-demo--meeple">
              <div className="tut-tile tut-tile--meeple">
                <svg viewBox="0 0 100 100" width={190} height={190} aria-hidden>
                  <TileArt typeId="city-cap" rot={1} meeple={meeple === 'city' ? 0 : null} meepleFeature={0} />
                </svg>
                {meeple === 'city' && <span className="tut-burst">+2</span>}
              </div>
              <div className="tut-demo__side">
                <h3>{t('tutorial.step3Title')}</h3>
                <p>{t('tutorial.step3')}</p>
                <div className="tut-choices">
                  <button
                    type="button"
                    className={`tut-choice${meeple === 'city' ? ' is-chosen' : ''}`}
                    onClick={() => setMeeple('city')}
                  >
                    <MiniMeeple on={meeple === 'city'} />
                    {t('game.feature.city')}
                  </button>
                  <button
                    type="button"
                    className={`tut-choice${meeple === 'none' ? ' is-chosen' : ''}`}
                    onClick={() => setMeeple('none')}
                  >
                    <span className="tut-choice__none">○</span>
                    {t('game.noMeeple')}
                  </button>
                </div>
                {meeple && <p className="tut-check">✓ {t('tutorial.meepleChosen')}</p>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="tut-demo tut-demo--score">
              <div className="tut-score-card">
                <div className="tut-score-row">
                  <TilePreview typeId="city-corner" rot={0} size={120} />
                  <TilePreview typeId="city-cap" rot={2} size={120} />
                  <TilePreview typeId="city-cap" rot={3} size={120} />
                </div>
                <div className="tut-score-badge">
                  <strong>+6</strong>
                  <span>{t('game.feature.city')}</span>
                </div>
              </div>
              <div className="tut-demo__side">
                <h3>{t('tutorial.step4Title')}</h3>
                <p>{t('tutorial.step4')}</p>
                <p className="muted small">{t('end.finalNote')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="tutorial__foot">
          <div className="tutorial__dots" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={n === step ? 'is-active' : undefined} />
            ))}
          </div>
          <div className="tutorial__actions">
            {step > 1 && (
              <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>
                ← {t('tutorial.back')}
              </button>
            )}
            <button type="button" className="btn btn--primary" onClick={next} disabled={!canNext}>
              {step === 4 ? t('tutorial.done') : t('tutorial.next')} →
            </button>
          </div>
        </div>
        <p className="tutorial__note muted tiny">{t('tutorial.demoNote')}</p>
      </div>
    </div>
  );
}
