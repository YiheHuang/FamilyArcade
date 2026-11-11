import type { GameConfig, PlayerCount, VariantId } from '../game/types';
import { t } from '../i18n';
import type { LanRoom } from '../net/lan';
import type { DiscoveredHost } from '../net/protocol';
import { button, copyText, el, errMsg, invokeTauri, isTauri, toast } from './dom';
import { drawQr } from './qr';
import type { AppCtx, Screen } from './screens';

export interface LanCtx extends AppCtx {
  hostLan(opts: { port: number; room: string; config: GameConfig }): Promise<void>;
  joinLan(ip: string, port: number, name: string, code: string): Promise<void>;
  /** leave the lobby / room (host: closes the server) */
  leaveLobby(): void;
}

export interface LobbyScreen extends Screen {
  refresh(): void;
}

// ---------------------------------------------------------------- components

function segmented<T extends string | number>(
  options: Array<{ value: T; label: string }>,
  initial: T,
  onChange?: (v: T) => void,
): { root: HTMLElement; get(): T } {
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
  if (hint) body.appendChild(el('div', 'field-hint', hint));
  wrap.appendChild(body);
  return wrap;
}

function input(placeholder: string, value = ''): HTMLInputElement {
  const i = el('input', 'input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.value = value;
  // keep the attribute in sync so the prefilled value is part of the DOM
  // (serialisation/debugging; the property stays authoritative)
  if (value) i.setAttribute('value', value);
  return i;
}

/** the room code from the invite link (#c=1234), if any */
export function codeFromHash(hash: string): string {
  return /(?:^|[#&])c=(\d{4})/.exec(hash)?.[1] ?? '';
}

/** true when this page was served by a Blokus room (see the Rust static handler) */
export function servedByRoom(): boolean {
  return !isTauri() && !!(window as unknown as Record<string, unknown>).__blokusRoom;
}

function topbar(title: string, onBack: () => void): HTMLElement {
  const bar = el('header', 'topbar');
  bar.append(
    button('btn ghost', t('setup.back'), onBack),
    el('div', 'spacer'),
    el('h2', 'topbar-title', title),
    el('div', 'spacer'),
  );
  return bar;
}

// -------------------------------------------------------------- join / host

export function renderLanSetup(ctx: LanCtx): Screen {
  const root = el('div', 'screen setup');
  const tauri = isTauri();

  let variant: VariantId = 'standard';
  let maxPlayers: PlayerCount = 4;

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
      if (v !== 'standard') maxPlayers = 2;
      updatePlayers(maxPlayers);
    },
  );
  body.appendChild(field(t('setup.board'), variantSeg.root));

  const playersSeg = segmented<PlayerCount>(
    [
      { value: 2, label: t('setup.count', { n: 2 }) },
      { value: 3, label: t('setup.count', { n: 3 }) },
      { value: 4, label: t('setup.count', { n: 4 }) },
    ],
    maxPlayers,
    (v) => {
      maxPlayers = v;
    },
  );
  function updatePlayers(v: PlayerCount): void {
    for (const b of playersSeg.root.children) {
      const btn = b as HTMLButtonElement;
      btn.classList.toggle('is-on', btn.textContent === t('setup.count', { n: v }));
    }
  }
  const playersField = field(t('lan.players'), playersSeg.root);
  body.appendChild(playersField);

  // ---- host section
  if (tauri) {
    const portInput = input('7667', '7667');
    portInput.style.maxWidth = '120px';
    const roomInput = input(t('lan.roomDefault'), t('lan.roomDefault'));
    const hostBtn = button('btn primary', t('lan.create'), () => {
      const port = Number.parseInt(portInput.value, 10) || 7667;
      const room = roomInput.value.trim() || t('lan.roomDefault');
      void ctx.hostLan({ port, room, config: { variant, players: maxPlayers } });
    });
    body.append(
      field(t('lan.port'), portInput, t('lan.portHint')),
      field(t('lan.roomName'), roomInput),
      field('', hostBtn),
    );
  } else {
    body.appendChild(el('div', 'field-hint', t('lan.browserCannotHost')));
  }

  // ---- join section
  const list = el('div', 'host-list');
  const refreshBtn = button('btn small', t('lan.refresh'), () => void refresh());
  const deepBtn = button('btn small', t('lan.deepScan'), () => void refresh({ deep: true }));
  const listHead = el('div', 'list-head');
  listHead.append(el('div', 'field-label', t('lan.nearby')), deepBtn, refreshBtn);
  if (!tauri) {
    // a browser cannot search the network at all — keep the hint, drop the buttons
    deepBtn.hidden = true;
    refreshBtn.hidden = true;
  }
  const selfAddrLine = el('div', 'field-hint');
  body.append(listHead, list, selfAddrLine);

  /** room code the family reads off the host's screen; asked for before joining */
  function tryJoin(ip: string, port: number): void {
    const code = codeInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
      codeInput.focus();
      codeInput.classList.add('input-attention');
      window.setTimeout(() => codeInput.classList.remove('input-attention'), 1600);
      toast(t('lan.codeNeeded'), 2600);
      return;
    }
    void ctx.joinLan(ip, port, nameInput.value.trim() || t('lan.playerDefault'), code);
  }

  let busy = false;
  let deepDone = false;
  let lastSig = '';

  async function refresh(opts: { silent?: boolean; deep?: boolean } = {}): Promise<void> {
    if (!tauri) {
      list.replaceChildren(el('div', 'field-hint', t('lan.noDiscovery')));
      return;
    }
    if (busy) return; // the silent timer must not stack up
    busy = true;
    try {
      if (!opts.silent) list.replaceChildren(el('div', 'field-hint', t('lan.searching')));
      let hosts = await invokeTauri<DiscoveredHost[]>('discover_hosts', { ms: opts.silent ? 500 : 1200 });
      let viaScan = false;
      // broadcasts are often filtered (firewalls, access points): fall back to
      // a TCP scan of our own subnet, which uses the very port the game needs
      if (hosts.length === 0 && (opts.deep || !deepDone)) {
        deepDone = true;
        if (!opts.silent) list.replaceChildren(el('div', 'field-hint', t('lan.scanning')));
        const scanned = await invokeTauri<DiscoveredHost[]>('scan_hosts', { port: 7667, timeoutMs: 250 });
        if (scanned.length > 0) {
          hosts = scanned;
          viaScan = true;
        }
      }
      const sig = hosts.map((h) => `${h.ip}:${h.port}:${h.room}:${h.phase}`).join('|');
      if (opts.silent && sig === lastSig) return;
      lastSig = sig;
      renderHosts(hosts, viaScan);
    } catch (err) {
      list.replaceChildren(el('div', 'field-hint', t('lan.searchFailed', { msg: errMsg(err) })));
    } finally {
      busy = false;
    }
  }

  function renderHosts(hosts: DiscoveredHost[], viaScan: boolean): void {
    list.replaceChildren();
    if (hosts.length === 0) {
      list.appendChild(el('div', 'field-hint', t('lan.none')));
      if (deepDone) list.appendChild(el('div', 'field-hint', t('lan.tcpFailed')));
      return;
    }
    for (const h of hosts) {
      const row = el('div', 'host-row');
      const info = el('div', 'host-info');
      const meta = t('lan.roomInfo', {
        ip: h.ip,
        port: h.port,
        n: h.players,
        max: h.max,
        phase: t(h.phase === 'playing' ? 'lan.phase.playing' : 'lan.phase.lobby'),
      });
      info.append(
        el('div', 'host-name', h.room),
        el('div', 'field-hint', viaScan ? `${meta} · ${t('lan.viaScan')}` : meta),
      );
      // joining a running game is fine — you watch until the next round
      const join = button('btn small', t(h.phase === 'playing' ? 'lan.watch' : 'lan.join'), () =>
        tryJoin(h.ip, h.port),
      );
      row.append(info, join);
      list.appendChild(row);
    }
  }

  if (tauri) {
    void invokeTauri<string[]>('lan_addresses')
      .then((addrs) => {
        if (addrs.length > 0) {
          selfAddrLine.textContent = t('lan.selfAddr', { list: addrs.join(t('list.join')) });
        }
      })
      .catch(() => undefined);
  } else {
    selfAddrLine.textContent = '';
  }
  // while this screen is open, keep it fresh (cheap UDP probe only)
  const timer = tauri ? window.setInterval(() => void refresh({ silent: true }), 2500) : 0;

  const nameInput = input(t('lan.yourName'), t('lan.playerDefault'));
  // a browser opened from the invite link lands here with address + code filled
  const viaRoom = servedByRoom();
  const addrInput = input('192.168.1.5:7667', viaRoom ? location.host : '');
  const codeInput = input('0000', codeFromHash(location.hash));
  codeInput.style.maxWidth = '90px';
  const joinBtn = button('btn', t('lan.joinRoom'), () => {
    const raw = addrInput.value.trim();
    if (!raw) {
      toast(t('lan.enterAddress'));
      return;
    }
    const [ip, portStr] = raw.includes(':') ? raw.split(':') : [raw, '7667'];
    const port = Number.parseInt(portStr ?? '7667', 10) || 7667;
    tryJoin(ip.trim(), port);
  });
  const manual = el('div', 'manual-join');
  manual.append(nameInput, addrInput, codeInput, joinBtn);
  body.append(field(t('lan.manual'), manual, t('lan.codeHint')));

  root.append(topbar(t('setup.lanTitle'), () => ctx.show(ctx.home())), body);
  window.setTimeout(() => void refresh(), 50);
  return { root, destroy: () => window.clearInterval(timer) };
}

