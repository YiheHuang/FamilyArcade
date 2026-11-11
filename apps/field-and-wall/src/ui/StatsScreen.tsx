import type { Lang } from '../i18n';
import type { HistoryEntry, Stats } from '../storage';
import { Button, SeatMark, type T } from './components';

function formatDate(endedAt: number, lang: Lang): string {
  try {
    return new Date(endedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function StatsScreen({
  t,
  lang,
  stats,
  onBack,
  onReset,
  onExport,
  onReplay,
}: {
  t: T;
  lang: Lang;
  stats: Stats;
  onBack: () => void;
  onReset: () => void;
  onExport: () => void;
  onReplay: (entry: HistoryEntry) => void;
}) {
  const players = Object.values(stats.players).sort(
    (a, b) => b.wins - a.wins || b.bestScore - a.bestScore || a.name.localeCompare(b.name),
  );
  const bestScore = players.reduce((best, row) => Math.max(best, row.bestScore), 0);
  const recent = stats.history;

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

      <section className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.games')}</span>
          <strong>{stats.games}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.bestScore')}</span>
          <strong>{bestScore}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.streak')}</span>
          <strong>{stats.currentStreak ? stats.currentStreak.count : 0}</strong>
          <small>{stats.currentStreak?.name ?? t('game.none')}</small>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.bestStreak')}</span>
          <strong>{stats.bestStreak}</strong>
        </div>
      </section>

      {stats.games === 0 ? (
        <section className="panel empty-state">
          <p>{t('stats.noGames')}</p>
          <p className="muted">{t('stats.notEnough')}</p>
          <Button variant="primary" onClick={onBack}>{t('stats.back')}</Button>
        </section>
      ) : (
        <div className="stats__grid">
          <section className="panel">
            <div className="panel__head">
              <h2>{t('stats.player')}</h2>
              <span className="muted small">{t('stats.games')} {stats.games}</span>
            </div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{t('stats.player')}</th>
                  <th>{t('stats.played')}</th>
                  <th>{t('stats.wins')}</th>
                  <th>{t('stats.winRate')}</th>
                  <th>{t('stats.bestScore')}</th>
                  <th>{t('stats.average')}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((row, i) => (
                  <tr key={row.name}>
                    <td>
                      <span className="rank-name">
                        <SeatMark seat={i} size={18} />
                        {row.name}
                      </span>
                    </td>
                    <td>{row.games}</td>
                    <td><strong>{row.wins}</strong></td>
                    <td>{row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0}%</td>
                    <td>{row.bestScore}</td>
                    <td>{row.games > 0 ? Math.round(row.totalScore / row.games) : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>{t('stats.recent')}</h2>
              <button type="button" className="text-btn" onClick={onExport}>{t('stats.export')}</button>
            </div>
            <ul className="history-list">
              {recent.map((entry) => (
                <li key={entry.id} className="history-row">
                  <div className="history-row__main">
                    <strong>{entry.winnerNames.join(' · ') || t('game.none')}</strong>
                    <small className="muted">
                      {formatDate(entry.endedAt, lang)} ·{' '}
                      {entry.config.seats
                        .map((seat, i) => `${seat.name} ${entry.scores[i] ?? 0}`)
                        .join(' · ')}
                    </small>
                  </div>
                  <Button testId={`replay-${entry.id}`} onClick={() => onReplay(entry)}>
                    {t('stats.replay')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="stats__actions">
        <Button variant="ghost" onClick={onExport}>{t('stats.export')}</Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(t('stats.resetConfirm'))) onReset();
          }}
        >
          {t('stats.reset')}
        </Button>
      </section>
    </div>
  );
}
