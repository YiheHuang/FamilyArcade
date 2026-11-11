import { useEffect, useState } from 'react';
import { typeOf } from '../game/data';
import type { GameView, RoundBreakdown } from '../game/types';
import { sound } from '../sound';
import { CarouselTable, type CarouselPod } from './CarouselTable';
import {
  Button,
  CardFace,
  CrownIcon,
  CrownList,
  DessertTally,
  dessertName,
  HandFan,
  ScoreBreakdown,
  SeatDot,
  type T,
} from './components';
import type { HintState } from './GameScreen';

export function LanGameScreen({
  t,
  view,
  mySeat,
  isHost,
  hint,
  sent,
  onPick,
  onAdvance,
  onNextRound,
  onRematch,
  onHome,
  onRules,
  onHint,
}: {
  t: T;
  view: GameView;
  mySeat: number;
  isHost: boolean;
  hint: HintState | null;
  sent: boolean;
  onPick: (cardId: number) => void;
  onAdvance: () => void;
  onNextRound: () => void;
  onRematch: () => void;
  onHome: () => void;
  onRules: () => void;
  onHint: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [view.round, view.pickIndex, view.phase, mySeat]);

  const canPick =
    view.phase === 'choosing' &&
    view.myHand.length > 0 &&
    view.myPending === null &&
    !sent;

  const hintReason = hint
    ? t(hint.key, {
        ...hint.params,
        dessert:
          typeof hint.params?.dessert === 'string' ? t(`dessert.${String(hint.params.dessert)}`) : '',
      })
    : null;

  const confirm = () => {
    if (selected === null) return;
    sound.play('pick');
    onPick(selected);
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (!canPick) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (view.myHand.length === 0) return;
        const current = selected === null ? -1 : view.myHand.indexOf(selected);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next =
          current < 0
            ? step > 0
              ? 0
              : view.myHand.length - 1
            : (current + step + view.myHand.length) % view.myHand.length;
        setSelected(view.myHand[next]);
        sound.play('click');
        return;
      }
      if (event.key === 'Enter' && selected !== null && target?.tagName !== 'BUTTON') {
        event.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPick, view.myHand, selected, onPick]);

  if (view.phase === 'round-end') {
    return <LanRoundSummary t={t} view={view} isHost={isHost} onNextRound={onNextRound} onHome={onHome} onRules={onRules} />;
  }

  if (view.phase === 'ended') {
    return <LanResult t={t} view={view} isHost={isHost} onRematch={onRematch} onHome={onHome} onRules={onRules} />;
  }

  const pods: CarouselPod[] = view.seats.map((seat) => ({
    seat: seat.seat,
    name: seat.name,
    kind: seat.kind,
    score: seat.total,
    cards: seat.roundCollected,
    crowns: seat.majorities,
    status:
      view.phase === 'choosing'
        ? seat.hasPicked
          ? 'picked'
          : seat.seat === mySeat
            ? 'active'
            : 'waiting'
        : 'idle',
  }));

  const center =
    view.phase === 'reveal' ? (
      <div className="choose-center">
        <strong>{t('lan.reveal')}</strong>
        <span className="muted">{t('game.revealBody')}</span>
      </div>
    ) : (
      <div className="choose-center">
        {sent || view.myPending !== null ? (
          <>
            <div className="choose-center__back" aria-hidden>
              <span className="card-back__mark">SC</span>
            </div>
            <strong>{t('lan.picked')}</strong>
            <span className="muted">{t('lan.waitingOthers')}</span>
          </>
        ) : mySeat >= 0 && view.myHand.length > 0 ? (
          <>
            <span className="choose-center__eyebrow">{t('lan.yourTurn')}</span>
            <strong>{t('game.choose')}</strong>
            <span className="muted">
              {t('game.chooseHint', {
                dir: view.passDirection === 'left' ? t('lan.passLeft') : t('lan.passRight'),
              })}
            </span>
          </>
        ) : (
          <>
            <strong>{t('lan.waitingOthers')}</strong>
            <span className="muted">{t('lan.connection')}</span>
          </>
        )}
      </div>
    );

  return (
    <div className="game lan-game screen" data-testid="lan-game">
      <header className="game__head">
        <button type="button" className="text-btn" data-testid="lan-leave" onClick={onHome}>
          ← {t('lan.leave')}
        </button>
        <div className={`turn-banner${canPick ? ' is-you' : ''}`}>
          <span className="lan-role-badge">{isHost ? t('lan.roleHost') : t('lan.roleGuest')}</span>
          <span>
            <strong>{canPick ? t('lan.yourTurn') : t('lan.connectionBadge')}</strong>
            <small>
              {t('game.roundOf', { n: view.round })} · {t('game.pickOf', { n: Math.min(view.pickIndex + 1, 8) })}
            </small>
          </span>
        </div>
        <button type="button" className="text-btn" data-testid="lan-rules" onClick={onRules}>
          {t('game.rules')}
        </button>
      </header>

      <div className="game__grid">
        <main className="game__table">
          <CarouselTable
            pods={pods}
            center={center}
            passDirection={view.passDirection}
            round={view.round}
            pickIndex={view.pickIndex}
            t={t}
          />
        </main>

        <aside className="game__panel">
          <div className="game__panel-title">
            <span className="eyebrow">{t('lan.connection')}</span>
            <span className="pill">{isHost ? t('lan.roleHost') : t('lan.roleGuest')}</span>
          </div>

          {hint && hintReason && (
            <div className="hint-box" data-testid="lan-hint-box">
              <span className="hint-box__label">{t('lan.hint')}</span>
              <strong>{hintReason}</strong>
            </div>
          )}

          <div className="game__panel-section game__panel-section--legend">
            <span className="eyebrow">{t('game.roundScoreBreakdown')}</span>
            <div className="score-legend">
              <span>
                <b>2</b> {t('score.pair')}
              </span>
              <span>
                <b>6</b> {t('score.triple')}
              </span>
              <span>
                <b>12</b> {t('score.quad')}
              </span>
              <span>
                <b>5</b> {t('score.sampler')}
              </span>
              <span>
                <b>1</b> {t('score.leftover')}
              </span>
            </div>
          </div>

          <div className="game__actions">
            <Button testId="lan-hint" onClick={onHint} disabled={!canPick}>
              {t('lan.hint')}
            </Button>
            <Button testId="lan-rules-panel" variant="ghost" onClick={onRules}>
              {t('game.rules')}
            </Button>
          </div>
          <p className="hint-text">{isHost ? t('lan.hostControls') : t('lan.guestControls')}</p>
        </aside>
      </div>

      <section className="game__hand-area">
        {view.phase === 'reveal' ? (
          <>
            <div className="reveal-strip" data-testid="lan-reveal-list">
              {view.revealed.map((pick) => (
                <div className="reveal-strip__item" key={pick.seat}>
                  <SeatDot seat={pick.seat} size={16} />
                  <CardFace
                    cardId={pick.cardId}
                    name={dessertName(t, typeOf(pick.cardId))}
                    size="tiny"
                    testId={`lan-reveal-${pick.seat}`}
                  />
                  <span>{view.seats[pick.seat]?.name}</span>
                </div>
              ))}
            </div>
            <div className="pass-bar">
              <div className="pass-bar__text">
                <strong>{t('game.revealBody')}</strong>
                <span className="muted">
                  {t('lan.pass', {
                    dir: view.passDirection === 'left' ? t('lan.passLeft') : t('lan.passRight'),
                  })}
                </span>
              </div>
              {isHost ? (
                <Button testId="lan-advance" variant="primary" onClick={onAdvance}>
                  {t('lan.advanceHost')} →
                </Button>
              ) : (
                <span className="muted">{t('lan.waitingHostNext')}</span>
              )}
            </div>
          </>
        ) : canPick ? (
          <>
            <div className="hand-area__head">
              <span className="eyebrow">{t('game.hand')}</span>
              <span className="muted">
                {view.seats[mySeat]?.name} · {t('game.choose')}
              </span>
            </div>
            <HandFan
              cards={view.myHand}
              selected={selected}
              onSelect={(cardId) => {
                sound.play('click');
                setSelected((current) => (current === cardId ? null : cardId));
              }}
              disabled={false}
              t={t}
              hintCard={hint?.cardId ?? null}
            />
            <div className="pick-bar">
              <div className="pick-bar__selection" data-testid="lan-selected">
                {selected !== null ? (
                  <strong>{t('game.selected', { name: dessertName(t, typeOf(selected)) })}</strong>
                ) : (
                  <span className="muted">{t('game.choose')}</span>
                )}
              </div>
              <div className="pick-bar__actions">
                <Button testId="lan-cancel" variant="ghost" onClick={() => setSelected(null)} disabled={selected === null}>
                  {t('game.cancel')}
                </Button>
                <Button testId="lan-confirm" variant="primary" onClick={confirm} disabled={selected === null}>
                  {t('game.confirm')} <kbd>↵</kbd>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="waiting-bar" data-testid="lan-waiting">
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>{sent ? t('lan.pickSent') : t('lan.waitingOthers')}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function LanRoundSummary({
  t,
  view,
  isHost,
  onNextRound,
  onHome,
  onRules,
}: {
  t: T;
  view: GameView;
  isHost: boolean;
  onNextRound: () => void;
  onHome: () => void;
  onRules: () => void;
}) {
  const record = view.rounds[view.rounds.length - 1];
  const breakdowns = record?.breakdowns ?? view.roundBreakdowns ?? [];
  return (
    <div className="lan-screen lan-summary screen" data-testid="lan-round-summary">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onHome}>
          ← {t('lan.leave')}
        </button>
        <div>
          <div className="eyebrow">{t('lan.connectionBadge')}</div>
          <h1>{t('lan.roundEnd', { n: view.round })}</h1>
          <p className="muted">{t('game.roundEndSub')}</p>
        </div>
        <button type="button" className="text-btn" onClick={onRules}>
          {t('game.rules')}
        </button>
      </header>

      <div className="lan-summary-grid">
        {view.score.map((row) => (
          <article className="summary-card" key={row.seat}>
            <div className="summary-card__head">
              <SeatDot seat={row.seat} size={24} />
              <div>
                <strong>{row.name}</strong>
                <small>{t('lan.total')} {row.total}</small>
              </div>
              <span className="summary-card__points">
                +{breakdowns[row.seat]?.total ?? 0}
                <small>{t('game.pointsShort')}</small>
              </span>
            </div>
            {breakdowns[row.seat] ? <ScoreBreakdown breakdown={breakdowns[row.seat] as RoundBreakdown} t={t} /> : null}
            <div className="summary-card__cards">
              <DessertTally cards={view.seats[row.seat]?.roundCollected ?? []} t={t} max={6} size={18} />
            </div>
          </article>
        ))}
      </div>

      <div className="lan-next-bar">
        {isHost ? (
          <Button testId="lan-next" variant="primary" onClick={onNextRound}>
            {view.round >= 3 ? t('lan.finalRound') : t('lan.nextRound')} →
          </Button>
        ) : (
          <span className="muted">{t('lan.waitingHostNext')}</span>
        )}
      </div>
    </div>
  );
}

function LanResult({
  t,
  view,
  isHost,
  onRematch,
  onHome,
  onRules,
}: {
  t: T;
  view: GameView;
  isHost: boolean;
  onRematch: () => void;
  onHome: () => void;
  onRules: () => void;
}) {
  const result = view.result;
  if (!result) return null;
  const names = view.seats.map((seat) => seat.name);
  return (
    <div className="lan-screen lan-result screen" data-testid="lan-end">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onHome}>
          ← {t('lan.leave')}
        </button>
        <div>
          <div className="eyebrow">{t('lan.connectionBadge')}</div>
          <h1>{t('lan.final')}</h1>
          <p className="muted">{t('lan.finished')}</p>
        </div>
        <button type="button" className="text-btn" onClick={onRules}>
          {t('game.rules')}
        </button>
      </header>

      <div className="lan-result-grid">
        <section className="panel">
          <table className="rank-table">
            <thead>
              <tr>
                <th>{t('lan.rank')}</th>
                <th>{t('lan.player')}</th>
                {[1, 2, 3].map((round) => (
                  <th key={round}>{t(`game.round${round}`)}</th>
                ))}
                <th>{t('lan.crowns')}</th>
                <th>{t('lan.total')}</th>
              </tr>
            </thead>
            <tbody>
              {result.ranking.map((row, index) => (
                <tr key={row.seat} className={row.seat === result.winner ? 'is-winner' : undefined}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="end-table__player">
                      <SeatDot seat={row.seat} size={18} />
                      {row.name}
                      {row.seat === result.winner && <CrownIcon size={16} />}
                    </span>
                  </td>
                  {[0, 1, 2].map((round) => (
                    <td key={round}>{row.roundScores[round] ?? '—'}</td>
                  ))}
                  <td>{row.majorities > 0 ? `♛ ${row.majorities}` : '—'}</td>
                  <td>
                    <strong>{row.total}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="panel lan-result-side">
          <div className="eyebrow">{t('lan.crowns')}</div>
          <h2>{t('lan.crowns')}</h2>
          <CrownList crowns={result.crowns} t={t} names={names} />
          <div className="lan-result-actions">
            {isHost ? (
              <Button testId="lan-rematch" variant="primary" onClick={onRematch}>
                {t('lan.rematch')} ↻
              </Button>
            ) : (
              <p className="muted">{t('lan.waitingRematch')}</p>
            )}
            <Button testId="lan-end-home" variant="ghost" onClick={onHome}>
              {t('lan.returnHome')}
            </Button>
          </div>
          <p className="hint-text">{t('lan.rematchHint')}</p>
        </aside>
      </div>
    </div>
  );
}
