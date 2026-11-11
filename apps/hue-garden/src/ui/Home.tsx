import type { Lang } from '../i18n';
import type { RecentGame, SavedGame, SoundLevel } from '../storage';
import { Button, type T } from './components';
import { MiniGarden } from './tiles';
import { HOME_GARDEN } from './demoArt';

export function Home({
  t,
  lang,
  saved,
  recent,
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
  onReplayRecent,
  onTutorial,
}: {
  t: T;
  lang: Lang;
  saved: SavedGame | null;
  recent: RecentGame[];
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
  onReplayRecent: (game: RecentGame) => void;
  onTutorial: () => void;
}) {
  return (
    <div className="home screen">
      <header className="home__top">
        <span className="eyebrow">{t('home.kicker')}</span>
        <div className="home__top-actions">
          <button type="button" className="text-btn" onClick={onToggleLang}>
            {t('common.language')}
          </button>
          <button type="button" className="text-btn" onClick={onToggleSound}>
            {t('common.sound')}:{' '}
            {soundLevel === 'on' ? t('settings.on') : soundLevel === 'low' ? t('settings.low') : t('settings.off')}
          </button>
        </div>
      </header>

      <section className="home__hero">
        <div className="home__copy">
          <h1 className="wordmark">
            {t('app.name')}
            <span className="wordmark__en">{lang === 'zh' ? 'HUE GARDEN' : '彩庭'}</span>
          </h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="lede">{t('app.subtitle')}</p>
          <div className="home__badges">
            <span>{t('home.players')}</span>
            <span>{t('home.minutes')}</span>
            <span>{t('home.age')}</span>
            <span>{t('home.offline')}</span>
          </div>
        </div>
        <div className="home__art">
          <div className="home__art-frame">
            <MiniGarden tiles={HOME_GARDEN} />
          </div>
          <p className="home__art-caption">
            {lang === 'zh' ? '六种釉色 · 六种形状 · 六连开花' : 'Six glazes · six shapes · six in a row blooms'}
          </p>
        </div>
      </section>

      {saved && (
        <button type="button" className="continue-card" data-testid="continue-game" onClick={onContinue}>
          <span className="continue-card__icon">↻</span>
          <span>
            <strong>{t('home.continue')}</strong>
            <small>
              {saved.state.config.seats.map((s) => s.name).join(lang === 'zh' ? '、' : ' · ')} ·{' '}
              {t('game.turn', { n: saved.state.turn })}
            </small>
          </span>
          <span className="continue-card__arrow">→</span>
        </button>
      )}

      <section className="mode-grid" aria-label={t('setup.title')}>
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
              {t('home.lan')} <span className="pill">{t('lan.onlyWifi')}</span>
            </strong>
            <small>{t('home.lanDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
      </section>

      {recent.length > 0 && (
        <section className="home__recent">
          <div className="home__recent-head">
            <h2>{t('home.recent')}</h2>
            <button type="button" className="text-btn" onClick={onStats}>
              {t('home.stats')} →
            </button>
          </div>
          <div className="recent-list">
            {recent.slice(0, 3).map((game) => {
              const winnerNames = game.winners
                .map((seat) => game.config.seats[seat]?.name)
                .filter(Boolean)
                .join(lang === 'zh' ? '、' : ' & ');
              return (
                <button
                  key={game.id}
                  type="button"
                  className="recent-card"
                  onClick={() => onReplayRecent(game)}
                >
                  <span className="recent-card__players">
                    {game.config.seats.map((s) => s.name).join(lang === 'zh' ? '、' : ' · ')}
                  </span>
                  <span className="recent-card__score">
                    {game.scores.join(' : ')}
                  </span>
                  <span className="recent-card__winner">
                    {winnerNames || t('stats.shared')} · {t('stats.replay')} →
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

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
          <Button variant="ghost" onClick={onTutorial}>
            {t('rules.replayTutorial')}
          </Button>
          <span className="muted">{t('home.version')}</span>
        </div>
      </footer>
    </div>
  );
}
