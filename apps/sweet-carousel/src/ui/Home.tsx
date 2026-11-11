import { useMemo } from 'react';
import type { Lang } from '../i18n';
import type { SavedGame, SoundLevel } from '../storage';
import { CarouselTable, type CarouselPod } from './CarouselTable';
import { CardFace, dessertName, type T } from './components';
import { typeOf } from '../game/data';

export function Home({
  t,
  lang,
  saved,
  soundLevel,
  onContinue,
  onSolo,
  onHotseat,
  onLan,
  onStats,
  onRules,
  onSettings,
  onTutorial,
  onToggleLang,
  onToggleSound,
}: {
  t: T;
  lang: Lang;
  saved: SavedGame | null;
  soundLevel: SoundLevel;
  onContinue: () => void;
  onSolo: () => void;
  onHotseat: () => void;
  onLan: () => void;
  onStats: () => void;
  onRules: () => void;
  onSettings: () => void;
  onTutorial: () => void;
  onToggleLang: () => void;
  onToggleSound: () => void;
}) {
  const pods = useMemo<CarouselPod[]>(
    () => [
      { seat: 0, name: lang === 'zh' ? '奶奶' : 'Grandma', score: 12, cards: [0, 1, 12, 24], status: 'active' },
      { seat: 1, name: lang === 'zh' ? '阿宝' : 'Bao', score: 9, cards: [12, 13, 36], status: 'picked' },
      { seat: 2, name: lang === 'zh' ? '小满' : 'Mia', score: 14, cards: [24, 25, 48, 60], status: 'waiting' },
      { seat: 3, name: lang === 'zh' ? '爸爸' : 'Dad', score: 7, cards: [36, 48, 49], status: 'waiting' },
    ],
    [lang],
  );
  const heroCards = [3, 14, 26];
  return (
    <div className="home screen">
      <header className="home__hero">
        <div className="home__copy">
          <div className="eyebrow">{t('home.footer')}</div>
          <h1 className="wordmark">
            {t('app.name')}
            <span className="wordmark__en">{lang === 'zh' ? 'Sweet Carousel' : '甜点转盘'}</span>
          </h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="lede">{t('app.subtitle')}</p>
          <div className="home__badges">
            <span>{t('home.badges.players')}</span>
            <span>{t('home.badges.minutes')}</span>
            <span>{t('home.badges.age')}</span>
            <span>{t('home.badges.offline')}</span>
          </div>
          <div className="home__hero-actions">
            <button type="button" className="btn btn--primary" data-testid="hero-start" onClick={onSolo}>
              {t('home.solo')} →
            </button>
            <button type="button" className="text-btn" data-testid="home-tutorial" onClick={onTutorial}>
              {t('home.tutorial')}
            </button>
          </div>
        </div>
        <div className="home__art" aria-label={t('home.heroCaption')}>
          <CarouselTable
            pods={pods}
            passDirection="left"
            round={2}
            pickIndex={3}
            t={t}
            compact
            center={
              <div className="hero-plate">
                <div className="hero-plate__cards">
                  {heroCards.map((cardId, index) => (
                    <div key={cardId} className={`hero-plate__card hero-plate__card--${index}`}>
                      <CardFace cardId={cardId} name={dessertName(t, typeOf(cardId))} size="tiny" />
                    </div>
                  ))}
                </div>
              </div>
            }
          />
        </div>
      </header>

      {saved && (
        <button type="button" className="continue-card" data-testid="continue-game" onClick={onContinue}>
          <span className="continue-card__icon">↻</span>
          <span>
            <strong>{t('home.continue')}</strong>
            <small>
              {t('game.roundOf', { n: saved.state.round })} · {t('game.pickOf', { n: saved.state.pickIndex + 1 })}
            </small>
          </span>
          <span className="continue-card__arrow">→</span>
        </button>
      )}

      <section className="mode-grid" aria-label={t('home.modeLabel')}>
        <button type="button" className="mode-card mode-card--primary" data-testid="mode-solo" onClick={onSolo}>
          <span className="mode-card__index">01</span>
          <span className="mode-card__body">
            <strong>{t('home.solo')}</strong>
            <small>{t('home.soloDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
        <button type="button" className="mode-card" data-testid="mode-hotseat" onClick={onHotseat}>
          <span className="mode-card__index">02</span>
          <span className="mode-card__body">
            <strong>{t('home.hotseat')}</strong>
            <small>{t('home.hotseatDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
        <button type="button" className="mode-card" data-testid="mode-lan" onClick={onLan}>
          <span className="mode-card__index">03</span>
          <span className="mode-card__body">
            <strong>{t('home.lan')}</strong>
            <small>{t('home.lanDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
      </section>

      <section className="feature-strip" aria-label={t('home.features')}>
        <div className="feature-strip__item">
          <span className="feature-strip__n">72</span>
          <span>{t('home.feature1')}</span>
        </div>
        <div className="feature-strip__item">
          <span className="feature-strip__n">3×8</span>
          <span>{t('home.feature2')}</span>
        </div>
        <div className="feature-strip__item">
          <span className="feature-strip__n">6</span>
          <span>{t('home.feature3')}</span>
        </div>
        <div className="feature-strip__item">
          <span className="feature-strip__n">↻</span>
          <span>{t('home.feature4')}</span>
        </div>
      </section>

      <footer className="home__footer">
        <div className="home__links">
          <button type="button" className="text-btn" data-testid="home-stats" onClick={onStats}>
            {t('home.stats')}
          </button>
          <button type="button" className="text-btn" data-testid="home-rules" onClick={onRules}>
            {t('home.rules')}
          </button>
          <button type="button" className="text-btn" data-testid="home-settings" onClick={onSettings}>
            {t('home.settings')}
          </button>
        </div>
        <div className="home__meta">
          <button type="button" className="text-btn" data-testid="lang-toggle" onClick={onToggleLang}>
            {lang === 'zh' ? 'English' : '中文'}
          </button>
          <button type="button" className="text-btn" data-testid="sound-toggle" onClick={onToggleSound}>
            {t('common.sound')}: {soundLevel === 'on' ? t('settings.on') : soundLevel === 'low' ? t('settings.low') : t('settings.off')}
          </button>
          <span className="muted">{t('home.version')}</span>
        </div>
      </footer>
      <p className="home__note muted">{t('home.privacy')}</p>
    </div>
  );
}
