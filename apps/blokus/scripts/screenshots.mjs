/* ---------------------------------------------------------------------------
   Capture the README screenshots from the real app (English UI).

   Prerequisites:
     npm run tauri build   (or a running dev app; see BLOKUS_SHOTS_ATTACH=1)
     port 7667 free        (the script hosts a LAN room for the lobby shot)

   Run:
     npm run screenshots
--------------------------------------------------------------------------- */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'src-tauri', 'target', 'release', 'blokus.exe');
const outDir = join(root, 'docs', 'screenshots');
const CDP_PORT = 9334;
const CDP = `http://127.0.0.1:${CDP_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[shots] ${msg}`);

async function main() {
  const attach = process.env.BLOKUS_SHOTS_ATTACH === '1';
  if (!attach && !existsSync(exe)) {
    console.error(`[shots] missing ${exe} — run "npm run tauri build" first`);
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });

  const app = attach
    ? null
    : spawn(exe, [], {
        env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` },
        stdio: 'ignore',
      });
  const stop = () => {
    if (!app) return;
    try {
      app.kill();
    } catch {
      /* gone */
    }
  };
  process.on('exit', stop);

  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(500);
      try {
        const targets = await fetch(`${CDP}/json`).then((r) => r.json());
        target = targets.find((t) => t.type === 'page') ?? null;
      } catch {
        /* not up yet */
      }
    }
    if (!target) throw new Error('app did not expose a debug target');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const send = (method, params = {}) =>
      new Promise((res) => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send('Runtime.enable');
    await send('Page.enable');

    const evaljs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result?.result?.value;
    };
    const waitForCards = async () => {
      for (let i = 0; i < 40; i++) {
        const ready = await evaljs(
          'document.querySelectorAll(".mode-card").length || !!document.querySelector(".guide-body")',
        );
        if (ready) return;
        await sleep(250);
      }
      throw new Error('home screen never appeared');
    };
    const reload = async () => {
      await send('Page.reload');
      await sleep(1200);
      await waitForCards();
    };
    const shoot = async (name) => {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const data = res.result?.data;
      if (!data) throw new Error(`screenshot ${name} failed`);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
      log(`saved docs/screenshots/${name}`);
    };
    const mouse = (type, x, y, extra = {}) =>
      send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
        ...extra,
      });
    const click = async (x, y) => {
      await mouse('mousePressed', x, y);
      await sleep(40);
      await mouse('mouseReleased', x, y);
      await sleep(140);
    };

    // -- English UI, home ----------------------------------------------------
    await reload();
    await evaljs('localStorage.setItem("blokus.lang", "en")');
    await evaljs('localStorage.setItem("blokus.sound", "normal")');
    await evaljs('localStorage.removeItem("blokus.current")'); // no resume banner in the shot
    await reload();
    await sleep(300);
    await shoot('home.png');

    // -- first-run guide -----------------------------------------------------
    await evaljs('localStorage.removeItem("blokus.guide.seen")');
    await reload();
    await sleep(300);
    await shoot('guide.png');
    await evaljs('localStorage.setItem("blokus.guide.seen", "1")');
    await reload();

    // -- solo setup ----------------------------------------------------------
    await evaljs('document.querySelectorAll(".mode-card")[0].click()');
    await sleep(300);
    await evaljs('(() => { const seg = document.querySelectorAll(".field")[2]; const items = seg.querySelectorAll(".seg-item"); items[2].click(); })()'); // Expert
    await sleep(200);
    await shoot('setup.png');

    // -- mid-game board with a parked piece (hero) ---------------------------
    await evaljs("window.__blokusAuto(26, 'standard', 4, 20261017)");
    await sleep(2500);
    const snap = async () => JSON.parse(await evaljs('JSON.stringify(window.__blokus.snapshot())'));
    const geom = async () =>
      JSON.parse(
        await evaljs(`JSON.stringify((() => {
          const board = document.querySelector('canvas.board-canvas');
          const br = board.getBoundingClientRect();
          const cs = br.width / 20;
          const pieces = [...document.querySelectorAll('.tray-piece')].map((el) => {
            const r = el.querySelector('canvas').getBoundingClientRect();
            return { left: r.left, top: r.top };
          });
          return { left: br.left, top: br.top, cs, pieces };
        })())`),
      );

    // park one piece via a real drag so the rotation ring is visible
    const pick = await evaljs(`(() => {
      const btns = [...document.querySelectorAll('.tray-piece')];
      return btns.length;
    })()`);
    log(`tray pieces after auto play: ${pick}`);
    const g = await geom();
    // press the first tray piece at its first cell, then drag it into view
    await mouse('mousePressed', g.pieces[0].left + 8, g.pieces[0].top + 8);
    await sleep(60);
    const dragSnap = await snap();
    const key = (dragSnap.miKeys ?? []).find((k) => k.startsWith('0:')) ?? (dragSnap.miKeys ?? [])[0];
    if (!key) throw new Error('no legal move for the screenshot piece');
    const [o, kx, ky] = key.split(':').map(Number);
    void o;
    // aim for a spot near the board centre for a nicer composition
    const all = (dragSnap.miKeys ?? []).map((k) => {
      const [oo, x, y] = k.split(':').map(Number);
      const d = Math.hypot(x - 10, y - 10);
      return { k, oo, x, y, d };
    });
    all.sort((a, b) => a.d - b.d);
    const t0 = all[0] ?? { x: kx, y: ky };
    const targetX = g.left + (t0.x + 0.5 + 0) * g.cs;
    const targetY = g.top + (t0.y + 0.5 + 0) * g.cs;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await mouse(
        'mouseMoved',
        g.pieces[0].left + 8 + ((targetX - (g.pieces[0].left + 8)) * i) / steps,
        g.pieces[0].top + 8 + ((targetY - (g.pieces[0].top + 8)) * i) / steps,
      );
      await sleep(16);
    }
    await mouse('mouseReleased', targetX, targetY);
    await sleep(400);
    const parked = await snap();
    log(`parked for the hero shot: ${JSON.stringify(parked.parked)} ring=${parked.ring ? 'yes' : 'no'}`);
    await shoot('game.png');

    // -- LAN lobby with one guest -------------------------------------------
    await reload();
    await evaljs('document.querySelectorAll(".mode-card")[2].click()');
    await sleep(400);
    await evaljs('document.querySelector(".setup-body .btn.primary").click()'); // Create room
    await sleep(1200);
    const guest = new WebSocket('ws://127.0.0.1:7667/ws');
    const inbox = [];
    guest.onmessage = (ev) => inbox.push(JSON.parse(ev.data));
    await new Promise((res, rej) => {
      guest.onopen = res;
      guest.onerror = () => rej(new Error('guest ws failed'));
    });
    guest.send(JSON.stringify({ t: 'join', name: 'Lily', token: 'shot-guest', version: 1 }));
    for (let i = 0; i < 25 && !inbox.some((m) => m.t === 'welcome'); i++) await sleep(100);
    await sleep(600);
    await shoot('lobby.png');
    try {
      guest.close();
    } catch {
      /* ignore */
    }

    // -- phone layout with the ring visible ---------------------------------
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await reload();
    await evaljs('localStorage.setItem("blokus.lang", "en")');
    await reload();
    await sleep(300);
    await evaljs("window.__blokusAuto(14, 'duo', 2, 20261017)");
    await sleep(900);
    {
      const raw = JSON.parse(
        await evaljs(`JSON.stringify((() => {
          const board = document.querySelector('canvas.board-canvas');
          const br = board.getBoundingClientRect();
          const cs = br.width / 14;
          const pieces = [...document.querySelectorAll('.tray-piece')].map((el) => {
            const r = el.querySelector('canvas').getBoundingClientRect();
            return { left: r.left, top: r.top };
          });
          return { left: br.left, top: br.top, cs, pieces };
        })())`),
      );
      const touch = (type, x, y) =>
        send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
        });
      const start = { x: raw.pieces[0].left + 8, y: raw.pieces[0].top + 8 };
      await touch('touchStart', start.x, start.y);
      await sleep(50);
      await touch('touchMove', start.x, start.y - 18);
      await sleep(80);
      const mid = await snap();
      const keys = (mid.miKeys ?? []).map((k) => {
        const [oo, x, y] = k.split(':').map(Number);
        return { oo, x, y, d: Math.hypot(x - 7, y - 7) };
      });
      keys.sort((a, b) => a.d - b.d);
      const targetKey = keys.find((k) => k.oo === 0) ?? keys[0];
      if (targetKey) {
        const tx = raw.left + (targetKey.x + 0.5) * raw.cs;
        const ty = raw.top + (targetKey.y + 0.5) * raw.cs;
        for (let i = 1; i <= 8; i++) {
          await touch('touchMove', start.x + ((tx - start.x) * i) / 8, start.y - 18 + ((ty - (start.y - 18)) * i) / 8);
          await sleep(16);
        }
        await touch('touchEnd', tx, ty);
        await sleep(400);
        log(`mobile parked: ${JSON.stringify((await snap()).parked)}`);
      }
    }
    await shoot('game-mobile.png');
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // -- replay screen -------------------------------------------------------
    await reload();
    await evaljs("window.__blokusAuto(240, 'duo', 2, 20261017)");
    await sleep(500);
    await evaljs(
      '[...document.querySelectorAll(".result-actions button")].find((b) => b.textContent.includes("Replay"))?.click()',
    );
    await sleep(600);
    await shoot('replay.png');

    log('done');
  } finally {
    stop();
  }
  process.exit(0);
}

main().catch((err) => {
  console.log(`[shots] ERROR: ${err.message}`);
  process.exit(1);
});
