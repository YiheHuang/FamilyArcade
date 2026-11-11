import { BALLOONS, balloonName, type Balloon } from '../game/data';
import type { Lang } from '../i18n';
import { statsJson, type Stats } from '../storage';
import { BalloonIcon } from './BalloonIcon';
import { Button, type T } from './components';

function favouriteBalloon(stats: Stats): Balloon | null {
  let bestId: string | null = null;
  let best = 0;
  for (const [id, count] of Object.entries(stats.favorites)) {
    if (count > best) {
      best = count;
      bestId = id;
    }
  }
  return BALLOONS.find((b) => b.id === bestId) ?? null;
}

export function StatsScreen({
  t,
  lang,
  stats,
  onBack,
  onReset,
  onToast,
}: {
  t: T;
  lang: Lang;
  stats: Stats;
  onBack: () => void;
  onReset: () => void;
  onToast: (message: string) => void;
}) {
  const rows = Object.entries(stats.wins)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  const totalWins = rows.reduce((sum, row) => sum + row.wins, 0);
  const favourite = favouriteBalloon(stats);

  const exportJson = (): void => {
    const blob = new Blob([statsJson(stats)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'balloon-rally-stats.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onToast(t('stats.exported'));
  };

  return (
    <div className="stats screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('stats.back')}
        </button>
        <div>
          <p className="eyebrow">{t('app.nameEn')}</p>
          <h1>{t('stats.title')}</h1>
          <p className="muted">{t('stats.subtitle')}</p>
        </div>
        <span />
      </header>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="eyebrow">{t('stats.games')}</span>
          <strong>{stats.games}</strong>
        </div>
        <div className="stat-card">
          <span className="eyebrow">{t('stats.wins')}</span>
          <strong>{totalWins}</strong>
        </div>
        <div className="stat-card">
          <span className="eyebrow">{t('stats.highest')}</span>
          <strong>{stats.highestScore}</strong>
        </div>
        <div className="stat-card">
          <span className="eyebrow">{t('stats.currentStreak')}</span>
          <strong>{stats.currentStreak}</strong>
        </div>
        <div className="stat-card">
          <span className="eyebrow">{t('stats.bestStreak')}</span>
          <strong>{stats.bestStreak}</strong>
        </div>
        <div className="stat-card stat-card--wide">
          <span className="eyebrow">{t('stats.favorite')}</span>
          <strong>{favourite ? balloonName(favourite, lang) : t('stats.favoriteNone')}</strong>
        </div>
      </div>

      <div className="stats__grid">
        <section className="panel stats__table-panel">
          <div className="section-head">
            <h2>{t('stats.byPlayer')}</h2>
            <span className="rule-short" />
          </div>
          {rows.length === 0 ? (
            <p className="empty-state">{t('stats.noGames')}</p>
          ) : (
            <table className="stats-table" aria-label={t('a11y.statsTable')}>
              <thead>
                <tr>
                  <th>{t('stats.player')}</th>
                  <th>{t('stats.wins')}</th>
                  <th>{t('stats.winRate')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.wins}</td>
                    <td>{stats.games ? Math.min(100, Math.round((row.wins / stats.games) * 100)) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="stats__actions">
            <Button variant="primary" onClick={exportJson} testId="stats-export">
              {t('stats.export')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(t('stats.resetConfirm'))) onReset();
              }}
              testId="stats-reset"
            >
              {t('stats.reset')}
            </Button>
          </div>
        </section>

        <aside className="panel stats__side">
          <h2>{t('stats.favorite')}</h2>
          <div className="stats-favorite">
            {favourite ? (
              <BalloonIcon balloon={favourite} size={28} />
            ) : (
              <span className="stats-favorite__dot" aria-hidden />
            )}
            <strong>{favourite ? balloonName(favourite, lang) : t('stats.favoriteNone')}</strong>
          </div>
          <p className="muted">{t('stats.exportNote')}</p>
          <div className="stats-mini">
            <div>
              <span>{t('game.tailwindShort')}</span>
              <strong>{stats.tailwindsUsed}</strong>
            </div>
            <div>
              <span>{t('game.correct')}</span>
              <strong>{stats.correctSupports}</strong>
            </div>
          </div>
          <p className="stats__local">{t('stats.local')}</p>
        </aside>
      </div>
    </div>
  );
}
