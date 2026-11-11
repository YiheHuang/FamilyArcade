import { useState } from 'react';
import type { Lang } from '../i18n';
import { Button, Modal, type T } from './components';
import { MiniGarden, TileFace } from './tiles';

const LINE3 = [
  { x: 0, y: 0, tile: 0 },
  { x: 1, y: 0, tile: 1 },
  { x: 2, y: 0, tile: 2 },
];

const BLOOM6 = [
  { x: -2, y: 0, tile: 0 },
  { x: -1, y: 0, tile: 1 },
  { x: 0, y: 0, tile: 2 },
  { x: 1, y: 0, tile: 3 },
  { x: 2, y: 0, tile: 4 },
  { x: 3, y: 0, tile: 5 },
];

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
  const [picked, setPicked] = useState(false);

  const actions = (
    <>
      <Button variant="ghost" onClick={onSkip}>
        {t('tutorial.skip')}
      </Button>
      {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>{t('tutorial.back')}</Button>}
      <Button variant="primary" onClick={() => (step < 2 ? setStep((s) => s + 1) : onDone())}>
        {step < 2 ? t('tutorial.next') : t('tutorial.done')}
      </Button>
    </>
  );

  return (
    <Modal title={t('tutorial.title')} onClose={onSkip} closeLabel={t('common.close')} actions={actions}>
      <div className="tutorial">
        <div className="tutorial__steps" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? 'is-active' : undefined} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="tutorial__rack">
              {[0, 6, 12].map((tile, i) => (
                <TileFace
                  key={tile}
                  tile={tile}
                  size={66}
                  selected={picked && i === 0}
                  onClick={() => setPicked(true)}
                  ariaLabel={t('tutorial.demoSelect')}
                />
              ))}
            </div>
            <h3>{t('tutorial.step1Title')}</h3>
            <p>{t('tutorial.step1')}</p>
            <p className="tutorial__hint">
              {picked ? `✓ ${lang === 'zh' ? '已选中一张' : 'One tile selected'}` : t('tutorial.demoSelect')}
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <MiniGarden tiles={LINE3} />
            <h3>{t('tutorial.step2Title')}</h3>
            <p>{t('tutorial.step2')}</p>
            <p className="tutorial__hint">{t('tutorial.demoLine')}</p>
          </>
        )}

        {step === 2 && (
          <>
            <MiniGarden tiles={BLOOM6} />
            <h3>{t('tutorial.step3Title')}</h3>
            <p>{t('tutorial.step3')}</p>
            <p className="tutorial__hint">{t('tutorial.demoConfirm', { points: 12 })}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
