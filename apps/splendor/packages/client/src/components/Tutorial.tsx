import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { T } from '../i18n';
import { playSfx } from '../ui/sfx';
import { GemIcon } from '../ui/gems';

const SEEN_KEY = 'splendor.tutorial.v1';

/** 是否已经看过新手引导 */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * 三步上手：首次启动自动出现一次，之后可在设置页「重看新手引导」。
 * 只有文字 + 少量图形提示，不打断任何对局（可随时跳过）。
 */
export function TutorialOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const steps = useMemo(
    () => [
      { title: T.tutorial.step1Title, body: T.tutorial.step1Body, art: <ModeArt /> },
      { title: T.tutorial.step2Title, body: T.tutorial.step2Body, art: <ActionArt /> },
      { title: T.tutorial.step3Title, body: T.tutorial.step3Body, art: <GoalArt /> },
    ],
    [],
  );

  if (!open) return null;
  const isLast = step >= steps.length - 1;
  const current = steps[step]!;

  const finish = (): void => {
    markTutorialSeen();
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] grid place-items-center p-4"
        style={{ background: 'rgba(35, 45, 60, 0.45)' }}
        data-testid="tutorial"
      >
        <motion.div
          initial={{ scale: 0.96, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="surface w-full max-w-[460px] rounded-2xl p-5"
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black text-ink-900">{T.tutorial.title}</span>
            <span className="tnum ml-auto text-[11px] text-ink-400">
              {step + 1} / {steps.length}
            </span>
          </div>

          <div className="mt-4 flex items-start gap-4">
            <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-xl bg-paper-100">{current.art}</div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink-900">{current.title}</div>
              <div className="mt-1 text-[12px] leading-relaxed text-ink-500">{current.body}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              data-testid="tutorial-skip"
              onClick={finish}
              className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-semibold hover:border-paper-400"
            >
              {T.tutorial.skip}
            </button>
            <span className="ml-auto flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent-500' : 'bg-paper-300'}`} />
              ))}
            </span>
            <button
              type="button"
              data-testid="tutorial-next"
              onClick={() => {
                playSfx('gemTake');
                if (isLast) finish();
                else setStep((v) => v + 1);
              }}
              className="btn-primary rounded-xl px-4 py-1.5 text-[12px] font-bold hover:brightness-110"
            >
              {isLast ? T.tutorial.done : T.tutorial.next}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** 四种玩法的极简图示 */
function ModeArt() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`h-5 w-5 rounded-md ${i === 0 ? 'bg-accent-500/80' : 'bg-paper-300'}`} />
      ))}
    </div>
  );
}

/** 三枚宝石 + 一张牌：一回合做一件事 */
function ActionArt() {
  return (
    <div className="flex items-center gap-1.5">
      <GemIcon color="white" size={18} />
      <GemIcon color="blue" size={18} />
      <GemIcon color="green" size={18} />
      <span className="mx-1 h-6 w-px bg-paper-300" />
      <span className="grid h-9 w-7 place-items-center rounded-md border border-paper-300 bg-white text-[11px] font-bold text-ink-500">
        +
      </span>
    </div>
  );
}

/** 15 分目标 */
function GoalArt() {
  return (
    <div className="flex items-baseline gap-1">
      <span className="tnum text-[26px] font-black text-accent-700">15</span>
      <span className="text-[11px] font-bold text-ink-400">pts</span>
    </div>
  );
}
