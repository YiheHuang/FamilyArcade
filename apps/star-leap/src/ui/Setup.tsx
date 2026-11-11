import { useEffect, useMemo, useState } from 'react';
import { AI_LEVELS, type AiLevel, type GameConfig, type PlayerKind, type SeatConfig } from '../game/types';
import { setup } from '../game/engine';
import type { Lang } from '../i18n';
import { Board } from './Board';
import { Button, Segmented, type T } from './components';
import { seatTheme } from './theme';

function defaultSeats(mode: 'solo' | 'hotseat', count: number, lang: Lang): SeatConfig[] {
  return Array.from({ length: count }, (_, i) => {
    if (mode === 'solo') {
      return i === 0
        ? { name: lang === 'zh' ? '你' : 'You', kind: 'human', level: 'normal' }
        : { name: lang === 'zh' ? `电脑 ${i}` : `AI ${i}`, kind: 'ai', level: i === 1 ? 'normal' : 'easy' };
    }
    return {
      name: lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`,
      kind: 'human',
      level: 'normal',
    };
  });
}

const levelLabel = (level: AiLevel, t: T): string => t(`ai.${level}`);

export function Setup({
  t,
  lang,
  mode,
  onStart,
  onBack,
}: {
  t: T;
  lang: Lang;
  mode: 'solo' | 'hotseat';
  onStart: (config: GameConfig) => void;
  onBack: () => void;
}) {
  const [count, setCount] = useState<2 | 3 | 4>(2);
  const [seats, setSeats] = useState<SeatConfig[]>(() => defaultSeats(mode, 2, lang));

  useEffect(() => {
    setSeats((prev) => {
      const next = defaultSeats(mode, count, lang);
      for (let i = 0; i < Math.min(prev.length, next.length); i++) {
        if (prev[i].name && !prev[i].name.startsWith('玩家') && !prev[i].name.startsWith('Player') && !prev[i].name.startsWith('电脑') && !prev[i].name.startsWith('AI ') && prev[i].name !== '你' && prev[i].name !== 'You') {
          next[i] = { ...next[i], name: prev[i].name, kind: prev[i].kind, level: prev[i].level };
        }
      }
      return next;
    });
  }, [count, mode, lang]);

  const update = (index: number, patch: Partial<SeatConfig>): void => {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const preview = useMemo(
    () =>
      setup({
        playerCount: count,
        seats: seats.map((s) => ({ ...s, name: s.name || `P${s.name}` })),
      }),
    [count, seats],
  );

  const start = (): void => {
    onStart({
      playerCount: count,
      seats: seats.map((s, i) => ({ ...s, name: s.name.trim() || (lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`) })),
    });
  };

  return (
    <div className="setup screen">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onBack}>
          ← {t('setup.back')}
        </button>
        <div>
          <h1>{t('setup.title')}</h1>
          <p className="muted">{t('setup.subtitle')}</p>
        </div>
        <span />
      </header>

      <div className="setup__grid">
        <section className="panel setup__form">
          <div className="field">
            <span className="field__label">{t('setup.players')}</span>
            <Segmented
              value={count}
              label={t('setup.players')}
              options={[
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
              ]}
              onChange={(v) => setCount(v)}
            />
          </div>

          <div className="seat-list">
            {seats.map((seat, i) => {
              const th = seatTheme(i);
              return (
                <div className="seat-row" key={i}>
                  <span className={`seat-dot seat-dot--${th.mark}`} style={{ background: th.color }} aria-hidden>
                    <span className="seat-dot__mark" />
                  </span>
                  <div className="seat-row__fields">
                    <label className="field field--inline">
                      <span className="field__label">{t('setup.name')}</span>
                      <input
                        className="input"
                        value={seat.name}
                        maxLength={16}
                        onChange={(e) => update(i, { name: e.target.value })}
                        aria-label={`${t('setup.seat')} ${i + 1} ${t('setup.name')}`}
                      />
                    </label>
                    <div className="seat-row__kind">
                      <Segmented
                        value={seat.kind}
                        label={`${t('setup.seat')} ${i + 1}`}
                        options={[
                          { value: 'human' as PlayerKind, label: t('setup.human') },
                          { value: 'ai' as PlayerKind, label: t('setup.ai') },
                        ]}
                        onChange={(kind) => update(i, { kind })}
                      />
                      {seat.kind === 'ai' && (
                        <select
                          className="select"
                          value={seat.level}
                          aria-label={`${t('setup.level')} ${i + 1}`}
                          onChange={(e) => update(i, { level: e.target.value as AiLevel })}
                        >
                          {AI_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {levelLabel(level, t)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="hint-text">{t('setup.hint')}</p>
          <Button variant="primary" wide testId="start-game" onClick={start}>
            {t('setup.start')} →
          </Button>
        </section>

        <aside className="setup__preview" aria-hidden>
          <Board state={preview} interactive={false} compact />
          <p className="muted center">
            {lang === 'zh'
              ? '彩色边线是每个人的目标三角。'
              : 'The coloured outline is each player’s target triangle.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
