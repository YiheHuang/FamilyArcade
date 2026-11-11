import { useEffect, useState } from 'react';
import { balloonName } from '../game/data';
import type { GameView, Move } from '../game/types';
import type { Lang } from '../i18n';
import type { Settings } from '../storage';
import { sound } from '../sound';
import { BalloonIcon } from './BalloonIcon';
import { Button, Scoreboard, type T } from './components';
import { EndModal } from './EndModal';
import { RoundSummary } from './RoundSummary';
import { PrivacyCover, SupportPanel } from './SupportPanel';
import { Track } from './Track';
import { WindRail } from './WindRail';

export function GameScreen({
  view,
  t,
  lang,
  settings,
  hintText,
  thinking,
  canUndo,
  canAdvance,
  canRematch,
  lan,
  onMove,
  onUndo,
  onHint,
  onClearHint,
  onHome,
  onRules,
  onAdvance,
  onReplay,
  onRematch,
  onReconnect,
}: {
  view: GameView;
  t: T;
  lang: Lang;
  settings: Settings;
  hintText: string | null;
  thinking: boolean;
  canUndo: boolean;
  canAdvance: boolean;
  canRematch: boolean;
  lan: { role: 'host' | 'guest'; code: string; online: boolean } | null;
  onMove: (move: Move) => void;
  onUndo: () => void;
  onHint: () => void;
  onClearHint: () => void;
  onHome: () => void;
  onRules: () => void;
  onAdvance: () => void;
  onReplay: () => void;
  onRematch: () => void;
  onReconnect: () => void;
}) {
  const [coverOpen, setCoverOpen] = useState(true);
  const [revealCount, setRevealCount] = useState(5);
  const [showEnd, setShowEnd] = useState(true);

  const currentSeat = view.current >= 0 ? view.seats[view.current] : null;
  const humanTurn =
    view.phase === 'support' &&
    currentSeat?.kind === 'human' &&
    view.mySeat !== null &&
    view.current === view.mySeat;
  const isSummary = view.phase === 'summary';
  const record = view.lastRound;
  const revealDone = !isSummary || revealCount >= view.balloons.length;

  useEffect(() => {
    if (humanTurn) setCoverOpen(true);
    else setCoverOpen(false);
  }, [humanTurn, view.current, view.round]);

  useEffect(() => {
    if (view.phase !== 'summary' || !record) {
      setRevealCount(5);
      return;
    }
    if (settings.reducedMotion) {
      setRevealCount(5);
      return;
    }
    setRevealCount(0);
    const timers: number[] = [];
    for (let i = 0; i < view.balloons.length; i++) {
      timers.push(
        window.setTimeout(() => {
          setRevealCount(i + 1);
          sound.wind(i);
        }, 280 + i * 380),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [view.phase, view.round, view.balloons.length, record, settings.reducedMotion]);

  useEffect(() => {
    if (view.phase === 'ended') setShowEnd(true);
  }, [view.phase]);

  const displayPositions =
    isSummary && record
      ? view.positions.map((position, index) =>
          revealCount > index ? position : record.positionsBefore[index],
        )
      : view.positions;

  const max = Math.max(...displayPositions);
  const leading =
    view.phase === 'support'
      ? displayPositions.map((p, i) => (p === max && max > 0 ? i : -1)).filter((i) => i >= 0)
      : displayPositions.map((p, i) => (p === max ? i : -1)).filter((i) => i >= 0);

  const phaseLabel =
    view.phase === 'support'
      ? t('game.phaseSupport')
      : view.phase === 'summary'
        ? t('game.phaseSummary')
        : t('game.phaseEnded');
  const subtitle =
    view.phase === 'support'
      ? currentSeat
        ? thinking
          ? t('game.thinking')
          : t('game.turnOf', { name: currentSeat.name })
        : t('game.phaseSupport')
      : view.phase === 'summary'
        ? t('game.roundResult', { n: view.round })
        : t('game.endTitle');

  return (
    <div className={`game screen${settings.reducedMotion ? ' reduce-motion' : ''}`} data-speed={settings.speed}>
      <header className="game__head">
        <button type="button" className="text-btn" data-testid="game-home" onClick={onHome}>
          ← {t('game.home')}
        </button>
        <div className="round-banner" aria-live="polite">
          <span className="eyebrow">{phaseLabel}</span>
          <h1>{t('game.round', { n: view.round, total: view.rounds })}</h1>
          <small>{subtitle}</small>
        </div>
        <div className="round-dots" aria-hidden>
          {Array.from({ length: view.rounds }, (_, index) => (
            <span
              key={index}
              className={`round-dot${index + 1 < view.round ? ' is-done' : ''}${index + 1 === view.round ? ' is-live' : ''}`}
            />
          ))}
        </div>
      </header>

      <div className="game__grid">
        <main className="game__main">
          <section className="track-panel">
            <div className="track-panel__head">
              <div>
                <span className="eyebrow">{t('game.track')}</span>
                <p className="track-panel__note">
                  {view.phase === 'support' ? t('game.roundPointsNote') : t('game.windRevealNote')}
                </p>
              </div>
              <span className="paper-stamp">{t('game.overallNote')}</span>
            </div>
            <Track
              positions={displayPositions}
              balloons={view.balloons}
              t={t}
              lang={lang}
              leading={leading}
            />
          </section>

          {isSummary && !revealDone && (
            <section className="reveal-strip" aria-live="polite">
              <span className="eyebrow">{t('game.revealWind')}</span>
              <div className="reveal-strip__balloons" aria-hidden>
                {view.balloons.map((balloon, index) => (
                  <span key={balloon.id} className={revealCount > index ? 'is-in' : ''}>
                    <BalloonIcon balloon={balloon} size={28} />
                  </span>
                ))}
              </div>
              <p className="muted">{t('game.windRevealNote')}</p>
            </section>
          )}

          {isSummary && revealDone && record && (
            <RoundSummary
              view={view}
              t={t}
              lang={lang}
              onAdvance={canAdvance ? onAdvance : undefined}
            />
          )}

          {view.phase === 'ended' && !showEnd && (
            <div className="end-reopen">
              <Button variant="primary" onClick={() => setShowEnd(true)}>
                {t('game.standings')}
              </Button>
            </div>
          )}
        </main>

        <aside className="game__panel">
          <Scoreboard view={view} t={t} />

          <WindRail
            wind={isSummary && record ? record.wind : null}
            revealed={isSummary ? revealCount : 0}
            balloons={view.balloons}
            lang={lang}
            t={t}
            supports={isSummary && record ? record.supports : null}
          />

          <div className="game__actions">
            <Button
              testId="undo"
              onClick={onUndo}
              disabled={!canUndo || view.phase === 'ended'}
              title={t('game.undoPrivacy')}
            >
              {t('game.undo')} <kbd>U</kbd>
            </Button>
            <Button testId="game-rules" variant="ghost" onClick={onRules}>
              {t('game.rules')}
            </Button>
          </div>

          {lan && (
            <div className="lan-game-status">
              <div>
                <span className="eyebrow">{t('lan.session')}</span>
                <strong>{t('lan.gameRoom', { code: lan.code })}</strong>
              </div>
              <span className={`pill${lan.online ? ' pill--live' : ' pill--muted'}`}>
                {lan.role === 'host' ? t('lan.hostBadge') : t('lan.guestBadge')}
                {' · '}
                {lan.online ? t('lan.online') : t('lan.offlineBadge')}
              </span>
              {lan.role === 'guest' && !lan.online && (
                <Button variant="secondary" onClick={onReconnect} testId="game-reconnect">
                  {t('game.lanReconnect')}
                </Button>
              )}
              <p className="muted">
                {lan.role === 'host' ? t('game.lanHostHint') : t('game.lanGuestHint')}
              </p>
            </div>
          )}

          <div className="game__meta">
            <span>{t('game.tiebreak')}</span>
            <span>{lan ? t('lan.waitingAdvance') : t('game.autoSave')}</span>
          </div>

          {view.phase === 'support' && (
            <div className="support-status">
              <span className="eyebrow">{t('game.support')}</span>
              {view.seats.map((seat, index) => (
                <span key={index} className={`support-status__row${view.submitted[index] ? ' is-done' : ''}`}>
                  <span>{seat.name}</span>
                  <span>{view.submitted[index] ? t('game.submitted') : t('game.waiting')}</span>
                </span>
              ))}
            </div>
          )}

          {view.phase === 'summary' && (
            <p className="panel-note">{t('game.overallNote')}</p>
          )}
        </aside>
      </div>

      {humanTurn && coverOpen && currentSeat && (
        <PrivacyCover name={currentSeat.name} t={t} onOpen={() => setCoverOpen(false)} />
      )}
      {humanTurn && !coverOpen && (
        <SupportPanel
          view={view}
          t={t}
          lang={lang}
          hintText={hintText}
          thinking={thinking}
          onLock={onMove}
          onHint={onHint}
          onClearHint={onClearHint}
        />
      )}

      {view.phase === 'ended' && showEnd && (
        <EndModal
          view={view}
          t={t}
          canRematch={canRematch}
          onReplay={onReplay}
          onRematch={onRematch}
          onHome={onHome}
        />
      )}

      <span className="sr-only">
        {view.balloons.map((balloon, index) => `${balloonName(balloon, lang)} ${view.positions[index]}. `).join('')}
      </span>
    </div>
  );
}
