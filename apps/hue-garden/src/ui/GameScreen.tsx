import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GameResult,
  Move,
  MoveScore,
  PlayerView,
  TileId,
} from '../game/types';
import { tileColor, tileShape } from '../game/tiles';
import type { Lang } from '../i18n';
import type { Settings } from '../storage';
import { Board, type StagedPlay } from './Board';
import { BloomMark, Button, Modal, PlayerRail, SeatToken, type T } from './components';
import { colorTheme, shapeName } from './theme';
import { TileFace } from './tiles';

export interface LegalOption {
  move: Move;
  score: MoveScore | null;
}

type Staged =
  | { kind: 'play'; play: StagedPlay }
  | { kind: 'swap'; hand: number[] }
  | { kind: 'pass' };

function multisetOfTiles(tiles: readonly TileId[]): Map<TileId, number> {
  const map = new Map<TileId, number>();
  for (const tile of tiles) map.set(tile, (map.get(tile) ?? 0) + 1);
  return map;
}

function sameMultiset(a: readonly TileId[], b: readonly TileId[]): boolean {
  if (a.length !== b.length) return false;
  const map = multisetOfTiles(a);
  for (const tile of b) {
    const left = map.get(tile) ?? 0;
    if (left <= 0) return false;
    map.set(tile, left - 1);
  }
  return true;
}

function tileText(tile: number, lang: Lang): string {
  const c = colorTheme(tileColor(tile));
  const s = shapeName(tileShape(tile));
  return `${lang === 'zh' ? c.zh : c.en} ${lang === 'zh' ? s.zh : s.en}`;
}

function moveKey(move: Move): string {
  return JSON.stringify(move);
}