// ---------------------------------------------------------------- lobby

/** full-screen enlarged QR for scanning from across the table */
function showQrOverlay(url: string): void {
  const overlay = el('div', 'qr-overlay');
  const canvas = document.createElement('canvas');
  canvas.className = 'qr-canvas';
  drawQr(canvas, url, { module: 9, margin: 3 });
  overlay.append(canvas, el('div', 'qr-overlay-hint', t('lan.lobby.qrHint')));
  const close = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') close();
  }
  overlay.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

export function renderLobby(ctx: LanCtx, room: LanRoom): LobbyScreen {
  const root = el('div', 'screen setup');
  const body = el('div', 'setup-body');

  body.appendChild(el('h3', 'lobby-title', room.roomName));

  if (room.role === 'host') {
    const addrBlock = el('div', 'lobby-address');
    const inviteRow = el('div', 'lobby-invite-row');

    // QR code: phones scan it and land on the join screen with everything filled
    const qrWrap = el('div', 'lobby-qr');
    const qrCanvas = document.createElement('canvas');
    qrCanvas.className = 'qr-canvas';
    drawQr(qrCanvas, room.primaryUrl(), { module: 4, margin: 3 });
    qrWrap.append(qrCanvas, el('div', 'field-hint', t('lan.lobby.qr')));
    qrWrap.title = t('lan.lobby.enlarge');
    qrWrap.addEventListener('click', () => showQrOverlay(room.primaryUrl()));

    const info = el('div', 'lobby-invite-info');
    info.append(
      el('div', 'lobby-code', t('lan.lobby.code', { code: room.code })),
      el('div', 'field-label', t('lan.lobby.invite')),
    );
    const row = el('div', 'addr-row');
    row.append(el('code', 'addr', room.primaryUrl()));
    row.appendChild(
      button('btn small', t('lan.lobby.copy'), () => {
        void copyText(room.primaryUrl()).then((ok) =>
          toast(ok ? t('lan.lobby.copied') : t('lan.lobby.copyFailed')),
        );
      }),
    );
    info.appendChild(row);
    const inviteText = t('lan.lobby.inviteText', { url: room.primaryUrl(), code: room.code });
    info.appendChild(
      button('btn small', t('lan.lobby.copyInvite'), () => {
        void copyText(inviteText).then((ok) =>
          toast(ok ? t('lan.lobby.inviteCopied') : t('lan.lobby.copyFailed')),
        );
      }),
    );
    // fallback addresses (virtual NICs filtered out, real ones listed)
    const others = room.backupUrls();
    if (others.length > 0) {
      const alt = el('div', 'addr-alt');
      alt.appendChild(el('div', 'field-hint', others.join('   ')));
      info.appendChild(alt);
    }

    inviteRow.append(qrWrap, info);
    addrBlock.appendChild(inviteRow);
    body.appendChild(addrBlock);
  }

  const listHead = el('div', 'field-label', t('lan.lobby.players'));
  const list = el('div', 'player-list');
  body.append(listHead, list);

  const startBtn = button('btn primary big', t('lan.lobby.start'), () => room.startGame());
  const leaveBtn = button(
    room.role === 'host' ? 'btn danger' : 'btn',
    room.role === 'host' ? t('lan.lobby.close') : t('lan.lobby.leave'),
    () => ctx.leaveLobby(),
  );
  const actions = el('div', 'setup-actions');
  actions.append(startBtn, leaveBtn);

  const hint = el('div', 'field-hint');
  body.appendChild(hint);
  root.append(
    topbar(
      room.role === 'host' ? t('lan.lobby.waitingTitle') : t('lan.lobby.roomTitle'),
      () => ctx.leaveLobby(),
    ),
    body,
    actions,
  );

  function refresh(): void {
    list.replaceChildren();
    for (const p of [...room.players].sort((a, b) => a.slot - b.slot)) {
      const row = el('div', 'player-row');
      const dot = el('span', 'dot');
      dot.style.background = `var(--p${p.slot + 1})`;
      const name = el('span', 'pname', p.name);
      const tags = el('span', 'score-tags');
      if (p.slot === room.slot) tags.textContent = t('lan.lobby.me');
      const state = el('span', 'pstate', p.connected ? t('game.tag.online') : t('game.tag.offline'));
      state.classList.toggle('off', !p.connected);
      row.append(dot, name, tags, state);
      list.appendChild(row);
    }
    const connected = room.connectedPlayers().length;
    const max = room.config.players;
    hint.textContent = t('lan.lobby.online', { n: connected, max });
    if (room.role === 'host') {
      startBtn.disabled = connected < 2;
      startBtn.textContent = connected < 2 ? t('lan.lobby.needPlayers') : t('lan.lobby.start');
    } else {
      startBtn.hidden = true;
      hint.textContent += ` · ${t('lan.lobby.waitingHost')}`;
    }
  }
  refresh();
  return { root, refresh };
}
