import type { Lang } from '../i18n';
import type { SavedGame, SoundLevel } from '../storage';
import { Board } from './Board';
import { SeatMark, type T } from './components';
import { HERO_TILES } from './heroTiles';

export function Home({
  t,
  lang,
  saved,
  soundLevel,
  onContinue,
  onSolo,
  onHotseat,
  onLan,
  onLanJoin,
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
  onLanJoin: () => void;
  onStats: () => void;
  onRules: () => void;
  onSettings: () => void;
  onTutorial: () => void;
  onToggleLang: () => void;
  onToggleSound: () => void;
}) {
  return (
    <div className="home screen">
      <header className="home__hero">
        <div className="home__copy">
          <div className="eyebrow">{t('home.eyebrow')}</div>
          <h1 className="wordmark">
            {t('app.name')}
            <span className="wordmark__en">{lang === 'zh' ? 'Field & Wall' : '筑野'}</span>
          </h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="lede">{t('app.subtitle')}</p>
          <div className="home__badges">
            <span>{t('app.badgePlayers')}</span>
            <span>{t('app.badgeTime')}</span>
            <span>{t('app.badgeAge')}</span>
            <span>{t('app.badgeOffline')}</span>
          </div>
          <div className="home__seats" aria-hidden>
            {[0, 1, 2, 3].map((seat) => (
              <SeatMark key={seat} seat={seat} size={20} />
            ))}
            <span className="home__seats-note">{t('home.colorsNote')}</span>
          </div>
        </div>
        <div className="home__art" aria-label={t('home.heroCaption')}>
          <div className="home__art-frame">
            <Board tiles={HERO_TILES} interactive={false} fitKey="home" compact ariaLabel={t('home.heroCaption')} />
            <div className="home__art-label">
              <span className="home__art-dot" />
              {t('home.heroCaption')}
            </div>
          </div>
        </div>
      </header>

      {saved && (
        <button type="button" className="continue-card" data-testid="continue-game" onClick={onContinue}>
          <span className="continue-card__icon">↻</span>
          <span>
            <strong>{t('home.continue')}</strong>
            <small>{t('home.continueDesc')}</small>
          </span>
          <span className="continue-card__arrow">→</span>
        </button>
      )}

      <section className="mode-grid" aria-label="Modes">
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
            <strong>
              {t('home.lan')} <span className="pill pill--muted">{t('home.lanBadge')}</span>
            </strong>
            <small>{t('home.lanDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
      </section>

      <div className="lan-join-row">
        <button type="button" className="text-btn" data-testid="lan-join-home" onClick={onLanJoin}>
          {t('home.lanJoin')} →
        </button>
      </div>

      <footer className="home__footer">
        <div className="home__links">
          <button type="button" className="text-btn" data-testid="home-stats" onClick={onStats}>
            {t('home.stats')}
          </button>
          <button type="button" className="text-btn" data-testid="home-rules" onClick={onRules}>
            {t('home.rules')}
          </button>
          <button type="button" className="text-btn" data-testid="home-tutorial" onClick={onTutorial}>
            {t('home.tutorial')}
          </button>
          <button type="button" className="text-btn" data-testid="home-settings" onClick={onSettings}>
            {t('home.settings')}
          </button>
        </div>
        <div className="home__meta">
          <button type="button" className="text-btn" data-testid="toggle-lang" onClick={onToggleLang}>
            {lang === 'zh' ? 'English' : '中文'}
          </button>
          <button type="button" className="text-btn" data-testid="toggle-sound" onClick={onToggleSound}>
            {t('common.sound')}:{' '}
            {soundLevel === 'on' ? t('settings.on') : soundLevel === 'low' ? t('settings.low') : t('settings.off')}
          </button>
          <span className="muted">{t('home.version')}</span>
        </div>
      </footer>
    </div>
  );
}
