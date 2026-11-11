import { useEffect, useMemo, useState } from 'react';
import { apply, replay, view } from '../game/engine';
import type { GameConfig, Move } from '../game/types';
import type { Lang } from '../i18n';
import { Board } from './Board';
import { Button, PlayerRail, type T } from './components';

function moveLabel(move: Move, lang: Lang): string {
  if (move.kind === 'swap') return `${lang === 'zh' ? '换' : 'Swap'} ${move.hand.length}`;
  if (move.kind === 'pass') return lang === 'zh' ? '跳过' : 'Pass';
  return move.placements
    .map((p) => `(${p.x},${p.y})`)
    .slice(0, 3)
    .join(' ');
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
    try {
      let state = replay(config, []);
      const out = [state];
      for (const move of moves) {
        const response = apply(state, move);
        if (!response.ok) break;
        state = response.state;
        out.push(state);
      }
      return out;
    } catch {
      return [];
    }
  }, [config, moves]);

  const [index, setIndex] = useState(states.length - 1);
  const [playing, setPlaying] = useState(false);
  const state = states[Math.min(index, states.length - 1)];
  const playerView = state ? view(state, null) : null;

  useEffect(() => {
    if (!playing) return;
    if (index >= moves.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex((i) => Math.min(i + 1, moves.length)), 700);
    return () => window.clearTimeout(timer);
  }, [playing, index, moves.length]);

  if (!state || !playerView) {
    return (
      <div className="replay screen">
        <header className="subhead">
          <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
            ← {t('replay.back')}
          </button>
          <div>
            <h1>{t('replay.title')}</h1>
          </div>
          <span />
        </header>
        <div className="empty-state">{t('replay.noMoves')}</div>
      </div>
    );
  }

  const current = index > 0 ? moves[index - 1] : null;
  const scoring = current && state.lastScore ? state.lastScore.points : 0;

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
          <Board
            board={playerView.board}
            lastMove={playerView.lastMove}
            interactive={false}
            t={t}
          />
          <div className="replay__controls">
            <Button onClick={() => setIndex(0)} disabled={index === 0} ariaLabel={t('replay.prev')}>
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
            <Button onClick={() => setIndex(moves.length)} disabled={index >= moves.length} ariaLabel={t('replay.next')}>
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
          <PlayerRail playerView={playerView} t={t} />
          {playerView.status === 'ended' && (
            <div className="result-card">
              <strong>
                {playerView.winners.length === 1
                  ? t('replay.winner', {
                      name: playerView.config.seats[playerView.winners[0]]?.name ?? '',
                    })
                  : t('replay.shared')}
              </strong>
            </div>
          )}
          {current && (
            <div className="game__last">
              <span className="muted">{t('replay.move')} {index}</span>
              <span>
                {playerView.config.seats[current.seat]?.name} · {moveLabel(current, lang)}
                {current.kind === 'play' && ` · ${scoring} ${t('game.points')}`}
              </span>
            </div>
          )}
          <ol className="move-list">
            {moves.map((move, i) => {
              const nextState = states[i + 1];
              const pts = nextState?.lastScore?.points ?? 0;
              return (
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
                    <span>{playerView.config.seats[move.seat]?.name}</span>
                    <span className="move-list__detail">
                      {move.kind === 'play'
                        ? t('replay.playLine', { n: move.placements.length, points: pts })
                        : move.kind === 'swap'
                          ? t('replay.swap', { n: move.hand.length })
                          : t('replay.pass')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
