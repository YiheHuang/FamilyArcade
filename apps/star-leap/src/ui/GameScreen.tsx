import { useEffect, useMemo, useState } from 'react';
import { legalMoves, MAX_MOVES, result, STALEMATE_TURNS } from '../game/engine';
import type { GameState, Move } from '../game/types';
import type { Lang } from '../i18n';
import type { Settings } from '../storage';
import { Board } from './Board';
import { Button, Modal, PlayerRail, type T } from './components';
import { seatTheme } from './theme';

export function GameScreen({
  t,
  lang,
  state,
  settings,
  hint,
  thinking,
  onMove,
  onUndo,
  onHint,
  onPass,
  onHome,
  onRematch,
  onReplay,
  localSeat = null,
  networked = false,
  isGuest = false,
  canRematch = true,
  lanNote = '',
  lanError = '',
  onReconnect,
}: {
  t: T;
  lang: Lang;
  state: GameState;
  settings: Settings;
  hint: Move | null;
  thinking: boolean;
  onMove: (move: Move) => void;
  onUndo: () => void;
  onHint: () => void;
  onPass: () => void;
  onHome: () => void;
  onRematch: () => void;
  onReplay: () => void;
  localSeat?: number | null;
  networked?: boolean;
  isGuest?: boolean;
  canRematch?: boolean;
  lanNote?: string;
  lanError?: string;
  onReconnect?: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showEnd, setShowEnd] = useState(true);

  const humanTurn =
    state.status === 'playing' &&
    (localSeat == null
      ? state.config.seats[state.current]?.kind === 'human'
      : state.current === localSeat);
  const moves = useMemo(() => legalMoves(state, state.current), [state]);
  const selectedMoves = useMemo(
    () => (selected == null ? [] : moves.filter((m) => m.from === selected)),
    [moves, selected],
  );
  const mustPass = humanTurn && moves.length === 0;
  const res = result(state);

  useEffect(() => {
    setSelected(null);
  }, [state.current, state.moves.length]);

  useEffect(() => {
    setShowEnd(true);
  }, [state.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') setSelected(null);
      if (networked) return;
      if (key === 'u') onUndo();
      if (key === 'h') onHint();
      if (key === 'p' && mustPass) onPass();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mustPass, networked, onHint, onPass, onUndo]);

  const seat = state.config.seats[state.current];
  const th = seatTheme(state.current);
  const last = state.lastMove;
  const yourSeat = localSeat == null ? null : localSeat;

  return (
    <div
      className={`game screen${settings.reducedMotion ? ' reduce-motion' : ''}`}
      data-speed={settings.speed}
    >
      <header className="game__head">
        <button type="button" className="text-btn" data-testid="game-home" onClick={onHome}>
          ← {t('game.home')}
        </button>
        <div className={`turn-banner${humanTurn ? ' is-you' : ''}`}>
          <span className={`seat-dot seat-dot--${th.mark}`} style={{ background: th.color }} aria-hidden>
            <span className="seat-dot__mark" />
          </span>
          <span>
            <strong>{state.status === 'ended' ? t('game.ended') : t('game.turnOf', { name: seat.name })}</strong>
            <small>
              {t('game.turn', { n: state.turn })}
              {thinking ? ` · ${t('game.thinking')}` : humanTurn ? ` · ${t('game.yourTurn')}` : ''}
            </small>
          </span>
        </div>
        <span className="game__head-spacer" />
      </header>

      <div className="game__grid">
        <main className="game__board">
          <Board
            state={state}
            selected={selected}
            legal={humanTurn ? selectedMoves : []}
            hint={humanTurn ? hint : null}
            interactive={humanTurn}
            onSelect={(hole) => {
              if (hole == null) setSelected(null);
              else setSelected((cur) => (cur === hole ? null : hole));
            }}
            onMove={(move) => {
              setSelected(null);
              onMove(move);
            }}
          />
          <div className="game__hintline">
            {humanTurn
              ? selected != null
                ? t('game.chainHint')
                : t('game.selectHint')
              : thinking
                ? t('game.thinking')
                : t('game.turnOf', { name: seat.name })}
          </div>
        </main>

        <aside className="game__panel">
          <PlayerRail state={state} t={t} localSeat={yourSeat} />

          {networked && (
            <div className={`lan-game-note${lanError ? ' is-error' : ''}`} role={lanError ? 'alert' : 'status'}>
              <strong>{t('home.lan')}</strong>
              <span>{lanError || lanNote}</span>
              {!lanError && <small>{t('lan.noUndo')}</small>}
              {isGuest && lanError && onReconnect && (
                <Button onClick={onReconnect}>{t('lan.reconnect')}</Button>
              )}
            </div>
          )}

          <div className="game__last">
            <span className="muted">{t('game.lastMove')}</span>
            {last && last.kind !== 'pass' ? (
              <span>
                {state.config.seats[last.seat].name} ·{' '}
                {last.kind === 'jump' ? (lang === 'zh' ? '连跳' : 'chain jump') : lang === 'zh' ? '走一步' : 'step'}
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </div>

          {hint && humanTurn && <div className="hint-box">{t('game.hintText')}</div>}

          <div className="game__actions">
            <Button
              testId="undo"
              onClick={onUndo}
              disabled={networked || state.moves.length === 0 || state.status === 'ended'}
              ariaLabel={networked ? t('lan.noUndo') : undefined}
            >
              {t('game.undo')} <kbd>U</kbd>
            </Button>
            <Button
              testId="hint"
              onClick={onHint}
              disabled={networked || !humanTurn || thinking}
              ariaLabel={networked ? t('lan.noUndo') : undefined}
            >
              {t('game.hint')} <kbd>H</kbd>
            </Button>
            {mustPass && (
              <Button testId="pass" variant="primary" onClick={onPass}>
                {t('game.pass')} <kbd>P</kbd>
              </Button>
            )}
          </div>

          {mustPass && <div className="hint-box hint-box--warn">{t('game.passHint')}</div>}

          {state.status === 'ended' && (
            <Button testId="ranking" variant="primary" onClick={() => setShowEnd(true)}>
              {t('game.ranking')}
            </Button>
          )}

          <div className="game__meta">
            <span>{t('game.target')}: {lang === 'zh' ? th.zh : th.en}</span>
            <span>{t('game.marbles', { n: 10 })}</span>
          </div>
        </aside>
      </div>

      {state.status === 'ended' && res && showEnd && (
        <Modal
          title={
            res.winner !== null
              ? t('game.winner', { name: state.config.seats[res.winner].name })
              : t('game.stalemate')
          }
          onClose={() => setShowEnd(false)}
          wide
          actions={
            <>
              <Button testId="replay" onClick={onReplay}>{t('game.replay')}</Button>
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
          <p className="muted">
            {res.reason === 'home'
              ? t('game.reasonHome')
              : res.reason === 'cap'
                ? t('game.reasonCap', { n: MAX_MOVES })
                : t('game.reasonStalemate', { n: STALEMATE_TURNS })}
          </p>
          {isGuest && <p className="hint-text">{t('lan.noteGuest', { seat: (localSeat ?? 0) + 1 })}</p>}
          <table className="rank-table">
            <thead>
              <tr>
                <th>{t('game.rank')}</th>
                <th>{t('game.player')}</th>
                <th>{t('game.homeCount')}</th>
                <th>{t('game.distance')}</th>
              </tr>
            </thead>
            <tbody>
              {res.ranking.map((row) => (
                <tr key={row.seat} className={row.seat === res.winner ? 'is-winner' : undefined}>
                  <td>{row.rank}</td>
                  <td>
                    <span className="swatch" style={{ background: seatTheme(row.seat).color }} />
                    {row.name}
                  </td>
                  <td>
                    {row.home} <span className="muted">{t('game.of', { n: 10 })}</span>
                  </td>
                  <td>{row.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
