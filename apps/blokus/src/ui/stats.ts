import { t } from '../i18n';
import {
  clearRecords,
  exportAll,
  favoriteSeat,
  loadRecords,
  loadStats,
  totalGames,
  type GameMode,
  type GameRecord,
} from '../records';
import { button, copyText, el, toast } from './dom';
import { renderReplay } from './replay';
import type { AppCtx, Screen } from './screens';
import { PALETTE } from './theme';

function modeLabel(mode: GameMode): string {
  return t(`stats.mode.${mode}` as 'stats.mode.ai');
}

export function renderStats(ctx: AppCtx): Screen {
  const root = el('div', 'screen setup');
  const topbar = el('header', 'topbar');
  topbar.append(
    button('btn ghost', t('setup.back'), () => ctx.show(ctx.home())),
    el('div', 'spacer'),
    el('h2', 'topbar-title', t('stats.title')),
    el('div', 'spacer'),
  );

  const body = el('div', 'setup-body');
  body.appendChild(renderSummary());
  body.appendChild(renderPlayers());
  body.appendChild(renderRecent());

  const clear = button('btn small danger', t('stats.clear'), () => {
    if (window.confirm(t('stats.clearConfirm'))) {
      clearRecords();
      ctx.show(renderStats(ctx));
    }
  });
  const exportBtn = button('btn small', t('stats.export'), () => {
    void copyText(exportAll()).then((ok) =>
      toast(ok ? t('stats.exported') : t('stats.exportFailed')),
    );
  });
  const actions = el('div', 'setup-actions');
  actions.append(exportBtn, clear);

  root.append(topbar, body, actions);
  return { root };

  // ---------------------------------------------------------------- sections

  function renderSummary(): HTMLElement {
    const stats = loadStats();
    const wrap = el('div', 'stats-summary');
    wrap.appendChild(el('div', 'stats-total', t('stats.total', { n: totalGames(stats) })));
    wrap.appendChild(
      el(
        'div',
        'field-hint',
        t('stats.modes', {
          ai: stats.modes.ai,
          hotseat: stats.modes.hotseat,
          lan: stats.modes.lan,
        }),
      ),
    );
    const fav = favoriteSeat(stats);
    if (fav !== null) {
      const row = el('div', 'stats-favorite');
      const dot = el('span', 'dot');
      dot.style.background = PALETTE[fav % PALETTE.length];
      row.append(dot, el('span', '', t('stats.favorite', { name: t(`stats.color.${fav + 1}` as 'stats.color.1') })));
      wrap.appendChild(row);
    }
    return wrap;
  }

  function renderPlayers(): HTMLElement {
    const stats = loadStats();
    const wrap = el('div', 'stats-players');
    const names = Object.keys(stats.players);
    if (names.length === 0) return wrap;
    wrap.appendChild(el('div', 'field-label', t('stats.players')));
    const table = el('div', 'stats-table');
    const head = el('div', 'stats-row head');
    head.append(
      el('span', 'stats-name'),
      el('span', 'stats-num', t('stats.games')),
      el('span', 'stats-num', t('stats.wins')),
      el('span', 'stats-num', t('stats.rate')),
      el('span', 'stats-num', t('stats.best')),
      el('span', 'stats-num', t('stats.streak')),
    );
    table.appendChild(head);
    names
      .map((name) => ({ name, ...stats.players[name] }))
      .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name))
      .forEach((p) => {
        const row = el('div', 'stats-row');
        const rate = p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0;
        row.append(
          el('span', 'stats-name', p.name),
          el('span', 'stats-num', String(p.games)),
          el('span', 'stats-num', String(p.wins)),
          el('span', 'stats-num', `${rate}%`),
          el('span', 'stats-num', String(p.best)),
          el('span', 'stats-num', String(p.streak)),
        );
        table.appendChild(row);
      });
    wrap.appendChild(table);
    return wrap;
  }

  function renderRecent(): HTMLElement {
    const records = loadRecords();
    const wrap = el('div', 'stats-recent');
    wrap.appendChild(el('div', 'field-label', t('stats.recent')));
    if (records.length === 0) {
      wrap.appendChild(el('div', 'field-hint', t('stats.empty')));
      return wrap;
    }
    for (const rec of records) {
      const row = button('stats-game', '', () => {
        ctx.show(renderReplay(ctx, rec, () => ctx.show(renderStats(ctx))));
      });
      const left = el('div', 'stats-game-left');
      const title = el('div', 'stats-game-title');
      title.textContent = t('stats.win', {
        name: rec.seats[rec.ranking[0]] ?? t('result.player', { n: rec.ranking[0] + 1 }),
      });
      const meta = el('div', 'field-hint');
      const date = new Date(rec.at);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
      meta.textContent = `${dateStr} · ${modeLabel(rec.mode)} · ${rec.seats.join(t('list.join'))}`;
      left.append(title, meta);
      const right = el('div', 'stats-game-right');
      rec.ranking.forEach((p, i) => {
        if (i > 1) return;
        const chip = el('span', 'rp-score');
        const dot = el('span', 'dot');
        dot.style.background = PALETTE[p % PALETTE.length];
        chip.append(dot, el('span', '', String(rec.scores[p]?.total ?? 0)));
        right.appendChild(chip);
      });
      row.append(left, right);
      wrap.appendChild(row);
    }
    return wrap;
  }
}
