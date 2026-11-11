import { DESSERT_IDS, type DessertId } from '../game/types';
import type { Lang } from '../i18n';
import type { Stats } from '../storage';
import { Button, DessertIcon, dessertName, type T } from './components';

export function StatsScreen({
  t,
  lang,
  stats,
  onBack,
  onReset,
  onExport,
}: {
  t: T;
  lang: Lang;
  stats: Stats;
  onBack: () => void;
  onReset: () => void;
  onExport: () => void;
}) {
  const wins = Object.entries(stats.wins).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const favorite = DESSERT_IDS.map((dessert: DessertId) => ({
    dessert,
    count: stats.favoriteDessert[dessert] ?? 0,
  })).sort((a, b) => b.count - a.count)[0];
  const favoriteDessert = favorite && favorite.count > 0 ? favorite : null;
  const dates = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="stats screen" data-testid="stats-screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('stats.back')}
        </button>
        <div>
          <h1>{t('stats.title')}</h1>
          <p className="muted">{t('stats.subtitle')}</p>
        </div>
        <span />
      </header>

      {stats.games === 0 ? (
        <div className="empty-state">
          <p>{t('stats.empty')}</p>
          <div className="row-actions">
            <Button testId="back-empty" variant="primary" onClick={onBack}>
              {t('stats.back')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{t('stats.games')}</span>
              <strong>{stats.games}</strong>
            </div>
            <div className="stat-card">
              <span>{t('stats.highScore')}</span>
              <strong>{stats.highScore}</strong>
            </div>
            <div className="stat-card">
              <span>{t('stats.bestStreak')}</span>
              <strong>{stats.bestStreak}</strong>
            </div>
            <div className="stat-card">
              <span>{t('stats.crowns')}</span>
              <strong>{stats.crowns}</strong>
            </div>
          </div>

          <div className="stats__grid">
            <section className="panel">
              <div className="eyebrow">{t('stats.wins')}</div>
              <h2>{t('stats.winsTitle')}</h2>
              {wins.length === 0 ? (
                <p className="muted">{t('stats.empty')}</p>
              ) : (
                <ul className="win-list">
                  {wins.map(([name, count]) => (
                    <li key={name}>
                      <span>{name}</span>
                      <span className="win-list__bar" aria-hidden>
                        <span style={{ width: `${Math.max(6, (count / Math.max(1, wins[0][1])) * 100)}%` }} />
                      </span>
                      <strong>{t(count === 1 ? 'stats.winCountOne' : 'stats.winCount', { n: count })}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <div className="favorite">
                <span className="eyebrow">{t('stats.favorite')}</span>
                {favoriteDessert ? (
                  <span className="favorite__value">
                    <DessertIcon type={favoriteDessert.dessert} size={26} />
                    {dessertName(t, favoriteDessert.dessert)} · {favoriteDessert.count}
                  </span>
                ) : (
                  <span className="muted">{t('stats.favoriteNone')}</span>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="eyebrow">{t('stats.recent')}</div>
              <h2>{t('stats.recentTitle')}</h2>
              {stats.recent.length === 0 ? (
                <p className="muted">{t('stats.emptyRecent')}</p>
              ) : (
                <ul className="recent-list">
                  {stats.recent.map((game, index) => (
                    <li key={`${game.date}-${index}`}>
                      <span className="recent-list__date">{dates(game.date)}</span>
                      <span>{t('stats.recentLine', {
                        players: game.players,
                        winner: game.winner ?? t('stats.noWinner'),
                        score: game.winnerScore,
                      })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="row-actions">
            <Button testId="export-stats" onClick={onExport}>
              {t('stats.export')}
            </Button>
            <Button
              testId="reset-stats"
              variant="danger"
              onClick={() => {
                if (window.confirm(t('stats.resetConfirm'))) onReset();
              }}
            >
              {t('stats.reset')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
