import { useEffect, useMemo, useState } from 'react';
import { apply, setup } from '../game/engine';
import type { GameConfig, Move } from '../game/types';
import { HOLES } from '../game/board';
import type { Lang } from '../i18n';
import { Board } from './Board';
import { Button, PlayerRail, type T } from './components';
import { seatTheme } from './theme';

function moveLabel(move: Move, lang: Lang): string {
  if (move.kind === 'pass') return lang === 'zh' ? '跳过' : 'Pass';
  const from = HOLES[move.from];
  const to = HOLES[move.to];
  return `R${from.row + 1}C${from.col + 1} → R${to.row + 1}C${to.col + 1}`;
}

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
    let state = setup(config);
    const out = [state];
    for (const move of moves) {
      const res = apply(state, move);
      if (!res.ok) break;
      state = res.state;
      out.push(state);
    }
    return out;
  }, [config, moves]);

  const [index, setIndex] = useState(moves.length);
  const [playing, setPlaying] = useState(false);
  const state = states[Math.min(index, states.length - 1)];

  useEffect(() => {
    if (!playing) return;
    if (index >= moves.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex((i) => Math.min(i + 1, moves.length)), 650);
    return () => window.clearTimeout(timer);
  }, [playing, index, moves.length]);

  const current = index > 0 ? moves[index - 1] : null;

  return (
    <div className="replay screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('replay.back')}
        </button>
        <div>
          <h1>{t('replay.title')}</h1>
          <p className="muted">
            {t('replay.step', { n: index })} {t('replay.of', { n: moves.length })}
          </p>
        </div>
        <span />
      </header>

      <div className="replay__grid">
        <main className="replay__board">
          <Board state={state} interactive={false} />
          <div className="replay__controls">
            <Button onClick={() => setIndex(0)} disabled={index === 0}>
              ⏮
            </Button>
            <Button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              {t('replay.prev')}
            </Button>
            <Button variant="primary" onClick={() => setPlaying((p) => !p)} disabled={moves.length === 0}>
              {playing ? t('replay.pause') : t('replay.play')}
            </Button>
            <Button onClick={() => setIndex((i) => Math.min(moves.length, i + 1))} disabled={index >= moves.length}>
              {t('replay.next')}
            </Button>
            <Button onClick={() => setIndex(moves.length)} disabled={index >= moves.length}>
              ⏭
            </Button>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={moves.length}
            value={index}
            aria-label={t('replay.step', { n: index })}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
        </main>

        <aside className="replay__panel">
          <PlayerRail state={state} t={t} />
          {state.status === 'ended' && (
            <div className="result-card">
              <strong>
                {state.winner !== null
                  ? t('replay.winner', { name: state.config.seats[state.winner].name })
                  : t('replay.stalemate')}
              </strong>
            </div>
          )}
          {current && (
            <div className="game__last">
              <span className="muted">{t('replay.move')} {index}</span>
              <span>
                {state.config.seats[current.seat].name} · {moveLabel(current, lang)}
              </span>
            </div>
          )}
          <ol className="move-list">
            {moves.map((move, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`move-list__item${i + 1 === index ? ' is-active' : ''}`}
                  onClick={() => {
                    setPlaying(false);
                    setIndex(i + 1);
                  }}
                >
                  <span className="move-list__n">{i + 1}</span>
                  <span className="swatch" style={{ background: seatTheme(move.seat).color }} />
                  <span>{moveLabel(move, lang)}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