export function GameScreen({
  t,
  lang,
  playerView,
  options,
  result,
  settings,
  hint,
  hintReason,
  thinking,
  localSeat,
  canUndo = true,
  canReplay = true,
  canRematch = true,
  lan = null,
  onMove,
  onUndo,
  onHint,
  onHome,
  onRematch,
  onReplay,
  onToast,
}: {
  t: T;
  lang: Lang;
  playerView: PlayerView;
  options: LegalOption[];
  result: GameResult | null;
  settings: Settings;
  hint: Move | null;
  hintReason: string | null;
  thinking: boolean;
  localSeat: number | null;
  canUndo?: boolean;
  canReplay?: boolean;
  canRematch?: boolean;
  lan?: {
    role: 'host' | 'guest';
    code: string;
    connected: number;
    total: number;
    disconnected: boolean;
    onReconnect?: () => void;
  } | null;
  onMove: (move: Move) => void;
  onUndo: () => void;
  onHint: () => void;
  onHome: () => void;
  onRematch: () => void;
  onReplay: () => void;
  onToast: (message: string) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [showEnd, setShowEnd] = useState(true);
  const stagedHint = useRef<Move | null>(null);
  const applying = useRef(false);

  const currentSeat = playerView.config.seats[playerView.current];
  const humanTurn =
    playerView.status === 'playing' && currentSeat?.kind === 'human' && !thinking;
  const hand = playerView.hand ?? [];
  const selectedTiles = selected.map((i) => hand[i]).filter((t) => t !== undefined);

  useEffect(() => {
    setSelected([]);
    setStaged(null);
    stagedHint.current = null;
  }, [playerView.turn, playerView.movesCount]);

  useEffect(() => {
    if (result) setShowEnd(true);
  }, [result]);

  // A hint arrives as a real engine move; stage it, never apply it.
  useEffect(() => {
    if (!hint || !humanTurn) return;
    if (stagedHint.current === hint) return;
    stagedHint.current = hint;
    if (hint.kind === 'play') {
      const option = options.find((o) => moveKey(o.move) === moveKey(hint));
      if (!option || !option.score) return;
      const indices: number[] = [];
      const used = new Set<number>();
      for (const placement of hint.placements) {
        const index = hand.findIndex((tile, i) => tile === placement.tile && !used.has(i));
        if (index >= 0) {
          used.add(index);
          indices.push(index);
        }
      }
      setSelected(indices);
      setStaged({ kind: 'play', play: { move: hint, score: option.score } });
    } else if (hint.kind === 'swap') {
      setSelected([...hint.hand]);
      setStaged({ kind: 'swap', hand: [...hint.hand] });
    } else {
      setSelected([]);
      setStaged({ kind: 'pass' });
    }
  }, [hint, humanTurn, options, hand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        setSelected([]);
        setStaged(null);
      } else if (key === 'enter' && staged && humanTurn) {
        e.preventDefault();
        confirmStaged();
      } else if (key === 'u' && canUndo) {
        onUndo();
      } else if (key === 'h') {
        onHint();
      } else if (key === 's' && humanTurn && selected.length > 0) {
        stageSwap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectedOptions = useMemo(() => {
    if (selectedTiles.length === 0) return [];
    return options.filter((option) => {
      if (option.move.kind !== 'play') return false;
      return sameMultiset(
        option.move.placements.map((p) => p.tile),
        selectedTiles,
      );
    });
  }, [options, selectedTiles]);

  const legalCells = useMemo(() => {
    if (staged || !humanTurn) return [];
    const seen = new Map<string, { x: number; y: number }>();
    for (const option of selectedOptions) {
      if (option.move.kind !== 'play') continue;
      for (const p of option.move.placements) {
        if (!seen.has(`${p.x},${p.y}`)) seen.set(`${p.x},${p.y}`, { x: p.x, y: p.y });
      }
    }
    return [...seen.values()];
  }, [selectedOptions, staged, humanTurn]);

  const toggleTile = (index: number): void => {
    if (!humanTurn) return;
    setStaged(null);
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= 3) {
        onToast(t('error.too-many-tiles'));
        return prev;
      }
      return [...prev, index];
    });
  };

  const stageSwap = (): void => {
    if (!humanTurn) return;
    if (selected.length === 0) {
      onToast(t('error.no-tiles'));
      return;
    }
    if (playerView.bagCount < selected.length) {
      onToast(t('game.swapNeedsBag'));
      return;
    }
    setStaged({ kind: 'swap', hand: [...selected].sort((a, b) => a - b) });
  };

  const onCellClick = (cell: { x: number; y: number }, hasTile: boolean): void => {
    if (!humanTurn) return;
    if (hasTile) {
      onToast(t('error.cell-occupied'));
      return;
    }
    if (selectedTiles.length === 0) {
      onToast(t('game.selectTiles'));
      return;
    }
    const candidates = selectedOptions.filter(
      (option) =>
        option.move.kind === 'play' &&
        option.move.placements.some((p) => p.x === cell.x && p.y === cell.y) &&
        option.score,
    );
    if (candidates.length === 0) {
      onToast(t('game.noLine'));
      return;
    }
    candidates.sort((a, b) => (b.score?.points ?? 0) - (a.score?.points ?? 0));
    const best = candidates[0];
    if (best.move.kind !== 'play' || !best.score) return;
    setStaged({ kind: 'play', play: { move: best.move, score: best.score } });
  };

  const confirmStaged = (): void => {
    if (!staged || !humanTurn || applying.current) return;
    applying.current = true;
    if (staged.kind === 'play') onMove(staged.play.move);
    else if (staged.kind === 'swap') onMove({ kind: 'swap', seat: playerView.current, hand: staged.hand });
    else onMove({ kind: 'pass', seat: playerView.current });
    setSelected([]);
    setStaged(null);
    window.setTimeout(() => {
      applying.current = false;
    }, 350);
  };

  const last = playerView.lastMove;
  const lastScore = playerView.lastScore;
  const lastText = (() => {
    if (!last) return null;
    const name = playerView.config.seats[last.seat]?.name ?? '';
    if (last.kind === 'play') {
      return `${name} · ${last.placements.length} ${lang === 'zh' ? '张' : 'tiles'} · ${lastScore?.points ?? 0} ${t('game.points')}`;
    }
    if (last.kind === 'swap') return `${name} · ${t('game.lastSwap')} ${last.hand.length}`;
    return `${name} · ${t('game.lastPass')}`;
  })();

  const confirmSummary = (() => {
    if (!staged) return null;
    if (staged.kind === 'swap') return t('game.swapStage', { n: staged.hand.length });
    if (staged.kind === 'pass') return t('game.pass');
    const score = staged.play.score;
    return (
      <span>
        <strong>{t('game.pointsPreview', { points: score.points })}</strong>
        {score.lines.length > 1 && (
          <span className="muted"> · {score.lines.length} {lang === 'zh' ? '条线' : 'lines'}</span>
        )}
        {score.bloomCount > 0 && <span className="bloom-pill">{t('game.bloom')}</span>}
      </span>
    );
  })();

  const passAvailable = options.some((o) => o.move.kind === 'pass');

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
          <SeatToken seat={playerView.current} />
          <span>
            <strong>
              {playerView.status === 'ended'
                ? t('game.ended')
                : t('game.turnOf', { name: currentSeat?.name ?? '' })}
            </strong>
            <small>
              {t('game.turn', { n: playerView.turn })}
              {thinking ? ` · ${t('game.thinking')}` : humanTurn ? ` · ${t('game.yourTurn')}` : ''}
            </small>
          </span>
        </div>
        <div className="game__head-meta">
          <span className="pill">{t('game.bag')}: {playerView.bagCount}</span>
        </div>
      </header>

      <div className="game__grid">
        <main className="game__board">
          <Board
            board={playerView.board}
            legalCells={legalCells}
            staged={staged?.kind === 'play' ? staged.play : null}
            hint={hint?.kind === 'play' ? hint : null}
            lastMove={playerView.lastMove}
            interactive={humanTurn}
            onCellClick={onCellClick}
            t={t}
          />
          <div className="game__hintline">
            {playerView.status !== 'playing'
              ? t('game.ended')
              : !humanTurn
                ? thinking
                  ? t('game.thinking')
                  : t('game.turnOf', { name: currentSeat?.name ?? '' })
                : staged
                  ? confirmSummary
                  : selectedTiles.length > 0
                    ? selectedOptions.length > 0
                      ? t('game.legalHint')
                      : t('game.noLine')
                    : t('game.selectHint')}
          </div>
        </main>

        <aside className="game__panel">
          <PlayerRail playerView={playerView} t={t} localSeat={localSeat} />

          <section className="rack-panel" aria-label={t('game.hand')}>
            <header className="rack-panel__head">
              <span>{t('game.hand')}</span>
              <span className="muted">
                {t('game.bag')}: {playerView.bagCount}
              </span>
            </header>
            <div className="rack">
              {hand.length === 0 && <span className="muted">{t('game.passHint')}</span>}
              {hand.map((tile, i) => {
                const isSelected = selected.includes(i);
                return (
                  <TileFace
                    key={`${i}-${tile}`}
                    tile={tile}
                    size={58}
                    selected={isSelected}
                    dimmed={selected.length >= 3 && !isSelected}
                    onClick={() => toggleTile(i)}
                    ariaLabel={`${tileText(tile, lang)}${isSelected ? ` · ${t('game.selected')}` : ''}`}
                    testId={`rack-${i}`}
                  />
                );
              })}
            </div>
            <div className="rack-hint">
              {!humanTurn
                ? t('game.thinking')
                : selectedTiles.length === 0
                  ? t('game.selectTiles')
                  : t('game.rackHint')}
            </div>
          </section>

          {staged?.kind === 'play' && (
            <section className="score-preview" aria-live="polite">
              <div className="score-preview__head">
                <span>{t('game.stage')}</span>
                <strong>{t('game.pointsPreview', { points: staged.play.score.points })}</strong>
              </div>
              <ul className="score-lines">
                {staged.play.score.lines.map((line, i) => (
                  <li key={i}>
                    <span>
                      {t('game.line', { n: i + 1 })} · {line.length}{' '}
                      {lang === 'zh' ? '张' : 'tiles'}
                    </span>
                    <strong>{line.points}</strong>
                    {line.bloom && <span className="bloom-pill">{t('game.bloom')}</span>}
                  </li>
                ))}
              </ul>
              {staged.play.score.lines.some((l) => l.bloom) && (
                <div className="score-preview__bloom">
                  <BloomMark count={staged.play.score.bloomCount} />
                  {t('game.previewBloom', { points: staged.play.score.points })}
                </div>
              )}
            </section>
          )}

          {hintReason && humanTurn && <div className="hint-box">{hintReason}</div>}
          {lastText && (
            <div className="game__last">
              <span className="muted">{t('game.lastMove')}</span>
              <span>{lastText}</span>
            </div>
          )}

          <div className="game__actions">
            <Button
              testId="undo"
              onClick={onUndo}
              disabled={!canUndo || playerView.movesCount === 0 || thinking || playerView.status !== 'playing'}
            >
              {t('game.undo')} <kbd>U</kbd>
            </Button>
            <Button testId="hint" onClick={onHint} disabled={!humanTurn || thinking}>
              {t('game.hint')} <kbd>H</kbd>
            </Button>
            <Button
              testId="swap"
              onClick={stageSwap}
              disabled={!humanTurn || selected.length === 0 || playerView.bagCount < selected.length}
            >
              {selected.length > 0 ? t('game.swapStage', { n: selected.length }) : t('game.swap')}{' '}
              <kbd>S</kbd>
            </Button>
            {passAvailable && (
              <Button
                testId="pass"
                variant="primary"
                onClick={() => {
                  setSelected([]);
                  setStaged({ kind: 'pass' });
                }}
                disabled={!humanTurn}
              >
                {t('game.pass')} <kbd>P</kbd>
              </Button>
            )}
          </div>

          {selectedTiles.length > 0 && selectedOptions.length === 0 && !staged && (
            <div className="hint-box hint-box--warn">{t('game.noLine')}</div>
          )}

          {playerView.status === 'ended' && (
            <Button testId="ranking" variant="primary" onClick={() => setShowEnd(true)}>
              {t('game.ranking')}
            </Button>
          )}

          {lan && (
            <div
              className={`lan-inline${lan.disconnected ? ' is-warn' : ''}`}
              data-testid="lan-game-status"
            >
              <span>{t('lan.gameLabel', { code: lan.code })}</span>
              <span>
                {lan.role === 'host'
                  ? t('lan.guestCount', { n: lan.connected })
                  : t('lan.yourSeat', { seat: (playerView.seat ?? 0) + 1 })}
              </span>
              {lan.role === 'guest' && lan.disconnected && lan.onReconnect && (
                <Button testId="lan-reconnect" onClick={lan.onReconnect}>
                  {t('lan.reconnectShort')}
                </Button>
              )}
            </div>
          )}

          <div className="game__meta">
            <span>{t('game.blooms')}: {playerView.blooms[playerView.current]}</span>
            <span>
              {selectedTiles.length > 0
                ? t('game.legalCount', { n: legalCells.length })
                : t('game.rackHint')}
            </span>
          </div>
        </aside>
      </div>

      {staged && humanTurn && (
        <div className="confirm-bar" role="region" aria-label={t('game.stage')}>
          <div className="confirm-bar__summary">{confirmSummary}</div>
          <div className="confirm-bar__actions">
            <Button
              testId="cancel-move"
              onClick={() => {
                setStaged(null);
                setSelected([]);
              }}
            >
              {t('game.cancel')} <kbd>Esc</kbd>
            </Button>
            <Button testId="confirm-move" variant="primary" onClick={confirmStaged}>
              {staged.kind === 'swap' ? t('game.swapConfirm') : staged.kind === 'pass' ? t('game.pass') : t('game.confirm')}{' '}
              <kbd>Enter</kbd>
            </Button>
          </div>
        </div>
      )}

      {result && showEnd && (
        <Modal
          title={
            result.winners.length === 1
              ? t('game.winner', { name: result.ranking.find((r) => r.seat === result.winners[0])?.name ?? '' })
              : t('game.shared', {
                  names: result.winners
                    .map((seat) => result.ranking.find((r) => r.seat === seat)?.name ?? '')
                    .join(lang === 'zh' ? '、' : ' & '),
                })
          }
          onClose={() => setShowEnd(false)}
          closeLabel={t('common.close')}
          wide
          actions={
            <>
              {canReplay && (
                <Button testId="replay" onClick={onReplay}>
                  {t('end.replay')}
                </Button>
              )}
              {canRematch && (
                <Button testId="rematch" variant="primary" onClick={onRematch}>
                  {t('end.rematch')}
                </Button>
              )}
              <Button testId="modal-home" variant={canRematch ? 'ghost' : 'primary'} onClick={onHome}>
                {t('end.home')}
              </Button>
            </>
          }
        >
          <p className="muted">
            {result.reason === 'cleared'
              ? t('game.reasonCleared', {
                  name:
                    playerView.config.seats[playerView.current]?.name ??
                    result.ranking.find((r) => r.seat === result.winners[0])?.name ??
                    '',
                })
              : result.reason === 'blocked'
                ? t('game.reasonBlocked')
                : t('game.reasonCap')}
          </p>
          {result.reason === 'cleared' && (
            <p className="bonus-note">{t('end.bonus')}</p>
          )}
          <table className="rank-table">
            <thead>
              <tr>
                <th>{t('game.rank')}</th>
                <th>{t('game.player')}</th>
                <th>{t('game.score')}</th>
                <th>{t('game.bloomCount')}</th>
                <th>{t('game.handLeft')}</th>
              </tr>
            </thead>
            <tbody>
              {result.ranking.map((row) => (
                <tr key={row.seat} className={result.winners.includes(row.seat) ? 'is-winner' : undefined}>
                  <td>{row.rank}</td>
                  <td>
                    <SeatToken seat={row.seat} />
                    {row.name}
                  </td>
                  <td>{row.points}</td>
                  <td>{row.blooms}</td>
                  <td>{row.handCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
