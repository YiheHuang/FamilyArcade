import { colorTheme } from './theme';
import { exportStats, type RecentGame, type Stats } from '../storage';
import type { Lang } from '../i18n';
import { BloomMark, Button, type T } from './components';

export function StatsScreen({
  t,
  lang,
  stats,
  recent,
  onBack,
  onReset,
  onToast,
  onReplayRecent,
}: {
  t: T;
  lang: Lang;
  stats: Stats;
  recent: RecentGame[];
  onBack: () => void;
  onReset: () => void;
  onToast: (message: string) => void;
  onReplayRecent: (game: RecentGame) => void;
}) {
  const winners = Object.entries(stats.wins).sort((a, b) => b[1] - a[1]);
  const favoriteEntry = Object.entries(stats.colorCounts).sort((a, b) => b[1] - a[1])[0];
  const favorite = favoriteEntry ? colorTheme(Number(favoriteEntry[0])) : null;
  const dateFormat = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    month: 'short',
    day: 'numeric',
  });

  const copy = async (): Promise<void> => {
    const payload = exportStats(stats);
    try {
      await navigator.clipboard.writeText(payload);
      onToast(t('stats.copied'));
    } catch {
      onToast(payload.slice(0, 180));
    }
  };

  return (
    <div className="stats screen">
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

      <div className="stat-grid">
        <div className="stat-card">
          <span className="muted">{t('stats.games')}</span>
          <strong>{stats.games}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">{t('stats.highest')}</span>
          <strong>{stats.highestScore}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">{t('stats.currentStreak')}</span>
          <strong>{stats.currentStreak}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">{t('stats.bestStreak')}</span>
          <strong>{stats.bestStreak}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">{t('stats.favorite')}</span>
          <strong className="stat-card__color">
            {favorite && <span className="swatch" style={{ background: favorite.hex }} />}
            {favorite ? (lang === 'zh' ? favorite.zh : favorite.en) : '—'}
          </strong>
        </div>
        <div className="stat-card">
          <span className="muted">{t('stats.blooms')}</span>
          <strong className="stat-card__with-mark">
            <BloomMark count={stats.totalBlooms} />
          </strong>
        </div>
      </div>

      {stats.games === 0 ? (
        <div className="empty-state">{t('stats.noGames')}</div>
      ) : (
        <section className="panel">
          <h2>{t('stats.wins')}</h2>
          <table className="rank-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('stats.player')}</th>
                <th>{t('stats.winsCol')}</th>
                <th>{t('stats.winRate')}</th>
              </tr>
            </thead>
            <tbody>
              {winners.map(([name, wins], i) => (
                <tr key={name}>
                  <td>{i + 1}</td>
                  <td>{name}</td>
                  <td>{wins}</td>
                  <td>{Math.round((wins / Math.max(1, stats.games)) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>{t('stats.recent')}</h2>
          <span className="muted">{recent.length}/10</span>
        </div>
        {recent.length === 0 ? (
          <p className="muted">{t('stats.recentEmpty')}</p>
        ) : (
          <ul className="recent-games">
            {recent.map((game) => {
              const winnersText = game.winners
                .map((seat) => game.config.seats[seat]?.name)
                .filter(Boolean)
                .join(lang === 'zh' ? '、' : ' & ');
              return (
                <li key={game.id} className="recent-games__item">
                  <div className="recent-games__main">
                    <span className="recent-games__players">
                      {game.config.seats.map((s) => s.name).join(lang === 'zh' ? '、' : ' · ')}
                    </span>
                    <span className="recent-games__meta">
                      {dateFormat.format(new Date(game.finishedAt))} · {t('stats.turns', { n: game.turns })} ·{' '}
                      {game.reason === 'cleared'
                        ? t('end.rackEmpty')
                        : game.reason === 'blocked'
                          ? t('end.blocked')
                          : t('end.cap')}
                    </span>
                  </div>
                  <div className="recent-games__score">
                    <strong>{game.scores.join(' : ')}</strong>
                    <span className="muted">{t('stats.winner', { name: winnersText })}</span>
                  </div>
                  <Button onClick={() => onReplayRecent(game)} testId={`replay-${game.id}`}>
                    {t('stats.replay')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="row-actions">
        <Button onClick={copy} disabled={stats.games === 0}>
          {t('stats.export')}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(t('stats.resetConfirm'))) onReset();
          }}
          disabled={stats.games === 0}
        >
          {t('stats.reset')}
        </Button>
      </div>
    </div>
  );
}
