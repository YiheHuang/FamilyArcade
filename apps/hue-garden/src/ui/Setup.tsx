import { useMemo, useState } from 'react';
import { AI_LEVELS, type AiLevel, type GameConfig, type PlayerKind, type SeatConfig } from '../game/types';
import type { Lang } from '../i18n';
import { Button, Segmented, type T } from './components';
import { MiniGarden } from './tiles';
import { SETUP_GARDEN } from './demoArt';
import { colorTheme } from './theme';

function defaultSeats(mode: 'solo' | 'hotseat', count: number, lang: Lang): SeatConfig[] {
  return Array.from({ length: count }, (_, i) => {
    if (mode === 'solo') {
      return i === 0
        ? { name: lang === 'zh' ? '你' : 'You', kind: 'human', level: 'normal' }
        : {
            name: lang === 'zh' ? `电脑 ${i}` : `AI ${i}`,
            kind: 'ai',
            level: i === 1 ? 'normal' : 'easy',
          };
    }
    return {
      name: lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`,
      kind: 'human',
      level: 'normal',
    };
  });
}

function makeSeed(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `hg-${Date.now().toString(36)}-${random}`;
}

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
  const [seed] = useState(makeSeed);

  const setCountSafely = (nextCount: 2 | 3 | 4): void => {
    setCount(nextCount);
    setSeats((prev) => {
      if (nextCount <= prev.length) return prev.slice(0, nextCount);
      const additions = defaultSeats(mode, nextCount, lang).slice(prev.length);
      return [...prev, ...additions];
    });
  };

  const update = (index: number, patch: Partial<SeatConfig>): void => {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const start = (): void => {
    onStart({
      playerCount: count,
      seats: seats.map((s, i) => ({
        ...s,
        name: s.name.trim() || (lang === 'zh' ? `玩家 ${i + 1}` : `Player ${i + 1}`),
      })),
      seed,
    });
  };

  const preview = useMemo(() => SETUP_GARDEN, []);

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
              onChange={setCountSafely}
            />
          </div>

          <div className="seat-list">
            {seats.map((seat, i) => {
              const c = colorTheme(i);
              return (
                <div className="seat-row" key={i}>
                  <span className="seat-token" style={{ background: c.hex, color: c.ink }} aria-hidden>
                    {i + 1}
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
                              {t(`ai.${level}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {seat.kind === 'ai' && (
                      <p className="seat-row__desc">{t(`ai.${seat.level}Desc`)}</p>
                    )}
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
          <div className="setup__preview-frame">
            <MiniGarden tiles={preview} compact />
          </div>
          <p className="muted center">
            {lang === 'zh' ? '釉面瓷砖 · 六种形状也是六种色记' : 'Glazed tiles · six shapes, six colour seals'}
          </p>
          <p className="seedline">
            {t('setup.seed')}: <code>{seed.slice(-10)}</code>
          </p>
        </aside>
      </div>
    </div>
  );
}
