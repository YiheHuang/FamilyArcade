import { useState } from 'react';
import { AI_LEVELS, type AiLevel, type GameConfig, type PlayerKind, type SeatConfig } from '../game/types';
import { BALLOONS } from '../game/data';
import type { Lang } from '../i18n';
import { Track } from './Track';
import { Button, Segmented, SeatDot, type T } from './components';

function defaultSeat(index: number, mode: 'solo' | 'hotseat', lang: Lang): SeatConfig {
  if (mode === 'solo' && index === 0) {
    return { name: lang === 'zh' ? '你' : 'You', kind: 'human', level: 'normal' };
  }
  if (mode === 'solo') {
    return {
      name: lang === 'zh' ? `电脑 ${index}` : `AI ${index}`,
      kind: 'ai',
      level: index === 1 ? 'normal' : 'easy',
    };
  }
  return {
    name: lang === 'zh' ? `玩家 ${index + 1}` : `Player ${index + 1}`,
    kind: 'human',
    level: 'normal',
  };
}

function resize(seats: SeatConfig[], count: number, mode: 'solo' | 'hotseat', lang: Lang): SeatConfig[] {
  return Array.from({ length: count }, (_, index) => seats[index] ?? defaultSeat(index, mode, lang));
}

const PREVIEW_POSITIONS = [4, 8, 2, 11, 6];

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
  const [count, setCount] = useState(2);
  const [seats, setSeats] = useState<SeatConfig[]>(() =>
    Array.from({ length: 2 }, (_, index) => defaultSeat(index, mode, lang)),
  );

  const update = (index: number, patch: Partial<SeatConfig>): void => {
    setSeats((prev) => prev.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)));
  };

  const changeCount = (value: number): void => {
    setCount(value);
    setSeats((prev) => resize(prev, value, mode, lang));
  };

  const hasHuman = seats.some((seat) => seat.kind === 'human');

  const start = (): void => {
    if (!hasHuman) return;
    const config: GameConfig = {
      playerCount: count,
      seed: `rally-${Date.now()}`,
      seats: seats.map((seat, index) => ({
        ...seat,
        name: seat.name.trim().slice(0, 16) || defaultSeat(index, mode, lang).name,
        kind: mode === 'solo' && index === 0 ? 'human' : seat.kind,
      })),
    };
    onStart(config);
  };

  return (
    <div className="setup screen">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onBack}>
          ← {t('setup.back')}
        </button>
        <div>
          <p className="eyebrow">{mode === 'solo' ? t('setup.modeSolo') : t('setup.modeHotseat')}</p>
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
              options={[2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))}
              onChange={changeCount}
            />
          </div>

          <div className="seat-list">
            {seats.map((seat, index) => (
              <div className="seat-row" key={index}>
                <SeatDot seat={index} />
                <div className="seat-row__fields">
                  <label className="field field--inline">
                    <span className="field__label">{t('setup.name')}</span>
                    <input
                      className="input"
                      value={seat.name}
                      maxLength={16}
                      onChange={(event) => update(index, { name: event.target.value })}
                      aria-label={`${t('setup.seat')} ${index + 1} ${t('setup.name')}`}
                      data-testid={`seat-name-${index}`}
                    />
                  </label>
                  <div className="seat-row__kind">
                    <Segmented
                      value={seat.kind}
                      label={`${t('setup.seat')} ${index + 1}`}
                      options={[
                        { value: 'human' as PlayerKind, label: t('setup.human') },
                        { value: 'ai' as PlayerKind, label: t('setup.ai') },
                      ]}
                      onChange={(kind) => {
                        if (mode === 'solo' && index === 0) return;
                        update(index, { kind });
                      }}
                    />
                    {seat.kind === 'ai' && (
                      <select
                        className="select"
                        value={seat.level}
                        aria-label={`${t('setup.level')} ${index + 1}`}
                        onChange={(event) => update(index, { level: event.target.value as AiLevel })}
                      >
                        {AI_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {t(`ai.${level}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="hint-text">{t('setup.hint')}</p>
          {!hasHuman && <p className="hint-text hint-text--warn">{t('setup.noHumans')}</p>}
          <Button variant="primary" wide testId="start-game" onClick={start} disabled={!hasHuman}>
            {t('setup.start')} →
          </Button>
        </section>

        <aside className="setup__preview" aria-hidden>
          <Track
            positions={PREVIEW_POSITIONS}
            balloons={BALLOONS}
            t={t}
            lang={lang}
            leading={[3]}
            className="track--preview"
          />
          <p className="muted center">{t('setup.previewHint')}</p>
        </aside>
      </div>

      <div className="setup-strip">
        {[
          { num: '01', text: t('rules.rule1') },
          { num: '02', text: t('rules.rule3') },
          { num: '03', text: t('rules.rule4') },
        ].map((item) => (
          <div key={item.num} className="setup-strip__item">
            <span>{item.num}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
