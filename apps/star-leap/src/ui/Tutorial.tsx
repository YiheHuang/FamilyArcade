import { useState, type ReactNode } from 'react';
import { Button, Modal, type T } from './components';

function Diagram({ step }: { step: number }) {
  if (step === 0) {
    return (
      <svg className="tut-svg" viewBox="0 0 320 120" aria-hidden>
        {[40, 90, 140, 190, 240].map((x) => (
          <circle key={x} cx={x} cy={60} r={14} fill="#0a111c" stroke="#c9a24b" strokeOpacity={0.4} />
        ))}
        <circle cx={40} cy={60} r={22} fill="#4e6e9e" />
        <circle cx={40} cy={60} r={22} fill="url(#tut-shine)" />
        <circle cx={90} cy={60} r={7} fill="#f5e7c8" />
        <path d="M58 60 H76" stroke="#f5e7c8" strokeWidth={2} strokeDasharray="3 3" />
        <defs>
          <radialGradient id="tut-shine" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#9db6d6" />
            <stop offset="100%" stopColor="#2f4a70" />
          </radialGradient>
        </defs>
      </svg>
    );
  }
  if (step === 1) {
    return (
      <svg className="tut-svg" viewBox="0 0 320 120" aria-hidden>
        {[40, 90, 140, 190, 240].map((x) => (
          <circle key={x} cx={x} cy={60} r={14} fill="#0a111c" stroke="#c9a24b" strokeOpacity={0.4} />
        ))}
        <circle cx={40} cy={60} r={22} fill="#4e6e9e" />
        <circle cx={90} cy={60} r={22} fill="#c9a24b" />
        <circle cx={140} cy={60} r={7} fill="#f5e7c8" />
        <path d="M40 34 Q90 4 140 34" fill="none" stroke="#f5e7c8" strokeWidth={2} strokeDasharray="4 4" />
        <path d="M140 34 l-6 -5 l1 8 z" fill="#f5e7c8" />
      </svg>
    );
  }
  return (
    <svg className="tut-svg" viewBox="0 0 320 120" aria-hidden>
      {Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: row + 1 }, (_, col) => {
          const x = 160 + (col - row / 2) * 24;
          const y = 34 + row * 20;
          return <circle key={`${row}-${col}`} cx={x} cy={y} r={8} fill="#4e6e9e" />;
        }),
      )}
      {Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 4 - row }, (_, col) => {
          const x = 160 + (col - (3 - row) / 2) * 24;
          const y = 74 + row * 14;
          return <circle key={`b-${row}-${col}`} cx={x} cy={y} r={8} fill="#4e6e9e" />;
        }),
      )}
      <circle cx={160} cy={60} r={50} fill="none" stroke="#f5e7c8" strokeOpacity={0.4} strokeDasharray="4 4" />
    </svg>
  );
}

export function Tutorial({
  t,
  onDone,
  onSkip,
}: {
  t: T;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const titles = [t('tutorial.step1Title'), t('tutorial.step2Title'), t('tutorial.step3Title')];
  const texts = [t('tutorial.step1'), t('tutorial.step2'), t('tutorial.step3')];

  const actions: ReactNode = (
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
    <Modal title={t('tutorial.title')} onClose={onSkip} actions={actions}>
      <div className="tutorial">
        <div className="tutorial__steps" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? 'is-active' : undefined} />
          ))}
        </div>
        <Diagram step={step} />
        <h3>{titles[step]}</h3>
        <p>{texts[step]}</p>
      </div>
    </Modal>
  );
}
