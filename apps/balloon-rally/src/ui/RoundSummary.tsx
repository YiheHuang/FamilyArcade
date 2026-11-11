import { balloonName } from '../game/data';
import type { GameView } from '../game/types';
import type { Lang } from '../i18n';
import { Button, SeatDot, type T } from './components';

export function RoundSummary({
  view,
  t,
  lang,
  onAdvance,
}: {
  view: GameView;
  t: T;
  lang: Lang;
  onAdvance?: () => void;
}) {
  const record = view.lastRound;
  if (!record) return null;
  const isFinal = record.round >= view.rounds;
  const canAdvance = Boolean(onAdvance);
  return (
    <section className="round-summary" aria-label={t('game.roundResult', { n: record.round })}>
      <div className="round-summary__head">
        <div>
          <p className="eyebrow">{t('game.supportReveal')}</p>
          <h3>{t('game.roundResult', { n: record.round })}</h3>
        </div>
        {onAdvance && (
          <Button variant="primary" onClick={onAdvance} testId="next-round">
            {isFinal ? t('game.finalRanking') : t('game.nextRound')} →
          </Button>
        )}
        {!canAdvance && <span className="pill pill--muted">{t('lan.waitingAdvance')}</span>}
      </div>

      <div className="round-summary__grid">
        <div className="round-table-wrap">
          <table className="round-table">
            <thead>
              <tr>
                <th>{t('game.balloon')}</th>
                <th>{t('game.wind')}</th>
                <th>{t('game.tailwindShort')}</th>
                <th>{t('game.space')}</th>
              </tr>
            </thead>
            <tbody>
              {view.balloons.map((balloon, index) => {
                const tails = record.supports.reduce(
                  (count, supported, seat) =>
                    count + (supported === index && record.tailwinds[seat] ? 1 : 0),
                  0,
                );
                const leader = record.leaders.includes(index);
                const second = record.seconds.includes(index);
                return (
                  <tr key={balloon.id} className={leader ? 'is-leader' : undefined}>
                    <td>
                      <span className="round-balloon">
                        <span className="legend-chip__num" style={{ background: balloon.color }}>
                          {index + 1}
                        </span>
                        {balloonName(balloon, lang)}
                        {leader && <span className="mini-tag is-leader">{t('game.leaderShort')}</span>}
                        {second && <span className="mini-tag">{t('game.secondShort')}</span>}
                      </span>
                    </td>
                    <td>+{record.wind[index]}</td>
                    <td>{tails ? `+${tails}` : '—'}</td>
                    <td>
                      {record.positionsBefore[index]} → <strong>{record.positionsAfter[index]}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="round-supports">
          <h4>{t('game.supporter')}</h4>
          <div className="round-support-list">
            {view.seats.map((seat, index) => {
              const balloon = view.balloons[record.supports[index]];
              const points = record.points[index];
              return (
                <div key={index} className={`round-support${points > 0 ? ' is-scoring' : ''}`}>
                  <SeatDot seat={index} />
                  <div className="round-support__main">
                    <strong>{seat.name}</strong>
                    <span className="round-support__balloon" style={{ color: balloon.color }}>
                      {balloonName(balloon, lang)}
                      {record.tailwinds[index] && <span className="mini-tag is-tail">{t('game.tailwindShort')}</span>}
                    </span>
                  </div>
                  <span className="round-support__points">+{points}</span>
                </div>
              );
            })}
          </div>
          {record.overallPoints && (
            <p className="round-summary__overall">
              {t('game.overall')}:{' '}
              {record.overallPoints
                .map((points, seat) => (points ? view.seats[seat].name : null))
                .filter(Boolean)
                .join(` ${t('common.and')} `) || '—'}
            </p>
          )}
        </div>
      </div>

      <p className="round-summary__note">
        {t('game.roundPointsNote')}
        {isFinal ? ` · ${t('game.overallNote')}` : ''}
      </p>
    </section>
  );
}
