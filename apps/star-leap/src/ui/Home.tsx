import { useMemo } from 'react';
import type { Lang } from '../i18n';
import { setup } from '../game/engine';
import type { GameConfig } from '../game/types';
import type { SavedGame, SoundLevel } from '../storage';
import { Board } from './Board';
import type { T } from './components';

function demoState() {
  const config: GameConfig = {
    playerCount: 2,
    seats: [
      { name: 'You', kind: 'human', level: 'normal' },
      { name: 'AI', kind: 'ai', level: 'normal' },
    ],
  };
  const state = setup(config);
  // A few marbles in the middle make the hero board feel like a game in progress.
  const path = [59, 60, 61, 68, 69, 70, 76, 77];
  path.forEach((h, i) => {
    if (state.board[h] === 0) state.board[h] = i % 2 === 0 ? 1 : 2;
  });
  return state;
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
  const demo = useMemo(demoState, []);
  return (
    <div className="home screen">
      <header className="home__hero">
        <div className="home__copy">
          <div className="eyebrow">{t('home.footer')}</div>
          <h1 className="wordmark">
            {t('app.name')}
            <span className="wordmark__en">{lang === 'zh' ? 'Star Leap' : 'Chinese Checkers'}</span>
          </h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="lede">{t('app.subtitle')}</p>
          <div className="home__badges">
            <span>{t('home.badgePlayers')}</span>
            <span>{t('home.badgeMinutes')}</span>
            <span>{t('home.badgeAge')}</span>
            <span>{t('home.footer')}</span>
          </div>
        </div>
        <div className="home__art" aria-hidden>
          <Board state={demo} interactive={false} compact />
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
              {t('home.lan')} <span className="pill">{t('home.lanBadge')}</span>
            </strong>
            <small>{t('home.lanDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
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
          <button type="button" className="text-btn" onClick={onToggleLang}>
            {lang === 'zh' ? 'English' : '中文'}
          </button>
          <button type="button" className="text-btn" onClick={onToggleSound}>
            {t('common.sound')}: {soundLevel === 'on' ? t('settings.on') : soundLevel === 'low' ? t('settings.low') : t('settings.off')}
          </button>
          <span className="muted">{t('home.version')}</span>
        </div>
      </footer>

    </div>
  );
}
