import type { Lang } from '../i18n';
import type { HistoryEntry, Stats } from '../storage';
import { Button, type T } from './components';
import { seatTheme } from './theme';

export function StatsScreen({
  t,
  lang,
  stats,
  history,
  onReplayHistory,
  onBack,
  onReset,
  onToast,
}: {
  t: T;
  lang: Lang;
  stats: Stats;
  history: HistoryEntry[];
  onReplayHistory: (entry: HistoryEntry) => void;
  onBack: () => void;
  onReset: () => void;
  onToast: (message: string) => void;
}) {
  const winners = Object.entries(stats.wins).sort((a, b) => b[1] - a[1]);
  const favorite = stats.favoriteSeat != null ? seatTheme(stats.favoriteSeat) : null;
  const dateLabel = (ts: number): string =>
    new Date(ts).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const exportJson = async (): Promise<void> => {
    const payload = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        games: stats.games,
        wins: stats.wins,
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak,
        history,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      onToast(t('stats.copied'));
    } catch {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'star-leap-history.json';
      a.click();
      URL.revokeObjectURL(url);
      onToast(t('stats.exported'));
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
            {favorite && <span className="swatch" style={{ background: favorite.color }} />}
            {favorite ? (lang === 'zh' ? favorite.zh : favorite.en) : '—'}
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
                <th>{t('stats.win')}</th>
              </tr>
            </thead>
            <tbody>
              {winners.map(([name, wins], i) => (
                <tr key={name}>
                  <td>{i + 1}</td>
                  <td>{name}</td>
                  <td>{wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <h2>{t('stats.history')}</h2>
        {history.length === 0 ? (
          <p className="muted">{t('stats.noHistory')}</p>
        ) : (
          <ul className="history-list">
            {[...history].reverse().map((entry) => {
              const winnerName = entry.winner !== null ? entry.config.seats[entry.winner]?.name : null;
              return (
                <li key={entry.id}>
                  <button type="button" className="history-row" onClick={() => onReplayHistory(entry)}>
                    <span className="history-row__date">{dateLabel(entry.finishedAt)}</span>
                    <span className="history-row__winner">
                      {winnerName ? `${t('stats.winner')}: ${winnerName}` : t('stats.stalemate')}
                    </span>
                    <span className="muted">
                      {entry.moves.length} {t('stats.moves')}
                    </span>
                    <span className="history-row__action">{t('stats.replay')} →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="row-actions">
        <Button onClick={exportJson}>{t('stats.export')}</Button>
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
