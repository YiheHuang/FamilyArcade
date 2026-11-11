import { DIFFICULTIES } from '../ai/types';
import { langMode, t, cycleLangMode, playerName, difficultyLabel } from '../i18n';
import { canContinue, loadInProgress, type SavedGame } from '../savegame';
import { cycleSoundMode, soundMode } from '../sound';
import type { PlayerCount, VariantId } from '../game/types';
import { button, el } from './dom';

export interface Screen {
  root: HTMLElement;
  destroy?(): void;
}

export interface HotseatOpts {
  variant: VariantId;
  players: PlayerCount;
  names: string[];
}

export interface AiOpts {
  variant: VariantId;
  players: PlayerCount;
  difficulty: 'easy' | 'normal' | 'hard';
  humanFirst: boolean;
}

export interface AppCtx {
  show(screen: Screen): void;
  home(): Screen;
  toast(msg: string): void;
  startHotseat(opts: HotseatOpts): void;
  startAi(opts: AiOpts): void;
  openLanSetup(): void;
  openStats(): void;
  openGuide(): void;
  /** continue (or review) the last unfinished game */
  resumeGame(save: SavedGame): void;
  discardResume(): void;
}

// ---------------------------------------------------------------- components

interface Segmented<T> {
  root: HTMLElement;
  get(): T;
}

function segmented<T extends string | number>(
  options: Array<{ value: T; label: string }>,
  initial: T,
  onChange?: (v: T) => void,
): Segmented<T> {
  const root = el('div', 'seg');
  let value = initial;
  const buttons: Array<{ btn: HTMLButtonElement; v: T }> = [];
  for (const opt of options) {
    const btn = button('seg-item', opt.label, () => {
      value = opt.value;
      for (const b of buttons) b.btn.classList.toggle('is-on', b.v === value);
      onChange?.(value);
    });
    if (opt.value === initial) btn.classList.add('is-on');
    buttons.push({ btn, v: opt.value });
    root.appendChild(btn);
  }
  return { root, get: () => value };
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = el('div', 'field');
  if (label) wrap.appendChild(el('label', 'field-label', label));
  const body = el('div', 'field-body');
  body.appendChild(control);
  if (hint) {
    const hintEl = el('div', 'field-hint', hint);
    body.appendChild(hintEl);
  }
  wrap.appendChild(body);
  return wrap;
}

function topbar(title: string, onBack: () => void): HTMLElement {
  const bar = el('header', 'topbar');
  const back = button('btn ghost', t('setup.back'), onBack);
  const h = el('h2', 'topbar-title', title);
  const spacer = el('div', 'spacer');
  bar.append(back, spacer, h, el('div', 'spacer'));
  return bar;
}

