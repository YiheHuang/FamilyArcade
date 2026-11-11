import { useEffect, useMemo, useState } from 'react';
import { frontierCells, meepleChoicesFor, placementProblem } from '../game/engine';
import { edgeAt, tileName } from '../game/tiles';
import {
  DIR_NAMES,
  type Cell,
  type GameResult,
  type GameView,
  type Move,
  type Rotation,
} from '../game/types';
import type { Lang } from '../i18n';
import type { Settings } from '../storage';
import { Board } from './Board';
import {
  Button,
  FeatureIcon,
  MeeplePips,
  PlayerRail,
  SeatMark,
  type T,
} from './components';
import { TilePreview } from './TileArt';
import { palette, seatTheme } from './theme';

interface HintState {
  move: Move;
  text: string;
}

export interface LanGameBar {
  role: 'host' | 'guest';
  code: string;
  seat: number;
  seats: { seat: number; name: string; connected: boolean }[];
  connected: boolean;
  onReconnect?: () => void;
  reconnecting?: boolean;
}

const EDGE_COLOR: Record<string, string> = {
  city: palette.roof,
  road: palette.roadEdge,
  field: palette.tree,
};

function EdgeBadge({ dir, type, lang }: { dir: number; type: string; lang: Lang }) {
  const label = lang === 'zh' ? DIR_NAMES[dir].zh : DIR_NAMES[dir].en.slice(0, 1).toUpperCase();
  return (
    <span className={`edge-badge edge-badge--${type}`} style={{ color: EDGE_COLOR[type] }}>
      <span className="edge-badge__dir">{label}</span>
      <span className="edge-badge__dot" style={{ background: EDGE_COLOR[type] }} />
    </span>
  );
}

