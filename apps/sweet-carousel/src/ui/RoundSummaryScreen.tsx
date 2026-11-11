import { typeOf } from '../game/data';
import { score } from '../game/engine';
import { DESSERT_IDS, type DessertId, type GameState } from '../game/types';
import { Button, CrownIcon, DessertIcon, dessertName, ScoreBreakdown, SeatDot, type T } from './components';

export function RoundSummaryScreen({
  t,
  state,
  onNext,
  onHome,
  onRules,
}: {
  t: T;
  state: GameState;
  onNext: () => void;
  onHome: () => void;
  onRules: () => void;
}) {
  const record = state.rounds[state.rounds.length - 1];
  const rows = score(state);
  const nextRound = state.round + 1;
  const race = DESSERT_IDS.map((dessert: DessertId) => {
    const counts = state.collected.map((cards) => cards.filter((id) => typeOf(id) === dessert).length);
    const max = Math.max(...counts);
    const leaders = counts
      .map((count, seat) => ({ count, seat }))
      .filter((row) => row.count === max && max > 0);
    return { dessert, max, leaders };
  }).sort((a, b) => b.max - a.max);

  return (
    <div className="round-summary screen" data-testid="round-summary">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="game-home" onClick={onHome}>
          ← {t('game.home')}
        </button>
        <div>
          <div className="eyebrow">{t('game.roundOf', { n: state.round })}</div>
          <h1>{t('game.roundEnd', { n: state.round })}</h1>
          <p className="muted">{t('game.roundEndSub')}</p>
        </div>
        <button type="button" className="text-btn" onClick={onRules}>
          {t('game.rules')}
        </button>
      </header>

      <div className="round-summary__grid">
        <section className="round-summary__scores">
          {record.breakdowns.map((breakdown) => {
            const row = rows[breakdown.seat];
            return (
              <article className="summary-card" key={breakdown.seat}>
                <div className="summary-card__head">
                  <SeatDot seat={breakdown.seat} size={24} />
                  <div>
                    <strong>{state.config.seats[breakdown.seat].name}</strong>
                    <small>
                      {t('game.runningTotal')} {row.total}
                    </small>
                  </div>
                  <span className="summary-card__points">
                    +{breakdown.total}
                    <small>{t('game.pointsShort')}</small>
                  </span>
                </div>
                <ScoreBreakdown breakdown={breakdown} t={t} />
                <div className="summary-card__cards">
                  {record.picks.map((group) => {
                    const pick = group.find((entry) => entry.seat === breakdown.seat);
                    if (!pick) return null;
                    return (
                      <span
                        key={`${pick.seat}-${pick.cardId}`}
                        className="summary-card__card"
                        title={dessertName(t, typeOf(pick.cardId))}
                      >
                        <DessertIcon type={typeOf(pick.cardId)} size={18} />
                      </span>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>

        <aside className="round-summary__side">
          <section className="panel crown-race">
            <div className="eyebrow">{t('game.crownRace')}</div>
            <h2>{t('game.crowns')}</h2>
            <p className="hint-text">{t('rules.crownNote')}</p>
            <div className="crown-race__rows">
              {race.map(({ dessert, max, leaders }) => (
                <div className={`crown-race__row${max >= 6 && leaders.length === 1 ? ' is-leading' : ''}`} key={dessert}>
                  <DessertIcon type={dessert} size={22} />
                  <span className="crown-race__name">{dessertName(t, dessert)}</span>
                  <span className="crown-race__count">
                    {leaders.length === 0
                      ? '—'
                      : leaders.length === 1
                        ? `${state.config.seats[leaders[0].seat].name} ${max}`
                        : t('game.tied')}
                  </span>
                  {max >= 6 && leaders.length === 1 && <CrownIcon size={16} />}
                </div>
              ))}
            </div>
            {state.collected.every((cards) => cards.length === 0) && <p className="muted">{t('game.noCrowns')}</p>}
          </section>

          <div className="round-summary__next">
            <Button testId="next-round" variant="primary" wide onClick={onNext}>
              {nextRound <= 3 ? t('game.nextRound', { n: nextRound }) : t('game.ranking')} →
            </Button>
            <p className="hint-text">
              {state.round < 3
                ? state.passDirection === 'left'
                  ? t('game.passRight')
                  : t('game.passLeft')
                : t('game.finalRound')}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