/** "刚刚 / 5 分钟前 / 2 小时前 / 3 天前" */
function timeAgo(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return t('resume.ago.now');
  if (mins < 60) return t('resume.ago.min', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('resume.ago.hour', { n: hours });
  return t('resume.ago.day', { n: Math.floor(hours / 24) });
}

// -------------------------------------------------------------------- screens

export function renderHome(ctx: AppCtx): Screen {
  const root = el('div', 'screen home');
  const hero = el('div', 'home-hero');
  hero.append(el('h1', 'home-title', 'Blokus'), el('p', 'home-sub', t('home.subtitle')));

  const cards = el('div', 'mode-cards');
  const modes: Array<{ title: string; desc: string; go: () => void }> = [
    {
      title: t('home.solo.title'),
      desc: t('home.solo.desc'),
      go: () => ctx.show(renderSetupAi(ctx)),
    },
    {
      title: t('home.hotseat.title'),
      desc: t('home.hotseat.desc'),
      go: () => ctx.show(renderSetupHotseat(ctx)),
    },
    {
      title: t('home.lan.title'),
      desc: t('home.lan.desc'),
      go: () => ctx.openLanSetup(),
    },
  ];
  for (const m of modes) {
    const card = button('mode-card', '', m.go);
    card.append(el('span', 'mode-title', m.title), el('span', 'mode-desc', m.desc));
    cards.appendChild(card);
  }

  // footer: version + stats + help + language toggle + sound
  const footer = el('div', 'home-footer');
  footer.appendChild(el('span', 'home-version', `v${__APP_VERSION__}`));
  footer.appendChild(button('btn ghost tiny', t('home.stats'), () => ctx.openStats()));
  footer.appendChild(button('btn ghost tiny', t('home.help'), () => ctx.openGuide()));
  const mode = langMode();
  const langLabel =
    mode === 'auto' ? t('home.lang.auto') : mode === 'zh' ? t('home.lang.zh') : t('home.lang.en');
  footer.appendChild(
    button('btn ghost tiny', langLabel, () => {
      cycleLangMode();
      location.reload();
    }),
  );
  const soundBtn = button(
    'btn ghost tiny',
    t('sound.label', { state: t(`sound.${soundMode()}` as 'sound.normal') }),
    () => {
      const next = cycleSoundMode();
      soundBtn.textContent = t('sound.label', { state: t(`sound.${next}` as 'sound.normal') });
    },
  );
  footer.appendChild(soundBtn);

  // resume banner: shown when a game was interrupted (crash, reload, network)
  let resumeCard: HTMLElement | null = null;
  const saved = loadInProgress();
  if (saved) {
    const card = el('div', 'resume-card');
    const text = el('div', 'resume-text');
    const canGo = canContinue(saved);
    text.append(
      el('span', 'resume-title', t(canGo ? 'resume.title' : 'resume.lanTitle')),
      el('span', 'resume-sub', t('resume.meta', {
        mode: t(`stats.mode.${saved.mode}` as 'stats.mode.ai'),
        n: saved.history.length,
        ago: timeAgo(saved.savedAt),
      })),
    );
    card.append(
      text,
      el('div', 'spacer'),
      button('btn', t(canGo ? 'resume.continue' : 'resume.review'), () => ctx.resumeGame(saved)),
      button('btn ghost tiny', t('resume.discard'), () => ctx.discardResume()),
    );
    resumeCard = card;
  }

  root.append(hero, cards, footer);
  if (resumeCard) root.insertBefore(resumeCard, cards);
  return { root };
}

export function renderSetupAi(ctx: AppCtx): Screen {
  const root = el('div', 'screen setup');

  let variant: VariantId = 'duo';
  let players: PlayerCount = 2;
  let difficulty: 'easy' | 'normal' | 'hard' = 'normal';
  let humanFirst = true;

  const body = el('div', 'setup-body');

  const variantSeg = segmented<VariantId>(
    [
      { value: 'duo', label: t('setup.variant.duo') },
      { value: 'standard', label: t('setup.variant.standard') },
    ],
    variant,
    (v) => {
      variant = v;
      playersField.style.display = v === 'standard' ? '' : 'none';
    },
  );
  body.appendChild(field(t('setup.board'), variantSeg.root));

  const playersSeg = segmented<PlayerCount>(
    [
      { value: 2, label: t('setup.count', { n: 2 }) },
      { value: 3, label: t('setup.count', { n: 3 }) },
      { value: 4, label: t('setup.count', { n: 4 }) },
    ],
    players,
    (v) => {
      players = v;
    },
  );
  const playersField = field(t('setup.players'), playersSeg.root, t('setup.players.hint'));
  playersField.style.display = 'none';
  body.appendChild(playersField);

  const diffSeg = segmented<'easy' | 'normal' | 'hard'>(
    DIFFICULTIES.map((d) => ({ value: d, label: difficultyLabel(d) })),
    difficulty,
    (v) => {
      difficulty = v;
      diffHint.textContent = t(`difficulty.${v}.hint`);
    },
  );
  const diffHint = el('div', 'field-hint', t(`difficulty.${difficulty}.hint`));
  const diffBody = el('div', 'field-body');
  diffBody.append(diffSeg.root, diffHint);
  const diffField = el('div', 'field');
  diffField.append(el('label', 'field-label', t('setup.aiLevel')), diffBody);
  body.appendChild(diffField);

  const firstSeg = segmented<number>(
    [
      { value: 1, label: t('setup.firstMove.human') },
      { value: 0, label: t('setup.firstMove.ai') },
    ],
    1,
    (v) => {
      humanFirst = v === 1;
    },
  );
  body.appendChild(field(t('setup.firstMove'), firstSeg.root));

  const start = button('btn primary big', t('setup.start'), () => {
    ctx.startAi({ variant, players, difficulty, humanFirst });
  });
  const actions = el('div', 'setup-actions');
  actions.appendChild(start);

  root.append(topbar(t('setup.soloTitle'), () => ctx.show(renderHome(ctx))), body, actions);
  return { root };
}

export function renderSetupHotseat(ctx: AppCtx): Screen {
  const root = el('div', 'screen setup');

  let variant: VariantId = 'duo';
  let players: PlayerCount = 2;
  const names = [1, 2, 3, 4].map((n) => playerName(n));

  const body = el('div', 'setup-body');

  const variantSeg = segmented<VariantId>(
    [
      { value: 'duo', label: t('setup.variant.duo') },
      { value: 'standard', label: t('setup.variant.standard') },
    ],
    variant,
    (v) => {
      variant = v;
      playersField.style.display = v === 'standard' ? '' : 'none';
      playersSeg.root.style.display = v === 'standard' ? '' : 'none';
      if (v !== 'standard') players = 2;
      if (v !== 'standard') setActive(2);
      renderNames();
    },
  );
  body.appendChild(field(t('setup.board'), variantSeg.root));

  const playersSeg = segmented<PlayerCount>(
    [
      { value: 2, label: t('setup.count', { n: 2 }) },
      { value: 3, label: t('setup.count', { n: 3 }) },
      { value: 4, label: t('setup.count', { n: 4 }) },
    ],
    players,
    (v) => {
      players = v;
      renderNames();
    },
  );
  function setActive(v: PlayerCount): void {
    players = v;
    for (const b of playersSeg.root.children) {
      const elBtn = b as HTMLButtonElement;
      elBtn.classList.toggle('is-on', elBtn.textContent === t('setup.count', { n: v }));
    }
  }
  const playersField = field(t('setup.players'), playersSeg.root);
  playersField.style.display = 'none';
  playersSeg.root.style.display = 'none';
  body.appendChild(playersField);

  const namesWrap = el('div', 'names');
  body.appendChild(namesWrap);
  function renderNames(): void {
    namesWrap.replaceChildren();
    for (let i = 0; i < players; i++) {
      const row = el('div', 'name-row');
      const dot = el('span', 'dot');
      dot.style.background = `var(--p${i + 1})`;
      const input = el('input', 'input');
      input.type = 'text';
      input.value = names[i] ?? playerName(i + 1);
      input.maxLength = 12;
      input.addEventListener('input', () => {
        names[i] = input.value.trim() || playerName(i + 1);
      });
      row.append(dot, input);
      namesWrap.appendChild(row);
    }
  }
  renderNames();

  const start = button('btn primary big', t('setup.start'), () => {
    ctx.startHotseat({ variant, players, names: names.slice(0, players) });
  });
  const actions = el('div', 'setup-actions');
  actions.appendChild(start);

  root.append(topbar(t('setup.hotseatTitle'), () => ctx.show(renderHome(ctx))), body, actions);
  return { root };
}
