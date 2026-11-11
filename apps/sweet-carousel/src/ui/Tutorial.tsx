import { useState } from 'react';
import { Button, DessertIcon, Modal, type T } from './components';

export function Tutorial({ t, onDone, onSkip }: { t: T; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: t('tutorial.step1Title'),
      body: t('tutorial.step1Body'),
      art: (
        <div className="tutorial-art tutorial-art--cards" aria-hidden>
          <div className="tutorial-card tutorial-card--0">
            <DessertIcon type="macaron" size={54} />
          </div>
          <div className="tutorial-card tutorial-card--1">
            <DessertIcon type="tart" size={54} />
          </div>
          <div className="tutorial-card tutorial-card--2">
            <DessertIcon type="candy" size={54} />
          </div>
        </div>
      ),
    },
    {
      title: t('tutorial.step2Title'),
      body: t('tutorial.step2Body'),
      art: (
        <div className="tutorial-art tutorial-art--pass" aria-hidden>
          <span className="tutorial-pass__seat">A</span>
          <span className="tutorial-pass__arrow">↺</span>
          <span className="tutorial-pass__seat">B</span>
          <span className="tutorial-pass__arrow">↺</span>
          <span className="tutorial-pass__seat">C</span>
        </div>
      ),
    },
    {
      title: t('tutorial.step3Title'),
      body: t('tutorial.step3Body'),
      art: (
        <div className="tutorial-art tutorial-art--combos" aria-hidden>
          <div className="tutorial-combo">
            <DessertIcon type="eclair" size={30} />
            <DessertIcon type="eclair" size={30} />
            <span>2</span>
          </div>
          <div className="tutorial-combo">
            <DessertIcon type="pudding" size={30} />
            <DessertIcon type="pudding" size={30} />
            <DessertIcon type="pudding" size={30} />
            <span>6</span>
          </div>
          <div className="tutorial-combo">
            <DessertIcon type="cake" size={30} />
            <DessertIcon type="cake" size={30} />
            <DessertIcon type="cake" size={30} />
            <DessertIcon type="cake" size={30} />
            <span>12</span>
          </div>
        </div>
      ),
    },
  ];
  const current = steps[step];
  return (
    <Modal
      title={t('tutorial.title')}
      onClose={onSkip}
      actions={
        <>
          <Button testId="tutorial-skip" variant="ghost" onClick={onSkip}>
            {t('tutorial.skip')}
          </Button>
          <Button
            testId="tutorial-next"
            variant="primary"
            onClick={() => {
              if (step === steps.length - 1) onDone();
              else setStep((value) => value + 1);
            }}
          >
            {step === steps.length - 1 ? t('tutorial.done') : t('tutorial.next')} →
          </Button>
        </>
      }
    >
      <div className="tutorial" data-testid="tutorial">
        <div className="tutorial__steps" aria-label={t('tutorial.step', { n: step + 1 })}>
          {steps.map((_, index) => (
            <span key={index} className={index === step ? 'is-active' : ''} />
          ))}
        </div>
        {current.art}
        <div className="eyebrow">{t('tutorial.step', { n: step + 1 })}</div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
      </div>
    </Modal>
  );
}
