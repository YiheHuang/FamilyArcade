import { useState } from 'react';
import { typeOf } from '../game/data';
import { score } from '../game/engine';
import type { GameState } from '../game/types';
import { DessertIcon, dessertName, ScoreBreakdown, SeatDot, type T } from './components';

export function ReviewScreen({ t, state, onBack }: { t: T; state: GameState; onBack: () => void }) {
  const [roundIndex, setRoundIndex] = useState(0);
  const record = state.rounds[roundIndex];
  const rows = score(state);
  if (!record) {
    return (
      <div className="review screen">
        <header className="subhead">
          <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
            ← {t('game.reviewBack')}
          </button>
          <div>
            <h1>{t('game.reviewTitle')}</h1>
            <p className="muted">{t('game.reviewEmpty')}</p>
          </div>
          <span />
        </header>
      </div>
    );
  }

  return (
    <div className="review screen" data-testid="review-screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('game.reviewBack')}
        </button>
        <div>
          <div className="eyebrow">{t('game.reviewTitle')}</div>
          <h1>{t('game.reviewTitle')}</h1>
          <p className="muted">{t('game.reviewSub')}</p>
        </div>
        <span />
      </header>

      <div className="tabs" role="tablist" aria-label={t('game.roundTabs')}>
        {state.rounds.map((round, index) => (
          <button
            key={round.round}
            type="button"
            role="tab"
            aria-selected={roundIndex === index}
            className={`tabs__item${roundIndex === index ? ' is-active' : ''}`}
            onClick={() => setRoundIndex(index)}
            data-testid={`review-round-${round.round}`}
          >
            {t(`game.round${round.round}`)}
          </button>
        ))}
      </div>

      <div className="review__grid">
        <section className="panel review__picks">
          <div className="review__section-head">
            <h2>
              {t(`game.round${record.round}`)} · {t('game.reviewPicks')}
            </h2>
            <span className="pill">
              {record.passDirection === 'left' ? t('game.directionShort') : t('game.directionShortRight')}
            </span>
          </div>
          <div className="review-table-wrap">
            <table className="review-table">
              <thead>
                <tr>
                  <th>{t('game.player')}</th>
                  {Array.from({ length: 8 }, (_, index) => (
                    <th key={index}>{index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.config.seats.map((seat, seatIndex) => (
                  <tr key={seatIndex}>
                    <th>
                      <span className="review-table__name">
                        <SeatDot seat={seatIndex} size={16} />
                        {seat.name}
                      </span>
                    </th>
                    {record.picks.map((group, pickIndex) => {
                      const pick = group.find((entry) => entry.seat === seatIndex);
                      return (
                        <td key={pickIndex} title={pick ? dessertName(t, typeOf(pick.cardId)) : ''}>
                          {pick ? <DessertIcon type={typeOf(pick.cardId)} size={24} /> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="review__side">
          {record.breakdowns.map((breakdown) => (
            <article className="panel review__score" key={breakdown.seat}>
              <div className="review__score-head">
                <SeatDot seat={breakdown.seat} size={18} />
                <strong>{state.config.seats[breakdown.seat].name}</strong>
                <span className="pill">
                  {t('game.runningTotal')} {rows[breakdown.seat]?.total ?? 0}
                </span>
              </div>
              <ScoreBreakdown breakdown={breakdown} t={t} />
            </article>
          ))}
        </aside>
      </div>

      <div className="review__footer">
        <button type="button" className="text-btn" onClick={onBack}>
          {t('game.reviewBack')}
        </button>
      </div>
    </div>
  );
}
