import { useEffect, useMemo, useState } from 'react';
import { view as makeView } from '../game/engine';
import { typeOf } from '../game/data';
import type { GameState } from '../game/types';
import type { Settings } from '../storage';
import { sound } from '../sound';
import { CarouselTable, type CarouselPod } from './CarouselTable';
import {
  Button,
  CardFace,
  DessertIcon,
  dessertName,
  HandFan,
  SeatDot,
  type T,
} from './components';

export interface HintState {
  cardId: number;
  key: string;
  params?: Record<string, string | number>;
}

export function GameScreen({
  t,
  state,
  settings,
  hint,
  thinkingSeats,
  canUndo,
  onPick,
  onAdvance,
  onUndo,
  onHint,
  onHome,
  onRules,
}: {
  t: T;
  state: GameState;
  settings: Settings;
  hint: HintState | null;
  thinkingSeats: number[];
  canUndo: boolean;
  onPick: (cardId: number) => void;
  onAdvance: () => void;
  onUndo: () => void;
  onHint: () => void;
  onHome: () => void;
  onRules: () => void;
}) {
  const humanSeats = useMemo(
    () => state.config.seats.map((seat, index) => (seat.kind === 'human' ? index : -1)).filter((index) => index >= 0),
    [state.config.seats],
  );
  const unpickedHumans = humanSeats.filter((seat) => state.pending[seat] === null);
  const activeHuman = state.phase === 'choosing' ? unpickedHumans[0] ?? null : null;
  const currentKey = activeHuman !== null ? `${state.round}:${state.pickIndex}:${activeHuman}` : null;
  const gameView = useMemo(() => makeView(state, activeHuman), [state, activeHuman]);
  const [selected, setSelected] = useState<number | null>(null);
  const [uncoveredKey, setUncoveredKey] = useState<string | null>(null);
  const coverRequired = humanSeats.length > 1;
  const covered = coverRequired && activeHuman !== null && state.phase === 'choosing' && uncoveredKey !== currentKey;

  useEffect(() => {
    setSelected(null);
  }, [currentKey, state.phase]);

  const canPick =
    state.phase === 'choosing' &&
    activeHuman !== null &&
    !covered &&
    gameView.myPending === null &&
    gameView.myHand.length > 0;

  const hintReason = hint
    ? t(hint.key, {
        ...hint.params,
        dessert:
          typeof hint.params?.dessert === 'string' ? t(`dessert.${String(hint.params.dessert)}`) : '',
      })
    : null;

  const undo = () => {
    setUncoveredKey(null);
    onUndo();
  };

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
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (key === 'u') {
        undo();
        return;
      }
      if (key === 'h') {
        onHint();
        return;
      }
      if (!canPick) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (gameView.myHand.length === 0) return;
        const currentIndex = selected === null ? -1 : gameView.myHand.indexOf(selected);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex =
          currentIndex < 0
            ? step > 0
              ? 0
              : gameView.myHand.length - 1
            : (currentIndex + step + gameView.myHand.length) % gameView.myHand.length;
        setSelected(gameView.myHand[nextIndex]);
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
  }, [canPick, gameView.myHand, selected, onUndo, onHint, onPick]);
  const pods: CarouselPod[] = state.config.seats.map((seat, index) => {
    const publicSeat = gameView.seats[index];
    return {
      seat: index,
      name: seat.name,
      kind: seat.kind,
      score: publicSeat.total,
      cards: publicSeat.roundCollected,
      crowns: publicSeat.majorities,
      status:
        state.phase === 'choosing'
          ? state.pending[index] !== null
            ? 'picked'
            : index === activeHuman
              ? 'active'
              : 'waiting'
          : 'idle',
    };
  });

  const center =
    state.phase === 'reveal' ? (
      <div className="choose-center">
        <strong>{t('game.revealTitle')}</strong>
        <span className="muted">{t('game.revealBody')}</span>
      </div>
    ) : state.phase === 'choosing' ? (
      <div className="choose-center">
        {gameView.myPending !== null ? (
          <>
            <div className="choose-center__back" aria-hidden>
              <span className="card-back__mark">SC</span>
            </div>
            <strong>{t('game.picked')}</strong>
            <span className="muted">{t('game.waiting')}</span>
          </>
        ) : thinkingSeats.length > 0 && activeHuman === null ? (
          <>
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <strong>{t('game.thinking')}</strong>
            <span className="muted">{t('game.waiting')}</span>
          </>
        ) : activeHuman !== null ? (
          <>
            <span className="choose-center__eyebrow">{t('game.yourTurn')}</span>
            <strong>{t('game.choose')}</strong>
            <span className="muted">{t('game.chooseHint', { dir: state.passDirection === 'left' ? t('game.left') : t('game.right') })}</span>
          </>
        ) : (
          <>
            <strong>{t('game.waiting')}</strong>
            <span className="muted">{t('game.passAnimation')}</span>
          </>
        )}
      </div>
    ) : (
      <div className="choose-center">
        <strong>{t('game.roundEnd', { n: state.round })}</strong>
        <span className="muted">{t('game.roundEndSub')}</span>
      </div>
    );

  if (covered && activeHuman !== null) {
    const seat = activeHuman;
    return (
      <div className="game game--cover screen" data-testid="game-screen">
        <header className="game__head">
          <button type="button" className="text-btn" data-testid="game-home" onClick={onHome}>
            ← {t('game.home')}
          </button>
          <div className="turn-banner">
            <SeatDot seat={seat} size={22} />
            <span>
              <strong>{t('game.roundOf', { n: state.round })}</strong>
              <small>{t('game.pickOf', { n: state.pickIndex + 1 })}</small>
            </span>
          </div>
          <button type="button" className="text-btn" data-testid="game-rules" onClick={onRules}>
            {t('game.rules')}
          </button>
        </header>
        <div className="cover-card" data-testid="privacy-cover">
          <div className="cover-card__ornament" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="eyebrow">
            {t('game.roundOf', { n: state.round })} · {t('game.pickOf', { n: state.pickIndex + 1 })}
          </div>
          <h1>{t('game.coverTitle', { name: state.config.seats[seat].name })}</h1>
          <p>{t('game.coverBody')}</p>
          <div className="cover-card__art" aria-hidden>
            <div className="card-back card-back--large">
              <span className="card-back__ring" />
              <span className="card-back__mark">SC</span>
            </div>
          </div>
          <Button testId="cover-ready" variant="primary" onClick={() => setUncoveredKey(currentKey)} autoFocus>
            {t('game.coverReady', { name: state.config.seats[seat].name })}
          </Button>
          <p className="muted cover-card__hint">{t('game.coverHint')}</p>
          <button type="button" className="text-btn" onClick={onHome}>
            {t('game.coverBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game screen" data-testid="game-screen">
      <header className="game__head">
        <button type="button" className="text-btn" data-testid="game-home" onClick={onHome}>
          ← {t('game.home')}
        </button>
        <div className={`turn-banner${activeHuman !== null ? ' is-you' : ''}`}>
          {activeHuman !== null && <SeatDot seat={activeHuman} size={22} />}
          <span>
            <strong data-testid="turn-title">
              {state.phase === 'reveal'
                ? t('game.revealTitle')
                : activeHuman !== null
                  ? t('game.turnOf', { name: state.config.seats[activeHuman].name })
                  : t('game.waiting')}
            </strong>
            <small>
              {t('game.roundOf', { n: state.round })} · {t('game.pickOf', { n: Math.min(state.pickIndex + 1, 8) })} ·{' '}
              {state.passDirection === 'left' ? t('game.passLeft') : t('game.passRight')}
            </small>
          </span>
        </div>
        <button type="button" className="text-btn" data-testid="game-rules" onClick={onRules}>
          {t('game.rules')}
        </button>
      </header>

      <div className="game__grid">
        <main className="game__table">
          <CarouselTable
            pods={pods}
            center={center}
            passDirection={state.passDirection}
            round={state.round}
            pickIndex={state.pickIndex}
            t={t}
          />
        </main>

        <aside className="game__panel">
          <div className="game__panel-title">
            <span className="eyebrow">{t('game.table')}</span>
            <span className="pill">{t('game.pickCount', { n: state.pickIndex + (state.phase === 'reveal' ? 1 : 0), m: 8 })}</span>
          </div>

          {hint && hintReason && (
            <div className="hint-box" data-testid="hint-box">
              <span className="hint-box__label">{t('game.hint')}</span>
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

          {state.phase === 'reveal' && gameView.roundBreakdowns && (
            <div className="game__panel-section">
              <span className="eyebrow">{t('game.roundScore')}</span>
              <div className="reveal-scores">
                {gameView.roundBreakdowns.map((breakdown) => (
                  <div key={breakdown.seat} className="reveal-score-row">
                    <SeatDot seat={breakdown.seat} size={16} />
                    <span>{state.config.seats[breakdown.seat].name}</span>
                    <strong>{breakdown.total}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hint && activeHuman !== null && gameView.myHand.includes(hint.cardId) && (
            <div className="hint-card-preview">
              <CardFace
                cardId={hint.cardId}
                name={dessertName(t, typeOf(hint.cardId))}
                size="tiny"
              />
              <span>{t('game.hintReady', { reason: hintReason ?? '' })}</span>
            </div>
          )}

          <div className="game__actions">
            <Button testId="undo" onClick={undo} disabled={!canUndo}>
              {t('game.undo')} <kbd>U</kbd>
            </Button>
            <Button testId="hint" onClick={onHint} disabled={!canPick}>
              {t('game.hint')} <kbd>H</kbd>
            </Button>
            <Button testId="game-rules-panel" variant="ghost" onClick={onRules}>
              {t('game.rules')}
            </Button>
          </div>

          {settings.reducedMotion && <p className="muted small">{t('game.reducedMotion')}</p>}
        </aside>
      </div>

      <section className="game__hand-area">
        {state.phase === 'reveal' ? (
          <>
            <div className="reveal-strip" data-testid="reveal-list">
              {gameView.revealed.map((pick) => (
                <div className="reveal-strip__item" key={pick.seat}>
                  <SeatDot seat={pick.seat} size={16} />
                  <CardFace
                    cardId={pick.cardId}
                    name={dessertName(t, typeOf(pick.cardId))}
                    size="tiny"
                    testId={`reveal-card-${pick.seat}`}
                  />
                  <span>{state.config.seats[pick.seat].name}</span>
                </div>
              ))}
            </div>
            <div className="pass-bar">
              <div className="pass-bar__text">
                <strong>{t('game.revealBody')}</strong>
                <span className="muted">
                  {state.passDirection === 'left' ? t('game.revealPassLeft') : t('game.revealPassRight')}
                </span>
              </div>
              <Button testId="advance" variant="primary" onClick={onAdvance}>
                {state.passDirection === 'left' ? t('game.passLeft') : t('game.passRight')} →
              </Button>
            </div>
          </>
        ) : state.phase === 'choosing' && activeHuman !== null && gameView.myPending === null && canPick ? (
          <>
            <div className="hand-area__head">
              <span className="eyebrow">{t('game.hand')}</span>
              <span className="muted">
                {state.config.seats[activeHuman].name} · {t('game.choose')}
              </span>
            </div>
            <HandFan
              cards={gameView.myHand}
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
              <div className="pick-bar__selection" data-testid="selected-name">
                {selected !== null ? (
                  <>
                    <DessertIconInline cardId={selected} t={t} />
                    <strong>{t('game.selected', { name: dessertName(t, typeOf(selected)) })}</strong>
                  </>
                ) : (
                  <span className="muted">{t('game.choose')}</span>
                )}
              </div>
              <div className="pick-bar__actions">
                <Button testId="cancel-pick" variant="ghost" onClick={() => setSelected(null)} disabled={selected === null}>
                  {t('game.cancel')}
                </Button>
                <Button testId="confirm-pick" variant="primary" onClick={confirm} disabled={selected === null}>
                  {t('game.confirm')} <kbd>↵</kbd>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="waiting-bar" data-testid="waiting-bar">
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>{t('game.waiting')}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function DessertIconInline({ cardId, t }: { cardId: number; t: T }) {
  const type = typeOf(cardId);
  return (
    <span className="pick-bar__icon" title={dessertName(t, type)}>
      <DessertIcon type={type} size={22} />
    </span>
  );
}
