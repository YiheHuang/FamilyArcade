import { useEffect, useState } from 'react';
import { balloonName, BALLOONS, SCORING } from '../game/data';
import type { Lang } from '../i18n';
import { BalloonIcon } from './BalloonIcon';
import { Button, type T } from './components';

export function Tutorial({
  t,
  lang,
  onDone,
  onSkip,
}: {
  t: T;
  lang: Lang;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const title =
    step === 0 ? t('tutorial.step1Title') : step === 1 ? t('tutorial.step2Title') : t('tutorial.step3Title');
  const body =
    step === 0 ? t('tutorial.step1') : step === 1 ? t('tutorial.step2') : t('tutorial.step3');

  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-label={t('tutorial.title')}>
      <div className="tutorial">
        <div className="tutorial__head">
          <div>
            <p className="eyebrow">{t('tutorial.step', { n: step + 1, total: 3 })}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="text-btn" onClick={onSkip} aria-label={t('a11y.closeTutorial')}>
            {t('tutorial.skip')} ×
          </button>
        </div>

        <div className="tutorial__art" aria-hidden={step === 1 ? undefined : true}>
          {step === 0 && (
            <div className="tutorial-cover-demo">
              <span className="tutorial-cover-demo__eye">◉</span>
              <span className="tutorial-cover-demo__line" />
              <span className="tutorial-cover-demo__line" />
              <span className="tutorial-cover-demo__line short" />
            </div>
          )}
          {step === 1 && (
            <div className="tutorial-choice">
              {BALLOONS.map((balloon, index) => (
                <button
                  key={balloon.id}
                  type="button"
                  className={`tutorial-choice__item${picked === index ? ' is-picked' : ''}`}
                  aria-pressed={picked === index}
                  aria-label={t('a11y.chooseBalloon', { name: balloonName(balloon, lang) })}
                  onClick={() => setPicked(index)}
                >
                  <BalloonIcon balloon={balloon} size={40} />
                  <span>{balloonName(balloon, lang)}</span>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="tutorial-score">
              <div>
                <strong>+{SCORING.roundLeader}</strong>
                <span>{t('rules.scoreLeader')}</span>
              </div>
              <div>
                <strong>+{SCORING.roundSecond}</strong>
                <span>{t('rules.scoreSecond')}</span>
              </div>
              <div>
                <strong>+{SCORING.overallLeader}</strong>
                <span>{t('rules.scoreOverall')}</span>
              </div>
              <div>
                <strong>+{SCORING.unusedTailwind}</strong>
                <span>{t('rules.scoreTailwind')}</span>
              </div>
            </div>
          )}
        </div>

        <p className="tutorial__body">{body}</p>
        {step === 1 && (
          <p className={`tutorial__feedback${picked === null ? ' is-muted' : ''}`}>
            {picked === null
              ? t('tutorial.demoPick')
              : t('tutorial.demoGood', { name: balloonName(BALLOONS[picked], lang) })}
          </p>
        )}
        {step === 1 && picked !== null && <p className="tutorial__tail">{t('tutorial.demoTailwind')}</p>}

        <div className="tutorial__dots" aria-hidden>
          {[0, 1, 2].map((index) => (
            <span key={index} className={index === step ? 'is-live' : index < step ? 'is-done' : ''} />
          ))}
        </div>

        <div className="tutorial__actions">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              {t('tutorial.back')}
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button variant="primary" testId="tutorial-next" onClick={() => setStep(step + 1)}>
              {t('tutorial.next')} →
            </Button>
          ) : (
            <Button variant="primary" testId="tutorial-done" onClick={onDone}>
              {t('tutorial.done')} →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
