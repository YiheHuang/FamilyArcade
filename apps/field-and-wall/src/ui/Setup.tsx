import { useEffect, useState } from 'react';
import { AI_LEVELS, type AiLevel, type GameConfig, type PlayerKind, type SeatConfig } from '../game/types';
import type { Lang } from '../i18n';
import { Button, SeatMark, Segmented, type T } from './components';
import { TilePreview } from './TileArt';

function defaultSeats(mode: 'solo' | 'hotseat', count: number, lang: Lang): SeatConfig[] {
  return Array.from({ length: count }, (_, i) => {
    if (mode === 'solo') {
      return i === 0
        ? { name: lang === 'zh' ? '你' : 'You', kind: 'human', level: 'normal' }
        : { name: lang === 'zh' ? `电脑 ${i}` : `AI ${i}`, kind: 'ai', level: 'normal' };
    }
    return {
      name: lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`,
      kind: 'human',
      level: 'normal',
    };
  });
}

const SHOWCASE = [
  { type: 'city-corner', rot: 0 as const },
  { type: 'road-curve', rot: 1 as const },
  { type: 'monastery-road', rot: 3 as const },
  { type: 'city-gate', rot: 0 as const },
];

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
    setSeats((previous) => {
      const next = defaultSeats(mode, count, lang);
      for (let i = 0; i < Math.min(previous.length, next.length); i++) {
        const name = previous[i].name;
        const isDefault =
          !name ||
          name === '你' ||
          name === 'You' ||
          name.startsWith('玩家 ') ||
          name.startsWith('Player ') ||
          name.startsWith('电脑 ') ||
          name.startsWith('AI ');
        if (!isDefault) next[i] = { ...next[i], name, kind: previous[i].kind, level: previous[i].level };
      }
      return next;
    });
  }, [count, mode, lang]);

  const update = (index: number, patch: Partial<SeatConfig>): void => {
    setSeats((previous) => previous.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)));
  };

  const start = (): void => {
    const config: GameConfig = {
      playerCount: count,
      seats: seats.map((seat, i) => ({
        ...seat,
        name: seat.name.trim() || (lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`),
      })),
      seed: `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
    onStart(config);
  };

  return (
    <div className="setup screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
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
              onChange={(value) => setCount(value)}
            />
          </div>

          <div className="seat-list">
            {seats.map((seat, i) => {
              return (
                <div className="seat-row" key={i}>
                  <SeatMark seat={i} size={26} />
                  <div className="seat-row__fields">
                    <label className="field field--inline">
                      <span className="field__label">
                        {t('setup.seat')} {i + 1} · {t('setup.name')}
                      </span>
                      <input
                        className="input"
                        value={seat.name}
                        maxLength={16}
                        onChange={(event) => update(i, { name: event.target.value })}
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
                          onChange={(event) => update(i, { level: event.target.value as AiLevel })}
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
              );
            })}
          </div>

          <p className="hint-text">
            {mode === 'solo' ? t('setup.soloNote') : t('setup.hotseatNote')} {t('setup.hint')}
          </p>
          <Button variant="primary" wide testId="start-game" onClick={start}>
            {t('setup.start')} →
          </Button>
        </section>

        <aside className="setup__preview" aria-hidden>
          <div className="setup__tiles">
            {SHOWCASE.map((tile, i) => (
              <div className="setup__tile" key={tile.type} style={{ transform: `rotate(${i % 2 === 0 ? -4 : 3}deg)` }}>
                <TilePreview typeId={tile.type} rot={tile.rot} size={112} />
              </div>
            ))}
          </div>
          <div className="panel setup__legend">
            <p className="eyebrow">{t('setup.legendTitle')}</p>
            <div className="legend-row">
              <span className="legend-swatch legend-swatch--city" />
              <span>{t('rules.city')}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch legend-swatch--road" />
              <span>{t('rules.road')}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch legend-swatch--field" />
              <span>{t('game.feature.field')}</span>
            </div>
            <p className="muted setup__legend-note">{t('setup.preview')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
