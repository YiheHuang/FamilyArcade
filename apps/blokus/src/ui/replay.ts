import { Game } from '../game/engine';
import { t } from '../i18n';
import type { GameRecord } from '../records';
import { BoardView } from './board';
import { button, el } from './dom';
import type { AppCtx, Screen } from './screens';
import { PALETTE } from './theme';

/** step through a finished game: the engine replays its history exactly */
export function renderReplay(ctx: AppCtx, rec: GameRecord, onBack: () => void): Screen {
  const root = el('div', 'screen replay');

  const topbar = el('header', 'topbar');
  topbar.append(
    button('btn ghost', t('setup.back'), onBack),
    el('div', 'spacer'),
    el('h2', 'topbar-title', t('replay.title')),
    el('div', 'spacer'),
  );

  const boardWrap = el('div', 'board-wrap');
  const view = new BoardView();
  boardWrap.appendChild(view.canvas);

  const info = el('div', 'replay-info');
  const moveLabel = el('div', 'rp-move');
  const stepLabel = el('div', 'rp-step');
  const scoresRow = el('div', 'rp-scores');
  info.append(moveLabel, stepLabel, scoresRow);

  const total = rec.history.length;
  let step = total;
  let playing = false;
  let timer: number | null = null;

  // controls
  const btnFirst = button('btn small rp-first', '⏮', () => setStep(0));
  const btnPrev = button('btn small rp-prev', '‹', () => setStep(step - 1));
  const btnPlay = button('btn small rp-play', '▶', () => togglePlay());
  const btnNext = button('btn small rp-next', '›', () => setStep(step + 1));
  const btnLast = button('btn small rp-last', '⏭', () => setStep(total));
  const slider = el('input', 'rp-slider') as HTMLInputElement;
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.value = String(total);
  slider.addEventListener('input', () => {
    stopPlay();
    setStep(Number.parseInt(slider.value, 10) || 0);
  });

  const bar = el('div', 'replay-bar');
  bar.append(btnFirst, btnPrev, btnPlay, btnNext, btnLast, slider);

  const body = el('div', 'replay-body');
  body.append(boardWrap, info);

  root.append(topbar, body, bar);

  const observer = new ResizeObserver(() => draw());
  observer.observe(boardWrap);

  function gameAt(k: number): Game {
    const g = new Game(rec.config);
    for (let i = 0; i < k; i++) {
      if (!g.tryApply(rec.history[i])) break;
    }
    return g;
  }

  function setStep(k: number): void {
    step = Math.max(0, Math.min(total, k));
    slider.value = String(step);
    if (playing && step >= total) stopPlay();
    draw();
  }

  function togglePlay(): void {
    if (playing) {
      stopPlay();
      return;
    }
    if (step >= total) setStep(0);
    playing = true;
    btnPlay.textContent = '❚❚';
    timer = window.setInterval(() => {
      if (step >= total) {
        stopPlay();
        return;
      }
      setStep(step + 1);
    }, 800);
  }

  function stopPlay(): void {
    playing = false;
    btnPlay.textContent = '▶';
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function draw(): void {
    const g = gameAt(step);
    const avail = Math.min(boardWrap.clientWidth, boardWrap.clientHeight);
    if (avail > 0) view.layout(g.size, avail - 12);
    view.draw({
      game: g,
      anchors: null,
      ghost: null,
      hint: null,
      ring: null,
      remote: null,
      celebrate: 0,
    });

    // whose move is being shown
    if (step === 0) {
      moveLabel.textContent = '';
    } else {
      const a = rec.history[step - 1];
      const name = rec.seats[a.p] ?? t('result.player', { n: a.p + 1 });
      moveLabel.textContent = t(a.kind === 'pass' ? 'replay.pass' : 'replay.move', { name });
    }
    stepLabel.textContent = t('replay.step', { n: step, total });
    btnFirst.disabled = step === 0;
    btnPrev.disabled = step === 0;
    btnNext.disabled = step === total;
    btnLast.disabled = step === total;

    // running scores at this step
    scoresRow.replaceChildren();
    const scores = g.scores();
    rec.seats.forEach((name, i) => {
      const chip = el('span', 'rp-score');
      const dot = el('span', 'dot');
      dot.style.background = PALETTE[i % PALETTE.length];
      const label = el('span', '', `${name} ${scores[i]?.total ?? 0}`);
      chip.append(dot, label);
      scoresRow.appendChild(chip);
    });
  }

  draw();
  return {
    root,
    destroy: () => {
      stopPlay();
      observer.disconnect();
    },
  };
}
