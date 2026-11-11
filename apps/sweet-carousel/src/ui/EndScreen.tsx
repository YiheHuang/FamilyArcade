import { useState } from 'react';
import { result, score } from '../game/engine';
import type { GameState } from '../game/types';
import { Button, CrownIcon, CrownList, SeatDot, type T } from './components';

export function EndScreen({
  t,
  state,
  onRematch,
  onHome,
  onReview,
  onExport,
}: {
  t: T;
  state: GameState;
  onRematch: () => void;
  onHome: () => void;
  onReview: () => void;
  onExport: () => void;
}) {
  const final = result(state);
  const rows = score(state);
  const [showDetails, setShowDetails] = useState(false);
  if (!final) return null;
  const winner = final.winner !== null ? rows.find((row) => row.seat === final.winner) ?? null : null;
  const winnerName = winner?.name ?? '';
  const title =
    final.tieBreak === 'majorities'
      ? t('game.winnerTie', { name: winnerName })
      : final.tieBreak === 'types'
        ? t('game.winnerTieTypes', { name: winnerName })
        : final.tieBreak === 'seat'
          ? t('game.winnerTieSeat', { name: winnerName })
          : t('game.winner', { name: winnerName });

  return (
    <div className="end-screen screen" data-testid="end-screen">
      <div className="confetti" aria-hidden>
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 37 + 11) % 100}%`,
              animationDelay: `${(index % 6) * 0.35}s`,
              background: ['#c76d85', '#c9a24b', '#5f9b88', '#8e6fa8', '#d08a3e'][index % 5],
            }}
          />
        ))}
      </div>

      <header className="end-screen__head">
        <div className="eyebrow">{t('game.endTitle')}</div>
        <h1>{title}</h1>
        <p className="tagline">
          {winner ? `${winner.total} ${t('game.pointsShort')}` : ''} · {t('game.tieBreak')}
        </p>
        <div className="end-screen__stats">
          <span>
            <CrownIcon size={16} /> {t('game.crowns')} {final.crowns.length}
          </span>
          <span>
            {t('game.types')} {winner?.types ?? 0}
          </span>
          <span>{t('game.statsRecorded')}</span>
        </div>
      </header>

      <section className="panel end-screen__ranking">
        <div className="end-screen__section-head">
          <h2>{t('game.ranking')}</h2>
          <button type="button" className="text-btn" onClick={() => setShowDetails((value) => !value)}>
            {showDetails ? t('common.close') : t('game.roundScoreBreakdown')}
          </button>
        </div>
        <table className="rank-table end-table">
          <thead>
            <tr>
              <th>{t('game.rank')}</th>
              <th>{t('game.player')}</th>
              <th>{t('game.round1')}</th>
              <th>{t('game.round2')}</th>
              <th>{t('game.round3')}</th>
              <th>{t('game.crowns')}</th>
              <th>{t('game.total')}</th>
            </tr>
          </thead>
          <tbody>
            {final.ranking.map((row, index) => (
              <tr key={row.seat} className={row.seat === final.winner ? 'is-winner' : undefined}>
                <td>
                  <span className={`rank-medal rank-medal--${index + 1}`}>{index + 1}</span>
                </td>
                <td>
                  <span className="end-table__player">
                    <SeatDot seat={row.seat} size={18} />
                    {row.name}
                    {row.seat === final.winner && <span className="pill">★</span>}
                  </span>
                </td>
                {[0, 1, 2].map((round) => (
                  <td key={round}>{row.roundScores[round] ?? '—'}</td>
                ))}
                <td>
                  {row.majorities > 0 ? (
                    <span className="end-table__crowns">
                      <CrownIcon size={14} /> {row.majorities}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <strong>{row.total}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {showDetails && (
          <div className="end-screen__details">
            {final.ranking.map((row) => (
              <div className="detail-row" key={row.seat}>
                <span>
                  <SeatDot seat={row.seat} size={16} /> {row.name}
                </span>
                <span>
                  {t('game.sets')} {row.setPoints} · {t('game.sampler')} {row.samplerPoints} · {t('game.leftovers')}{' '}
                  {row.leftoverPoints} · {t('game.crowns')} {row.crownPoints}
                </span>
                <strong>{row.total}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="end-screen__bottom">
        <section className="panel end-screen__awards">
          <div className="eyebrow">{t('game.awards')}</div>
          <h2>{t('game.crowns')}</h2>
          <CrownList crowns={final.crowns} t={t} names={state.config.seats.map((seat) => seat.name)} />
        </section>
        <div className="end-screen__actions">
          <Button testId="play-again" variant="primary" onClick={onRematch}>
            {t('game.playAgain')} ↻
          </Button>
          <Button testId="review" onClick={onReview}>
            {t('game.review')}
          </Button>
          <Button testId="export-json" onClick={onExport}>
            {t('game.export')}
          </Button>
          <Button testId="end-home" variant="ghost" onClick={onHome}>
            {t('game.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
