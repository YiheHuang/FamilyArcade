import { useEffect, useMemo, useState } from 'react';
import { apply, setup } from '../game/engine';
import { tileName } from '../game/tiles';
import type { GameConfig, GameState, GameView, Move } from '../game/types';
import type { Lang } from '../i18n';
import { Board } from './Board';
import { Button, SeatMark, type T } from './components';

export function ReplayScreen({
  t,
  lang,
  config,
  moves,
  onBack,
}: {
  t: T;
  lang: Lang;
  config: GameConfig;
  moves: Move[];
  onBack: () => void;
}) {
  const states = useMemo(() => {
    const list: GameState[] = [setup(config)];
    let current = list[0];
    for (const move of moves) {
      const out = apply(current, move);
      if (!out.ok) break;
      list.push(out.state);
      current = out.state;
    }
    return list;
  }, [config, moves]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const max = states.length - 1;
  const state: GameState = states[Math.min(step, max)];
  const view: GameView = useMemo(() => {
    const { bag, ...rest } = state;
    return { ...rest, bagCount: bag.length };
  }, [state]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((prev) => {
        if (prev >= max) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [playing, max]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStep((prev) => Math.min(max, prev + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStep((prev) => Math.max(0, prev - 1));
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [max, onBack]);

  const move = step > 0 ? moves[step - 1] : null;
  const placed = move && move.kind === 'place'
    ? view.tiles.find((tile) => tile.x === move.x && tile.y === move.y)
    : null;
  const lastPlaced = move && move.kind === 'place' ? { x: move.x, y: move.y } : null;
  const lastScored = view.lastScored;

  return (
    <div className="replay screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('replay.back')}
        </button>
        <div>
          <h1>{t('replay.title')}</h1>
          <p className="muted">
            {t('replay.step', { n: step })} {t('replay.of', { n: moves.length })}
          </p>
        </div>
        <span />
      </header>

      <div className="replay__grid">
        <main className="replay__board">
          <Board
            tiles={view.tiles}
            highlight={lastScored.flatMap((feature) => feature.tiles)}
            lastPlaced={lastPlaced}
            interactive={false}
            fitKey="replay"
            ariaLabel={t('replay.title')}
          />
          <div className="replay__timeline">
            <input
              type="range"
              min={0}
              max={max}
              value={Math.min(step, max)}
              aria-label={t('replay.step', { n: step })}
              onChange={(event) => setStep(Number(event.target.value))}
            />
            <div className="replay__buttons">
              <Button testId="replay-prev" onClick={() => setStep((prev) => Math.max(0, prev - 1))} disabled={step <= 0}>
                ← {t('replay.prev')}
              </Button>
              <Button variant="primary" onClick={() => setPlaying((prev) => !prev)} disabled={max === 0}>
                {playing ? t('replay.pause') : t('replay.play')}
              </Button>
              <Button testId="replay-next" onClick={() => setStep((prev) => Math.min(max, prev + 1))} disabled={step >= max}>
                {t('replay.next')} →
              </Button>
            </div>
            <p className="muted small center">{t('replay.keyboard')}</p>
          </div>
        </main>

        <aside className="replay__panel">
          <section className="panel">
            <p className="eyebrow">{t('replay.move')}</p>
            {move ? (
              <div className="replay__move">
                <SeatMark seat={move.seat} size={26} />
                <div>
                  <strong>
                    {move.kind === 'discard'
                      ? t('replay.discard', {
                          name: view.config.seats[move.seat]?.name ?? '',
                          tile: placed ? tileName(placed.type, lang) : '—',
                        })
                      : t('replay.placed', {
                          name: view.config.seats[move.seat]?.name ?? '',
                          tile: placed ? tileName(placed.type, lang) : '—',
                        })}
                  </strong>
                  <small className="muted">
                    {move.kind === 'place' ? `${move.x}, ${move.y} · ${move.rot * 90}°` : ''}
                    {move.meeple != null ? ` · ${t('replay.meeple')}` : ''}
                  </small>
                </div>
              </div>
            ) : (
              <p className="muted">{t('replay.start')}</p>
            )}
          </section>

          <section className="panel">
            <p className="eyebrow">{t('replay.scores')}</p>
            <ul className="replay-scores">
              {view.config.seats.map((seat, i) => (
                <li key={i}>
                  <SeatMark seat={i} size={20} />
                  <span>{seat.name}</span>
                  <strong>{view.scores[i] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </section>

          {view.status === 'ended' && (
            <section className="panel replay__result">
              <p className="eyebrow">{t('replay.result')}</p>
              <p>
                {(() => {
                  const best = Math.max(...view.scores);
                  const winners = view.config.seats
                    .map((seat, i) => ({ seat, i }))
                    .filter((row) => view.scores[row.i] === best);
                  return winners.length > 1
                    ? `${t('replay.shared')}: ${winners.map((row) => row.seat.name).join(' · ')}`
                    : t('replay.winner', { name: winners[0]?.seat.name ?? '' });
                })()}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