export function GameScreen({
  t,
  lang,
  state,
  result,
  settings,
  localSeat,
  myTurn = true,
  allowUndo = true,
  lan,
  hint,
  thinking,
  onMove,
  onUndo,
  onHint,
  onDiscard,
  onHome,
  onRematch,
  onReplay,
  onToast,
}: {
  t: T;
  lang: Lang;
  state: GameView;
  result: GameResult | null;
  settings: Settings;
  localSeat: number | null;
  myTurn?: boolean;
  allowUndo?: boolean;
  lan?: LanGameBar;
  hint: HintState | null;
  thinking: boolean;
  onMove: (move: Move) => void;
  onUndo: () => void;
  onHint: () => void;
  onDiscard: () => void;
  onHome: () => void;
  onRematch: () => void;
  onReplay: () => void;
  onToast: (message: string) => void;
}) {
  const [rotation, setRotation] = useState<Rotation>(0);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [meeple, setMeeple] = useState<number | null>(null);
  const [showEnd, setShowEnd] = useState(true);

  const humanTurn =
    state.status === 'playing' &&
    state.config.seats[state.current]?.kind === 'human' &&
    myTurn;
  const currentSeat = state.config.seats[state.current];
  const theme = seatTheme(state.current);

  useEffect(() => {
    setSelected(null);
    setMeeple(null);
    if (!state.currentTile || state.status !== 'playing') {
      setRotation(0);
      return;
    }
    const cells = frontierCells(state.tiles);
    for (let r = 0; r < 4; r++) {
      for (const cell of cells) {
        if (!placementProblem(state.tiles, state.currentTile, r as Rotation, cell.x, cell.y)) {
          setRotation(r as Rotation);
          return;
        }
      }
    }
    setRotation(0);
  }, [state.currentTile, state.current, state.moves.length, state.status, state.tiles]);

  useEffect(() => {
    setShowEnd(state.status === 'ended');
  }, [state.status]);

  useEffect(() => {
    if (hint?.move.kind === 'place') {
      setRotation(hint.move.rot);
      setSelected({ x: hint.move.x, y: hint.move.y });
      setMeeple(hint.move.meeple);
    }
  }, [hint]);

  const slots = useMemo(() => {
    const valid: Cell[] = [];
    const rotatable: Cell[] = [];
    const blocked: Cell[] = [];
    if (!state.currentTile || state.status !== 'playing') return { valid, rotatable, blocked };
    for (const cell of frontierCells(state.tiles)) {
      let fitsAny = false;
      let fitsCurrent = false;
      for (let r = 0; r < 4; r++) {
        if (!placementProblem(state.tiles, state.currentTile, r as Rotation, cell.x, cell.y)) {
          fitsAny = true;
          if (r === rotation) fitsCurrent = true;
        }
      }
      if (fitsCurrent) valid.push(cell);
      else if (fitsAny) rotatable.push(cell);
      else blocked.push(cell);
    }
    return { valid, rotatable, blocked };
  }, [state.tiles, state.currentTile, state.status, rotation]);

  useEffect(() => {
    if (!selected) return;
    if (!slots.valid.some((cell) => cell.x === selected.x && cell.y === selected.y)) {
      setSelected(null);
      setMeeple(null);
    }
  }, [slots, selected]);

  const choices = useMemo(() => {
    if (!selected || !state.currentTile || !humanTurn) return [];
    return meepleChoicesFor(state, state.current, selected.x, selected.y, rotation);
  }, [state, selected, rotation, humanTurn]);

  const availableChoices = choices.filter((choice) => !choice.occupied && !choice.complete);

  useEffect(() => {
    if (meeple != null && !availableChoices.some((choice) => choice.index === meeple)) {
      setMeeple(null);
    }
  }, [availableChoices, meeple]);

  const mustDiscard = humanTurn && slots.valid.length === 0 && slots.rotatable.length === 0;
  const activeHint =
    hint && hint.move.kind === 'place' ? { x: hint.move.x, y: hint.move.y } : null;
  const lastScored = state.lastScored.length > 0 ? state.lastScored : [];
  const canUndo = allowUndo && state.moves.length > 0 && !thinking;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'r' && humanTurn && state.currentTile) {
        event.preventDefault();
        setRotation((prev) => ((prev + 1) % 4) as Rotation);
        setSelected(null);
        setMeeple(null);
      }
      if (key === 'escape') {
        setSelected(null);
        setMeeple(null);
      }
      if (key === 'u') onUndo();
      if (key === 'h') onHint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [humanTurn, onHint, onUndo, state.currentTile]);

  const rotate = (dir: 1 | -1): void => {
    setRotation((prev) => (((prev + dir + 4) % 4) as Rotation));
    setSelected(null);
    setMeeple(null);
  };

  const selectSlot = (cell: Cell): void => {
    setSelected(cell);
    if (!availableChoices.some((choice) => choice.index === meeple)) setMeeple(null);
  };

  const confirm = (): void => {
    if (!selected || !state.currentTile) return;
    onMove({
      seat: state.current,
      kind: 'place',
      x: selected.x,
      y: selected.y,
      rot: rotation,
      meeple,
    });
    setSelected(null);
    setMeeple(null);
  };

  const chooseMeeple = (index: number): void => {
    if (meeple === index) setMeeple(null);
    else setMeeple(index);
  };

  const seatName = (seat: number): string => state.config.seats[seat]?.name ?? `Seat ${seat + 1}`;
  const pointsText = (n: number): string =>
    n === 1 ? t('game.pointOne') : t('game.points', { n });
  const tileCountText = (n: number): string =>
    n === 1 ? t('game.tileOne') : t('game.tilesInFeature', { n });
  const potentialText = (n: number): string =>
    n === 1 ? t('game.potentialOne') : t('game.potential', { n });
  const currentValueText = (n: number): string =>
    n === 1 ? t('game.currentValueOne') : t('game.currentValue', { n });
  const winnerNames =
    result?.tiedWinners.map((seat) => seatName(seat)) ?? [];
  const endTitle =
    winnerNames.length > 1
      ? t('end.sharedWin', { names: winnerNames.join(' · ') })
      : winnerNames.length === 1
        ? t('end.winner', { name: winnerNames[0] })
        : t('game.ended');

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
          <SeatMark seat={state.current} size={30} />
          <span>
            <strong>
              {state.status === 'ended' ? t('game.ended') : t('game.turnOf', { name: currentSeat.name })}
            </strong>
            <small>
              {t('game.turn', { n: state.turn })}
              {thinking ? ` · ${t('game.thinking')}` : humanTurn ? ` · ${t('game.yourTurn')}` : ''}
            </small>
          </span>
        </div>
        <div className="game__head-stats" aria-label={t('game.score')}>
          {state.config.seats.map((_seat, i) => (
            <span key={i} className={`head-score${state.current === i ? ' is-current' : ''}`}>
              <SeatMark seat={i} size={16} />
              <b>{state.scores[i] ?? 0}</b>
            </span>
          ))}
          <span className="head-bag" title={t('game.bag')}>
            <span className="head-bag__icon" /> {state.bagCount}
          </span>
        </div>
      </header>

      {lan && (
        <div className={`lan-strip${lan.connected ? '' : ' is-closed'}`} data-testid="lan-strip">
          <span className={`lan-strip__dot${lan.connected ? ' is-online' : ''}`} aria-hidden />
          <strong>{t('lan.inGame', { code: lan.code })}</strong>
          <span className="lan-strip__seat">{t('lan.yourSeatShort', { n: lan.seat + 1 })}</span>
          <span className="muted small">
            {t('lan.onlineSeats', {
              n: lan.seats.filter((seat) => seat.connected).length,
              total: lan.seats.length,
            })}
          </span>
          <span className="lan-strip__names">
            {lan.seats.map((seat) => (
              <span key={seat.seat} className={seat.connected ? 'is-online' : ''}>
                <SeatMark seat={seat.seat} size={14} />
                {seat.name}
              </span>
            ))}
          </span>
          {lan.role === 'guest' && !lan.connected && lan.onReconnect && (
            <button type="button" className="btn btn--small" onClick={lan.onReconnect} disabled={lan.reconnecting}>
              {lan.reconnecting ? t('lan.reconnecting') : t('lan.reconnect')}
            </button>
          )}
        </div>
      )}

      <div className="game__grid">
        <main className="game__board">
          <Board
            tiles={state.tiles}
            currentTile={state.currentTile}
            rotation={rotation}
            validSlots={humanTurn ? slots.valid : []}
            rotatableSlots={humanTurn ? slots.rotatable : []}
            blockedSlots={humanTurn ? slots.blocked : []}
            selectedSlot={selected}
            meepleChoices={choices}
            selectedMeeple={meeple}
            highlight={lastScored.flatMap((feature) => feature.tiles)}
            lastPlaced={state.lastMove && state.lastMove.kind === 'place' ? state.lastMove : null}
            hintSlot={humanTurn ? activeHint : null}
            interactive={humanTurn}
            fitKey={`${state.config.seed}-start`}
            onSlot={selectSlot}
            onInvalidSlot={(_cell, kind) => {
              onToast(kind === 'rotation' ? t('game.rotationNeeded') : t('game.slotBlocked'));
            }}
            onFeature={(index) => {
              const choice = availableChoices.find((c) => c.index === index);
              if (choice) chooseMeeple(index);
            }}
            ariaLabel={t('game.placeTile')}
          />
          <div className="game__mapbar">
            <span className="muted">{t('game.mapHint')}</span>
            {humanTurn && state.currentTile && (
              <span className="game__mapbar-hint">
                {selected ? t('game.spotChosen') : t('game.selectSlot')}
              </span>
            )}
          </div>
        </main>

        <aside className="game__panel">
          <PlayerRail state={state} t={t} localSeat={localSeat} />

          <section className="hand-panel" aria-label={t('game.hand')}>
            <div className="hand-panel__head">
              <span className="eyebrow">{t('game.hand')}</span>
              <span className="muted">
                {t('game.bag')} · {t('game.tilesLeft', { n: state.bagCount })}
              </span>
            </div>
            {state.currentTile ? (
              <div className="hand-panel__body">
                <div className="tile-figure">
                  <div
                    className="tile-figure__tile"
                    role="button"
                    tabIndex={humanTurn ? 0 : -1}
                    aria-label={t('game.rotate')}
                    onClick={() => humanTurn && rotate(1)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && humanTurn) {
                        event.preventDefault();
                        rotate(1);
                      }
                    }}
                  >
                    <TilePreview typeId={state.currentTile} rot={rotation} size={132} />
                  </div>
                  <div className="edge-ring" aria-hidden>
                    {[0, 1, 2, 3].map((dir) => (
                      <span key={dir} className={`edge-ring__item edge-ring__item--${dir}`}>
                        <EdgeBadge dir={dir} type={edgeAt(state.currentTile!, rotation, dir)} lang={lang} />
                      </span>
                    ))}
                  </div>
                </div>
                <div className="tile-figure__meta">
                  <strong>{tileName(state.currentTile!, lang)}</strong>
                  <span className="muted">
                    {rotation * 90}° · {t('game.meepleCount', { n: state.meeplesLeft[state.current] ?? 0 })}
                  </span>
                  <div className="rotate-row">
                    <Button
                      testId="rotate-left"
                      onClick={() => rotate(-1)}
                      disabled={!humanTurn}
                      ariaLabel={t('game.rotateLeft')}
                    >
                      ↺
                    </Button>
                    <Button
                      testId="rotate-right"
                      onClick={() => rotate(1)}
                      disabled={!humanTurn}
                      ariaLabel={t('game.rotateRight')}
                    >
                      ↻
                    </Button>
                    <kbd>R</kbd>
                  </div>
                  <p className="muted small">{t('game.rotateHint')}</p>
                </div>
              </div>
            ) : (
              <p className="muted">{t('game.bagEmpty')}</p>
            )}
          </section>

          {humanTurn && (
            <section className="action-panel">
              {mustDiscard ? (
                <>
                  <div className="notice notice--warn">
                    <strong>{t('game.mustDiscard')}</strong>
                    <p>{t('game.discardHint')}</p>
                  </div>
                  <Button variant="primary" wide testId="discard" onClick={onDiscard}>
                    {t('game.discard')} →
                  </Button>
                </>
              ) : selected ? (
                <>
                  <div className="action-panel__head">
                    <span className="eyebrow">{t('game.chooseMeeple')}</span>
                    <span className="pill">{t('game.spotChosen')}</span>
                  </div>
                  <div className="feature-list">
                    <button
                      type="button"
                      className={`feature-chip feature-chip--none${meeple == null ? ' is-selected' : ''}`}
                      onClick={() => setMeeple(null)}
                      aria-pressed={meeple == null}
                    >
                      <span className="feature-chip__icon">○</span>
                      <span className="feature-chip__body">
                        <strong>{t('game.noMeeple')}</strong>
                        <small>{t('game.noMeepleHint')}</small>
                      </span>
                    </button>
                    {choices.map((choice) => {
                      const disabled = choice.occupied || choice.complete;
                      const selectedChoice = meeple === choice.index;
                      const reason = choice.occupied ? t('game.occupied') : choice.complete ? t('game.complete') : '';
                      return (
                        <button
                          key={choice.index}
                          type="button"
                          data-feature={choice.index}
                          className={`feature-chip${selectedChoice ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                          onClick={() => !disabled && chooseMeeple(choice.index)}
                          disabled={disabled}
                          aria-pressed={selectedChoice}
                          title={reason}
                        >
                          <span className="feature-chip__icon">
                            <FeatureIcon type={choice.type} size={22} />
                          </span>
                          <span className="feature-chip__body">
                            <strong>{t(`game.feature.${choice.type}`)}</strong>
                            <small>
                              {choice.type === 'monastery'
                                ? potentialText(9)
                                : tileCountText(choice.tiles)}
                              {choice.type !== 'monastery' && choice.openEdges > 0
                                ? ` · ${t('game.openEdges', { n: choice.openEdges })}`
                                : ''}
                              {reason ? ` · ${reason}` : ''}
                            </small>
                          </span>
                          {choice.type !== 'monastery' && (
                            <span className="feature-chip__points">
                              {currentValueText(choice.pointsIfCompleted)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {choices.length === 0 && (
                    <p className="muted small">
                      {state.meeplesLeft[state.current] === 0
                        ? t('game.noMeepleAvailable')
                        : t('game.featureEmpty')}
                    </p>
                  )}
                  <div className="action-panel__buttons">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelected(null);
                        setMeeple(null);
                      }}
                    >
                      {t('game.cancel')}
                    </Button>
                    <Button variant="primary" testId="confirm-place" onClick={confirm}>
                      {t('game.confirm')} <kbd>↵</kbd>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="action-panel__head">
                    <span className="eyebrow">{t('game.yourTurn')}</span>
                    <span className="muted small">{t('game.keyboardHelp')}</span>
                  </div>
                  <p className="action-panel__lead">{t('game.selectSlot')}</p>
                  <div className="action-panel__buttons">
                    <Button onClick={onHint} disabled={thinking} testId="hint">
                      {t('game.hint')} <kbd>H</kbd>
                    </Button>
                    <Button onClick={onUndo} disabled={!canUndo} testId="undo">
                      {t('game.undo')} <kbd>U</kbd>
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {!humanTurn && state.status === 'playing' && (
            <section className="action-panel action-panel--ai">
              <div className="thinking-row">
                {thinking ? (
                  <span className="thinking-dots" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <span className="lan-wait-dot" aria-hidden />
                )}
                <span>
                  <strong>{currentSeat.name}</strong> ·{' '}
                  {thinking ? t('game.thinking') : t('lan.waitingFor', { name: currentSeat.name })}
                </span>
              </div>
              <MeeplePips left={state.meeplesLeft[state.current] ?? 0} />
              <div className="action-panel__buttons">
                <Button onClick={onUndo} disabled={!canUndo} testId="undo">
                  {t('game.undo')} <kbd>U</kbd>
                </Button>
              </div>
            </section>
          )}

          {hint && humanTurn && (
            <div className="hint-box">
              <span className="hint-box__icon">✦</span>
              <span>{hint.text}</span>
            </div>
          )}

          <section className="scored-panel">
            <div className="scored-panel__head">
              <span className="eyebrow">{t('game.lastScored')}</span>
              {state.status === 'ended' && <span className="pill">{t('game.finalScore')}</span>}
            </div>
            {lastScored.length === 0 ? (
              <p className="muted small">{t('game.noScored')}</p>
            ) : (
              <ul className="scored-list">
                {lastScored.slice(-4).map((feature, i) => (
                  <li key={i} className="scored-row">
                    <span className="scored-row__icon">
                      <FeatureIcon type={feature.type} size={18} />
                    </span>
                    <span className="scored-row__body">
                      <strong>
                        {t(`game.feature.${feature.type}`)} · {pointsText(feature.points)}
                      </strong>
                      <small>
                        {feature.seats.length > 0
                          ? feature.seats.map((seat) => seatName(seat)).join(' · ')
                          : t('game.none')}
                        {!feature.complete ? ` · ${t('game.finalScore')}` : ''}
                      </small>
                    </span>
                    <span className={`scored-row__badge${feature.complete ? ' is-complete' : ''}`}>
                      {feature.complete ? '✓' : '◐'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="game__meta">
            <span>
              <span className="seat-dot" style={{ background: theme.color }} /> {t('game.turnOf', { name: currentSeat.name })}
            </span>
            <span>{t('game.tilesLeft', { n: state.bagCount })}</span>
          </div>
        </aside>
      </div>

      {state.status === 'ended' && result && showEnd && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowEnd(false)}>
          <div
            className="modal modal--wide end-modal"
            role="dialog"
            aria-modal="true"
            aria-label={endTitle}
            data-testid="end-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="end-modal__crest" aria-hidden>
              <span className="end-modal__crown">✦</span>
            </div>
            <h2 className="end-modal__title">{endTitle}</h2>
            <p className="muted center">{t('end.reason')}</p>
            <table className="rank-table">
              <thead>
                <tr>
                  <th>{t('game.rank')}</th>
                  <th>{t('game.player')}</th>
                  <th>{t('end.score')}</th>
                  <th>{t('end.completed')}</th>
                  <th>{t('end.meeplesLeft')}</th>
                </tr>
              </thead>
              <tbody>
                {result.ranking.map((row) => (
                  <tr key={row.seat} className={row.rank === 1 ? 'is-winner' : undefined}>
                    <td>{row.rank}</td>
                    <td>
                      <span className="rank-name">
                        <SeatMark seat={row.seat} size={20} />
                        {row.name}
                      </span>
                    </td>
                    <td><strong>{row.score}</strong></td>
                    <td>{row.completed}</td>
                    <td>{row.meeplesLeft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small center">{t('end.finalNote')}</p>
            <p className="muted small center">{t('end.tieBreak')}</p>
            <div className="modal__actions end-modal__actions">
              <Button testId="replay" onClick={onReplay}>{t('end.replay')}</Button>
              <Button variant="primary" testId="rematch" onClick={onRematch}>{t('end.rematch')}</Button>
              <Button variant="ghost" testId="modal-home" onClick={onHome}>{t('end.home')}</Button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'ended' && !showEnd && (
        <button type="button" className="floating-ranking" data-testid="show-ranking" onClick={() => setShowEnd(true)}>
          {t('game.ranking')} →
        </button>
      )}
    </div>
  );
}
