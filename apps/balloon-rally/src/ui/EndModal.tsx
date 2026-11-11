import type { GameView } from '../game/types';
import { BalloonIcon } from './BalloonIcon';
import { Button, Modal, SeatDot, type T } from './components';

export function EndModal({
  view,
  t,
  canRematch = true,
  onReplay,
  onRematch,
  onHome,
}: {
  view: GameView;
  t: T;
  canRematch?: boolean;
  onReplay: () => void;
  onRematch: () => void;
  onHome: () => void;
}) {
  const winners = view.winners.map((seat) => view.seats[seat].name);
  const title =
    winners.length > 1
      ? t('game.winners', { names: winners.join(` ${t('common.and')} `) })
      : t('game.winner', { name: winners[0] ?? '—' });

  return (
    <Modal
      title={title}
      wide
      testId="end-modal"
      actions={
        <>
          <Button testId="replay" onClick={onReplay}>
            {t('game.replay')}
          </Button>
          {canRematch && (
            <Button testId="rematch" variant="primary" onClick={onRematch}>
              {t('game.rematch')}
            </Button>
          )}
          <Button testId="modal-home" variant="ghost" onClick={onHome}>
            {t('game.home')}
          </Button>
        </>
      }
    >
      <div className="end-hero" aria-hidden>
        {view.balloons.map((balloon, index) => (
          <span key={balloon.id} className={`end-balloon end-balloon--${index}`}>
            <BalloonIcon balloon={balloon} size={34} />
          </span>
        ))}
      </div>
      <p className="muted center">{t('game.tiebreak')}</p>
      <table className="rank-table rank-table--wide">
        <thead>
          <tr>
            <th>{t('game.rank')}</th>
            <th>{t('game.player')}</th>
            <th>{t('game.roundPts')}</th>
            <th>{t('game.overallPts')}</th>
            <th>{t('game.tailwindPts')}</th>
            <th>{t('game.totalPts')}</th>
          </tr>
        </thead>
        <tbody>
          {view.scores.map((row) => (
            <tr key={row.seat} className={row.rank === 1 ? 'is-winner' : undefined}>
              <td>
                <span className={`rank-badge${row.rank === 1 ? ' is-gold' : ''}`}>{row.rank}</span>
              </td>
              <td>
                <span className="rank-player">
                  <SeatDot seat={row.seat} />
                  {row.name}
                </span>
              </td>
              <td>{row.roundPoints}</td>
              <td>{row.overallPoints ? `+${row.overallPoints}` : '—'}</td>
              <td>{row.tailwindPoints}</td>
              <td>
                <strong>{row.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted center ranking-note">
        {t('game.roundPointsNote')} · {t('game.correct')}:{' '}
        {view.scores.map((row) => `${row.name} ${row.correctSupports}`).join(' · ')}
      </p>
    </Modal>
  );
}
