import { useEffect, useMemo, useState } from 'react';
import { balloonName, TAILWIND_PER_PLAYER } from '../game/data';
import type { GameView } from '../game/types';
import type { Lang } from '../i18n';
import { Button, SeatDot, type T } from './components';
import { Track } from './Track';
import { WindRail } from './WindRail';

export function ReplayScreen({
  view,
  t,
  lang,
  onBack,
}: {
  view: GameView;
  t: T;
  lang: Lang;
  onBack: () => void;
}) {
  const total = view.history.length;
  const [step, setStep] = useState(total);
  const [playing, setPlaying] = useState(false);
  const record = step > 0 ? view.history[step - 1] : null;
  const positions = record ? record.positionsAfter : view.balloons.map(() => 0);
  const leading = positions.map((p, i) => (p === Math.max(...positions) && Math.max(...positions) > 0 ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((value) => Math.min(total, value + 1)), 1500);
    return () => window.clearTimeout(timer);
  }, [playing, step, total]);

  const standings = useMemo(() => {
    return view.seats
      .map((seat, index) => {
        let roundPoints = 0;
        let overallPoints = 0;
        let correct = 0;
        let spent = 0;
        for (let i = 0; i < step; i++) {
          const row = view.history[i];
          roundPoints += row.points[index];
          overallPoints += row.overallPoints?.[index] ?? 0;
          if (row.leaders.includes(row.supports[index])) correct += 1;
          if (row.tailwinds[index]) spent += 1;
        }
        const tokensLeft = Math.max(0, TAILWIND_PER_PLAYER - spent);
        return {
          seat: index,
          name: seat.name,
          total: roundPoints + overallPoints + tokensLeft,
          roundPoints,
          overallPoints,
          tokensLeft,
          correct,
        };
      })
      .sort((a, b) => b.total - a.total || b.correct - a.correct || b.tokensLeft - a.tokensLeft);
  }, [step, view.history, view.seats]);

  return (
    <div className="replay screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('replay.back')}
        </button>
        <div>
          <p className="eyebrow">{t('app.nameEn')}</p>
          <h1>{t('replay.title')}</h1>
          <p className="muted">
            {step === 0
              ? t('replay.atStart')
              : step >= total
                ? t('replay.finished')
                : t('replay.round', { n: step })}
          </p>
        </div>
        <span />
      </header>

      {total === 0 ? (
        <p className="panel empty-state">{t('replay.empty')}</p>
      ) : (
        <div className="replay__grid">
          <main className="panel replay__main">
            <Track positions={positions} balloons={view.balloons} t={t} lang={lang} leading={leading} />
            <div className="replay__controls">
              <Button onClick={() => setStep(0)} disabled={step === 0}>
                ⏮ {t('replay.start')}
              </Button>
              <Button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                ← {t('replay.prev')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (step >= total) setStep(0);
                  setPlaying((value) => !value);
                }}
                testId="replay-play"
              >
                {playing ? `❚❚ ${t('replay.pause')}` : `▶ ${t('replay.play')}`}
              </Button>
              <Button onClick={() => setStep((value) => Math.min(total, value + 1))} disabled={step === total}>
                {t('replay.next')} →
              </Button>
              <span className="replay__step">{t('replay.step', { n: step, total })}</span>
            </div>
          </main>

          <aside className="replay__side">
            <section className="panel">
              <WindRail
                wind={record ? record.wind : null}
                revealed={record ? record.wind.length : 0}
                balloons={view.balloons}
                lang={lang}
                t={t}
                supports={record ? record.supports : null}
              />
              <h3 className="replay__subhead">{t('replay.supports')}</h3>
              <div className="replay-supports">
                {record ? (
                  view.seats.map((seat, index) => {
                    const balloon = view.balloons[record.supports[index]];
                    return (
                      <div key={index} className="replay-support">
                        <SeatDot seat={index} />
                        <span>{seat.name}</span>
                        <span style={{ color: balloon.color }}>
                          {balloonName(balloon, lang)}
                          {record.tailwinds[index] ? ` · ${t('game.tailwindShort')}` : ''}
                        </span>
                        <strong>+{record.points[index]}</strong>
                      </div>
                    );
                  })
                ) : (
                  <p className="muted">{t('replay.noSupports')}</p>
                )}
              </div>
            </section>

            <section className="panel">
              <h3>{t('game.standings')}</h3>
              <div className="replay-standings">
                {standings.map((row, index) => (
                  <div key={row.seat} className="replay-standing">
                    <span className="replay-standing__rank">{index + 1}</span>
                    <SeatDot seat={row.seat} />
                    <span>{row.name}</span>
                    <span className="muted">
                      {t('game.roundPts')} {row.roundPoints}
                      {row.overallPoints ? ` · ${t('game.overallPts')} +${row.overallPoints}` : ''}
                    </span>
                    <strong>{row.total}</strong>
                  </div>
                ))}
              </div>
              <p className="muted replay__note">{t('game.tiebreak')}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
