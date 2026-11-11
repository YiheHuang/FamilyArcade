import { BALLOONS, TRACK_LENGTH } from '../game/data';
import type { Lang } from '../i18n';
import type { SavedGame, SoundLevel } from '../storage';
import { BalloonIcon } from './BalloonIcon';
import type { T } from './components';

function HeroArt() {
  return (
    <div className="hero-art" aria-hidden>
      <svg className="hero-art__valley" viewBox="0 0 620 470" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf6ea" />
            <stop offset="1" stopColor="#efe6d3" />
          </linearGradient>
          <linearGradient id="hero-hill-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dfe9d8" />
            <stop offset="1" stopColor="#c9dabe" />
          </linearGradient>
          <linearGradient id="hero-hill-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cbdcc2" />
            <stop offset="1" stopColor="#b5ccae" />
          </linearGradient>
        </defs>
        <rect width="620" height="470" fill="url(#hero-sky)" />
        <circle cx="470" cy="92" r="40" fill="#f3dda8" opacity="0.9" />
        <circle cx="470" cy="92" r="58" fill="#f3dda8" opacity="0.2" />
        <g fill="#fffdf7" opacity="0.7">
          <ellipse cx="130" cy="86" rx="50" ry="15" />
          <ellipse cx="164" cy="76" rx="30" ry="13" />
          <ellipse cx="100" cy="77" rx="24" ry="10" />
        </g>
        <g fill="#fffdf7" opacity="0.5">
          <ellipse cx="360" cy="150" rx="38" ry="11" />
          <ellipse cx="384" cy="143" rx="22" ry="9" />
        </g>
        <path d="M0 330 Q 130 245 280 315 T 620 292 L 620 470 L 0 470 Z" fill="url(#hero-hill-a)" />
        <path d="M0 392 Q 180 330 350 396 T 620 360 L 620 470 L 0 470 Z" fill="url(#hero-hill-b)" />
        <path
          d="M0 425 Q 160 380 330 424 T 620 408"
          fill="none"
          stroke="#f7f1e4"
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.7"
        />
        <g stroke="#8a9a80" strokeWidth="1.6" fill="none" opacity="0.45">
          <path d="M72 246 q7 -6 14 0 q7 -6 14 0" />
          <path d="M300 210 q6 -5 12 0 q6 -5 12 0" />
        </g>
      </svg>
      {BALLOONS.map((balloon, index) => (
        <span
          key={balloon.id}
          className={`hero-balloon hero-balloon--${index}`}
          style={{ ['--balloon-color' as string]: balloon.color, ['--balloon-light' as string]: balloon.light }}
        >
          <BalloonIcon balloon={balloon} size={index === 2 ? 58 : 46} />
        </span>
      ))}
      <span className="hero-art__tag">{TRACK_LENGTH}</span>
    </div>
  );
}

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
  onToggleLang: () => void;
  onToggleSound: () => void;
}) {
  return (
    <div className="home screen">
      <header className="home__hero">
        <div className="home__copy">
          <div className="eyebrow">{t('app.eyebrow')}</div>
          <h1 className="wordmark">
            {t('app.name')}
            <span className="wordmark__en">{t('app.nameEn')}</span>
          </h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="lede">{t('app.subtitle')}</p>
          <div className="home__badges">
            <span>{t('home.badgePlayers')}</span>
            <span>{t('home.badgeTime')}</span>
            <span>{t('home.badgeAge')}</span>
            <span>{t('home.badgeOffline')}</span>
          </div>
        </div>
        <div className="home__art">
          <HeroArt />
          <p className="home__art-note">{t('home.demoNote')}</p>
        </div>
      </header>

      {saved && (
        <button type="button" className="continue-card" data-testid="continue-game" onClick={onContinue}>
          <span className="continue-card__icon">↻</span>
          <span className="continue-card__main">
            <strong>{t('home.continue')}</strong>
            <small>
              {t('home.continueDesc')} · {t('home.continueRound', { n: saved.state.round })}
            </small>
          </span>
          <span className="continue-card__arrow">→</span>
        </button>
      )}

      <section className="mode-section" aria-label={t('home.modes')}>
        <div className="section-head">
          <span className="eyebrow">{t('home.modes')}</span>
          <span className="rule-short" />
        </div>
        <div className="mode-grid">
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
          <button
            type="button"
            className="mode-card"
            data-testid="mode-lan"
            onClick={onLan}
          >
            <span className="mode-card__index">03</span>
            <span className="mode-card__body">
              <strong>
                {t('home.lan')} <span className="pill">{t('lan.onlyWifi')}</span>
              </strong>
              <small>{t('home.lanDesc')}</small>
            </span>
            <span className="mode-card__arrow">→</span>
          </button>
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
          <button type="button" className="text-btn" onClick={onToggleLang} aria-label={t('a11y.langSwitch')}>
            {lang === 'zh' ? 'English' : '中文'}
          </button>
          <button type="button" className="text-btn" onClick={onToggleSound} aria-label={t('a11y.soundToggle')}>
            {t('common.sound')}:{' '}
            {soundLevel === 'on' ? t('settings.on') : soundLevel === 'low' ? t('settings.low') : t('settings.off')}
          </button>
          <span className="muted">{t('home.version')}</span>
          <span className="muted">{t('home.footer')}</span>
        </div>
      </footer>
    </div>
  );
}
