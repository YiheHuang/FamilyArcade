import { useMemo, useState } from 'react';
import { AI_LEVELS } from '../game/types';
import type { AiLevel, GameConfig, PlayerCount, SeatConfig } from '../game/types';
import type { Lang } from '../i18n';
import { CardFace, dessertName, Segmented, Button, type T } from './components';
import { typeOf } from '../game/data';

type Mode = 'solo' | 'hotseat';

function defaultSeats(mode: Mode, count: number, lang: Lang): SeatConfig[] {
  const soloZh = ['你', '阿宝', '小满', '奶奶', '爸爸'];
  const soloEn = ['You', 'Bao', 'Mia', 'Grandma', 'Dad'];
  const hotseatZh = ['玩家 1', '玩家 2', '玩家 3', '玩家 4', '玩家 5'];
  const hotseatEn = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  const names =
    mode === 'solo' ? (lang === 'zh' ? soloZh : soloEn) : lang === 'zh' ? hotseatZh : hotseatEn;
  return Array.from({ length: count }, (_, index) => ({
    name: names[index] ?? (lang === 'zh' ? `玩家 ${index + 1}` : `Player ${index + 1}`),
    kind: mode === 'solo' && index > 0 ? 'ai' : 'human',
    level: 'normal' as AiLevel,
  }));
}

export function Setup({
  t,
  lang,
  mode: initialMode,
  onStart,
  onBack,
}: {
  t: T;
  lang: Lang;
  mode: Mode;
  onStart: (config: GameConfig) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [count, setCount] = useState<PlayerCount>(initialMode === 'solo' ? 3 : 2);
  const [seats, setSeats] = useState<SeatConfig[]>(() => defaultSeats(initialMode, initialMode === 'solo' ? 3 : 2, lang));
  const [error, setError] = useState<string | null>(null);

  const levelOptions = useMemo(
    () => AI_LEVELS.map((level) => ({ value: level, label: t(`ai.${level}`) })),
    [t],
  );

  const changeMode = (next: Mode) => {
    setMode(next);
    setSeats(defaultSeats(next, count, lang));
    setError(null);
  };

  const changeCount = (next: PlayerCount) => {
    setCount(next);
    setSeats((prev) => {
      const base = [...prev];
      if (next <= base.length) return base.slice(0, next);
      const extra = defaultSeats(mode, next, lang).slice(base.length);
      return [...base, ...extra];
    });
    setError(null);
  };

  const updateSeat = (index: number, patch: Partial<SeatConfig>) => {
    setSeats((prev) => prev.map((seat, seatIndex) => (seatIndex === index ? { ...seat, ...patch } : seat)));
    setError(null);
  };

  const toggleKind = (index: number) => {
    const current = seats[index];
    const nextKind = current.kind === 'human' ? 'ai' : 'human';
    if (mode === 'solo' && index === 0) return;
    if (nextKind === 'ai' && seats.filter((seat) => seat.kind === 'human').length <= 1 && current.kind === 'human') {
      setError(t('setup.hint'));
      return;
    }
    updateSeat(index, { kind: nextKind });
  };

  const start = () => {
    if (seats.some((seat) => seat.name.trim().length === 0)) {
      setError(t('setup.errorName'));
      return;
    }
    if (seats.length !== count) {
      setError(t('setup.errorSeats'));
      return;
    }
    onStart({ playerCount: count, seats: seats.map((seat) => ({ ...seat, name: seat.name.trim() })), seed: '' });
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
            <span className="field__label">{t('setup.mode')}</span>
            <Segmented
              value={mode}
              label={t('setup.mode')}
              testId="setup-mode"
              onChange={changeMode}
              options={[
                { value: 'solo', label: t('setup.modeSolo') },
                { value: 'hotseat', label: t('setup.modeHotseat') },
              ]}
            />
          </div>

          <div className="field">
            <span className="field__label">{t('setup.players')}</span>
            <Segmented
              value={count}
              label={t('setup.players')}
              testId="player-count"
              onChange={(value) => changeCount(value as PlayerCount)}
              options={[2, 3, 4, 5].map((value) => ({ value, label: String(value) }))}
            />
          </div>

          <div className="seat-list">
            {seats.map((seat, index) => (
              <div className="seat-row" key={index}>
                <span className="seat-row__index">{index + 1}</span>
                <div className="seat-row__fields">
                  <div className="seat-row__top">
                    <label className="field field--inline seat-row__name">
                      <span className="field__label">{t('setup.name')}</span>
                      <input
                        className="input"
                        value={seat.name}
                        maxLength={16}
                        onChange={(event) => updateSeat(index, { name: event.target.value })}
                        placeholder={t('setup.namePlaceholder', { n: index + 1 })}
                        aria-label={`${t('setup.name')} ${index + 1}`}
                        data-testid={`seat-${index}-name`}
                      />
                    </label>
                    <div className="seat-row__kind">
                      <button
                        type="button"
                        className={`kind-pill${seat.kind === 'human' ? ' is-active' : ''}`}
                        onClick={() => (seat.kind === 'ai' ? toggleKind(index) : undefined)}
                        aria-pressed={seat.kind === 'human'}
                        disabled={mode === 'solo' && index === 0}
                        data-testid={`seat-${index}-human`}
                      >
                        {t('setup.human')}
                      </button>
                      <button
                        type="button"
                        className={`kind-pill${seat.kind === 'ai' ? ' is-active' : ''}`}
                        onClick={() => (seat.kind === 'human' ? toggleKind(index) : undefined)}
                        aria-pressed={seat.kind === 'ai'}
                        disabled={mode === 'solo' && index === 0}
                        data-testid={`seat-${index}-ai`}
                      >
                        {t('setup.ai')}
                      </button>
                    </div>
                  </div>
                  {seat.kind === 'ai' && (
                    <div className="seat-row__ai">
                      <span className="field__label">{t('setup.level')}</span>
                      <Segmented
                        value={seat.level}
                        label={`${t('setup.level')} ${index + 1}`}
                        testId={`seat-${index}-level`}
                        onChange={(value) => updateSeat(index, { level: value as AiLevel })}
                        options={levelOptions}
                      />
                      <span className="hint-text">{t(`ai.${seat.level}Desc`)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="hint-box hint-box--warn">{error}</div>}
          <div className="setup__actions">
            <Button testId="start-game" variant="primary" onClick={start}>
              {t('setup.start')} →
            </Button>
            <span className="hint-text">{t('setup.startHint')}</span>
          </div>
          <p className="privacy-note">
            <span aria-hidden>◐</span> {t('setup.privacy')}
          </p>
        </section>

        <aside className="setup__preview">
          <div className="panel preview-panel">
            <div className="eyebrow">{t('home.feature3')}</div>
            <div className="preview-cards" aria-hidden>
              {[1, 13, 25].map((cardId, index) => (
                <div key={cardId} className={`preview-cards__card preview-cards__card--${index}`}>
                  <CardFace cardId={cardId} name={dessertName(t, typeOf(cardId))} size="small" />
                </div>
              ))}
            </div>
            <h2 className="preview-panel__title">{t('home.tagline')}</h2>
            <ul className="preview-list">
              <li>{t('rules.five.1')}</li>
              <li>{t('rules.five.3')}</li>
              <li>{t('rules.five.5')}</li>
            </ul>
            <div className="preview-panel__meta">
              <span>{t('home.badges.players')}</span>
              <span>{t('home.badges.minutes')}</span>
              <span>{t('home.badges.age')}</span>
            </div>
          </div>
          <p className="hint-text">{t('setup.hint')}</p>
        </aside>
      </div>
    </div>
  );
}
