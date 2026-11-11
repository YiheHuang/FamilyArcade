/* ---------------------------------------------------------------------------
   End-to-end smoke test for the built desktop app.
   Drives the real WebView2 UI over CDP with real mouse input:
   drag a piece onto the board, park it, rotate it with a real circling
   gesture, confirm it, plus LAN hosting / SPA serving / WebSocket guest /
   UDP discovery.

   Prerequisites:
     npm run tauri build        (produces src-tauri/target/release/blokus.exe)
     port 7667 free             (the test starts a LAN room on it)

   Run:
     npm run e2e
--------------------------------------------------------------------------- */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'src-tauri', 'target', 'release', 'blokus.exe');
const CDP_PORT = 9333;
const CDP = `http://127.0.0.1:${CDP_PORT}`;

/** any installed Chromium browser, for the "phone opens the invite link" check */
const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[e2e] ${msg}`);
let failed = 0;
const fail = (msg) => {
  failed++;
  console.log(`[e2e] FAIL: ${msg}`);
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
};

async function main() {
  const attach = process.env.BLOKUS_E2E_ATTACH === '1';
  const skipLan = process.env.BLOKUS_E2E_SKIP_LAN === '1';

  if (!attach && !existsSync(exe)) {
    console.error(`[e2e] missing ${exe} — run "npm run tauri build" first`);
    process.exit(2);
  }

  // a leftover app on the debug port would silently attach us to the wrong
  // window (often a blank or stale page) — fail loudly instead
  if (!attach) {
    try {
      const probe = await fetch(`${CDP}/json`, { signal: AbortSignal.timeout(1500) });
      if (probe.ok) {
        console.error(
          `[e2e] port ${CDP_PORT} already serves a debug target — close any running Blokus window first, ` +
            'or use BLOKUS_E2E_ATTACH=1 to test it directly',
        );
        process.exit(2);
      }
    } catch {
      /* nothing listening: good */
    }
  }

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
      /* already gone */
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
    if (!target) {
      fail('WebView2 debug target never appeared');
      return;
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    const problems = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown') {
        problems.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? ''}`);
      } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        problems.push(`log: ${m.params.entry.text}`);
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
    await send('Log.enable');

    const evaljs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result?.result?.value;
    };
    const snapshot = async () => JSON.parse(await evaljs('JSON.stringify(window.__blokus.snapshot())'));
    const waitForPage = async () => {
      for (let i = 0; i < 40; i++) {
        const ready = await evaljs(
          'document.querySelectorAll(".mode-card").length || !!document.querySelector(".guide-body")',
        );
        if (ready) return true;
        await sleep(250);
      }
      return false;
    };
    const reload = async () => {
      await send('Page.reload');
      await sleep(1200);
      if (await waitForPage()) return;
      // occasional cold-start blank page: navigate explicitly once more
      log('page not ready after reload — retrying with an explicit navigation');
      await send('Page.navigate', { url: target.url || 'http://localhost:5173/' });
      await sleep(1800);
      if (!(await waitForPage())) fail('home screen never became ready');
    };
    // start from a clean home screen (attach mode may resume on another view)
    await reload();
    await evaljs('localStorage.removeItem("blokus.current")'); // drop any stale resume banner
    await reload();

    // -- first-run guide -----------------------------------------------------
    await evaljs('localStorage.removeItem("blokus.guide.seen")');
    await reload();
    check(
      await evaljs('!!document.querySelector(".guide-body")'),
      'a fresh install should show the how-to-play guide',
    );
    check(
      (await evaljs('document.querySelectorAll(".guide-piece").length')) === 21,
      'the guide should show all 21 pieces',
    );
    await evaljs('document.querySelector(".setup-actions .btn.primary")?.click()'); // Start playing
    await sleep(300);
    check(
      (await evaljs('document.querySelectorAll(".mode-card").length')) === 3,
      'closing the guide should land on home',
    );

    // --- real mouse input helpers ---------------------------------------
    const mouse = (type, x, y, extra = {}) =>
      send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: type === 'mouseMoved' || type === 'mouseWheel' ? 'none' : 'left',
        buttons: type === 'mouseReleased' || type === 'mouseWheel' ? 0 : 1,
        clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
        ...extra,
      });
    const click = async (x, y) => {
      await mouse('mousePressed', x, y);
      await sleep(40);
      await mouse('mouseReleased', x, y);
      await sleep(120);
    };
    const drag = async (from, to, steps = 8) => {
      await mouse('mousePressed', from[0], from[1]);
      await sleep(40);
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
        await sleep(14);
      }
      await mouse('mouseReleased', to[0], to[1]);
      await sleep(140);
    };
    /** real key press through CDP (no synthetic KeyboardEvent shortcuts) */
    const key = async (k, vk, text) => {
      const base = { key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await send('Input.dispatchKeyEvent', {
        type: text ? 'keyDown' : 'rawKeyDown',
        ...base,
        ...(text ? { text } : {}),
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(90);
    };
    const KEY = { left: 37, up: 38, right: 39, down: 40, enter: 13, esc: 27 };

    /** geometry helper: board rect + tray piece boxes (cell() added node-side) */
    const geom = async (size = 14) => {
      const raw = JSON.parse(
        await evaljs(`JSON.stringify((() => {
          const board = document.querySelector('canvas.board-canvas');
          const br = board.getBoundingClientRect();
          const cs = br.width / ${size};
          const pieces = [...document.querySelectorAll('.tray-piece')].map((el) => {
            const r = el.querySelector('canvas').getBoundingClientRect();
            return { left: r.left, top: r.top, w: r.width, h: r.height };
          });
          return { left: br.left, top: br.top, cs, pieces };
        })())`),
      );
      raw.cell = (x, y) => ({ x: raw.left + (x + 0.5) * raw.cs, y: raw.top + (y + 0.5) * raw.cs });
      // press point: centre of the piece's first tray cell (16px cells → +8)
      raw.grab = (i) => ({ x: raw.pieces[i].left + 8, y: raw.pieces[i].top + 8 });
      return raw;
    };

    // -- home ---------------------------------------------------------------
    // pin the language to Chinese for stable assertions
    await evaljs('localStorage.setItem("blokus.lang", "zh")');
    await reload();
    const title = await evaljs('document.title');
    log(`title: ${title}`);
    check(String(title).includes('Blokus'), `unexpected title ${title}`);
    check((await evaljs('document.querySelectorAll(".mode-card").length')) === 3, 'expected 3 mode cards');

    // language override: EN renders English, ZH renders Chinese
    {
      await evaljs('localStorage.setItem("blokus.lang", "en")');
      await reload();
      const enSub = String(await evaljs('document.querySelector(".home-sub")?.textContent'));
      const enCard = String(await evaljs('document.querySelector(".mode-title")?.textContent'));
      log(`lang=en: "${enSub}" / "${enCard}"`);
      check(!/[\u4e00-\u9fff]/.test(enSub + enCard), 'English UI expected with lang=en');
      await evaljs('localStorage.setItem("blokus.lang", "zh")');
      await reload();
      const zhSub = String(await evaljs('document.querySelector(".home-sub")?.textContent'));
      check(/[\u4e00-\u9fff]/.test(zhSub), 'Chinese UI expected with lang=zh');
    }

    // -- solo vs AI renders -------------------------------------------------
    await evaljs('document.querySelectorAll(".mode-card")[0].click()');
    await sleep(200);
    check((await evaljs('document.querySelector(".topbar-title")?.textContent')) === '单人训练', 'AI setup did not open');
    await evaljs('document.querySelector(".setup-actions .btn.primary").click()');
    await sleep(500);
    const canvasW = await evaljs('(() => { const c = document.querySelector("canvas.board-canvas"); return c ? c.width : 0; })()');
    const trayCount = await evaljs('document.querySelectorAll(".tray-piece").length');
    log(`solo: canvas=${canvasW}px tray=${trayCount}`);
    check(canvasW > 0, 'board canvas missing');
    check(trayCount === 21, `tray should show 21 pieces, got ${trayCount}`);

    // hint explains itself
    await evaljs(
      '[...document.querySelectorAll(".action-row button")].find((b) => b.textContent.includes("提示"))?.click()',
    );
    await sleep(1500);
    {
      const hinted = await snapshot();
      const toasts = String(
        await evaljs('[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")'),
      );
      log(`hint: ${hinted.hint ? 'highlighted' : 'none'} reason="${toasts}"`);
      check(!!hinted.hint, 'the hint should highlight a recommended move');
      check(toasts.includes('提示'), 'the hint should come with a reason');
    }

    // -- hot-seat: drag / park / rotate / confirm ---------------------------
    await reload();
    await evaljs('document.querySelectorAll(".mode-card")[1].click()');
    await sleep(200);
    await evaljs('document.querySelector(".setup-actions .btn.primary").click()');
    await sleep(400);
    let g = await geom();

    // 1) drag the monomino from the tray to the start corner
    await drag([g.grab(0).x, g.grab(0).y], [g.cell(0, 0).x, g.cell(0, 0).y]);
    let s = await snapshot();
    log(`drag: parked=${JSON.stringify(s.parked)} history=${s.history}`);
    check(s.parked && s.parked.piece === 0 && s.parked.x === 0 && s.parked.y === 0, 'monomino was not parked at the corner');
    check(s.parked?.valid === true, 'parked corner placement should be valid');
    check(s.history === 0 && s.turn === 0, 'nothing should be committed before confirmation');

    // 2) dragging a parked piece moves it; dropping on an invalid spot parks
    //    it in place (red) instead of bouncing back to the tray
    await drag([g.cell(0, 0).x, g.cell(0, 0).y], [g.cell(2, 2).x, g.cell(2, 2).y]);
    s = await snapshot();
    log(`re-drag: parked=${JSON.stringify(s.parked)}`);
    check(s.parked && s.parked.x === 2 && s.parked.y === 2, `re-drag did not move the piece: ${JSON.stringify(s.parked)}`);
    check(s.parked?.valid === false, 'off-corner start placement should be invalid');
    check(s.history === 0, 'moving a parked piece must not commit');

    // 2b) confirming an illegal placement explains *why* (and keeps it parked)
    await click(g.cell(7, 7).x, g.cell(7, 7).y);
    await sleep(200);
    {
      const badToasts = String(
        await evaljs('[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")'),
      );
      log(`illegal reason toast: ${badToasts}`);
      check(badToasts.includes('角落'), 'an illegal placement should explain the reason');
      const after = await snapshot();
      check(after.history === 0 && !!after.parked, 'an illegal confirm must keep the piece parked');
    }

    // 3) drag it back onto the corner and confirm by clicking anywhere
    await drag([g.cell(2, 2).x, g.cell(2, 2).y], [g.cell(0, 0).x, g.cell(0, 0).y]);
    s = await snapshot();
    check(s.parked && s.parked.x === 0 && s.parked.y === 0 && s.parked.valid, 'piece did not return to the corner');
    await click(g.cell(7, 7).x, g.cell(7, 7).y); // click anywhere on the board confirms
    s = await snapshot();
    log(`confirm: history=${s.history} turn=${s.turn} parked=${s.parked ? 'yes' : 'null'}`);
    check(s.history === 1 && s.turn === 1, 'confirmation did not commit the move');

    // 4) player 2 drags the domino to their corner and confirms
    g = await geom();
    await drag([g.grab(1).x, g.grab(1).y], [g.cell(12, 13).x, g.cell(12, 13).y]);
    s = await snapshot();
    log(`p2 drag: parked=${JSON.stringify(s.parked)}`);
    check(s.parked && s.parked.piece === 1 && s.parked.valid, `P2 domino not parked: ${JSON.stringify(s.parked)}`);
    await click(g.cell(10, 10).x, g.cell(10, 10).y);
    s = await snapshot();
    check(s.history === 2 && s.turn === 0, 'P2 confirmation did not commit');

    // 5) player 1 parks the L-bar at (1,1) and exercises the rotation ring
    g = await geom();
    // P1 has played I1, so the tray starts at I2; L4 (piece 5) is DOM index 4
    await drag([g.grab(4).x, g.grab(4).y], [g.cell(1, 1).x, g.cell(1, 1).y]);
    s = await snapshot();
    log(`ring setup: parked=${JSON.stringify(s.parked)} ring=${JSON.stringify(s.ring)}`);
    check(s.parked && s.parked.piece === 5 && s.parked.x === 1 && s.parked.y === 1, `L4 not parked at (1,1): ${JSON.stringify(s.parked)}`);
    check(s.parked.valid === true, 'L4 at (1,1) should be valid');
    check(!!s.ring, 'rotation ring geometry missing');

    const bandPoint = (snap, deg) => {
      const rr = snap.ring.r + snap.ring.band / 2;
      const rad = (deg * Math.PI) / 180;
      return { x: snap.ring.cx + rr * Math.cos(rad), y: snap.ring.cy + rr * Math.sin(rad) };
    };

    // 5a) a plain tap on the ring must do nothing (no rotate, no commit)
    {
      const p = bandPoint(s, 0);
      await click(p.x, p.y);
      const after = await snapshot();
      check(after.parked && after.parked.o === s.parked.o, 'ring tap must not rotate');
      check(after.history === 2, 'ring tap must not commit');
    }

    // 5b) right-button drag (any direction) flips the piece once
    {
      const before = s.parked.o;
      const p = bandPoint(s, 135);
      await mouse('mousePressed', p.x, p.y, { button: 'right', buttons: 2 });
      await sleep(40);
      for (let i = 1; i <= 4; i++) {
        await mouse('mouseMoved', p.x + i * 9, p.y, { button: 'right', buttons: 2 });
        await sleep(14);
      }
      await mouse('mouseReleased', p.x + 36, p.y, { button: 'right', buttons: 0 });
      await sleep(150);
      const after = await snapshot();
      log(`right-drag flip: o ${before} -> ${after.parked?.o} valid=${after.parked?.valid}`);
      check(after.parked && after.parked.o !== before, 'right-drag did not flip the piece');
      check(after.parked.x === 1 && after.parked.y === 1, 'flip must not move the piece');
      check(after.history === 2, 'flip must not commit');
    }

    // 5c) dragging along the ring rotates in place (60° ≈ one step)
    {
      s = await snapshot();
      const before = s.parked.o;
      const p0 = bandPoint(s, 0);
      await mouse('mousePressed', p0.x, p0.y);
      await sleep(40);
      for (let i = 1; i <= 4; i++) {
        const p = bandPoint(s, i * 15);
        await mouse('mouseMoved', p.x, p.y);
        await sleep(16);
      }
      await mouse('mouseReleased', bandPoint(s, 60).x, bandPoint(s, 60).y);
      await sleep(150);
      const after = await snapshot();
      log(`ring rotate: o ${before} -> ${after.parked?.o} pos=(${after.parked?.x},${after.parked?.y}) history=${after.history}`);
      check(after.parked && after.parked.o !== before, 'ring drag did not rotate the piece');
      check(after.parked.x === 1 && after.parked.y === 1, 'ring rotation must not move the piece');
      check(after.history === 2, 'ring rotation must not commit');
    }

    // 5d) the wheel still rotates
    {
      const before = (await snapshot()).parked.o;
      await mouse('mouseWheel', g.cell(2, 1).x, g.cell(2, 1).y, { deltaX: 0, deltaY: -120 });
      await sleep(150);
      const after = await snapshot();
      check(after.parked && after.parked.o !== before, 'wheel did not rotate the parked piece');
      check(after.history === 2, 'wheel rotation must not commit');
    }

    // 5e) Esc cancels the parked piece and the game continues
    await evaljs('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');
    await sleep(120);
    s = await snapshot();
    check(s.parked === null && s.history === 2, 'Esc did not cancel the parked piece');

    // 5f) the M key cycles the sound setting and toasts the new state
    await evaljs('window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }))');
    await sleep(150);
    const soundToast = String(await evaljs('document.querySelector(".toast")?.textContent'));
    log(`sound toggle toast: ${soundToast}`);
    check(soundToast.includes('音效'), 'M key should toast the localised sound state');

    // 6) player 1 plays the domino next to the monomino and confirms
    g = await geom();
    await drag([g.grab(0).x, g.grab(0).y], [g.cell(1, 1).x, g.cell(1, 1).y]);
    s = await snapshot();
    check(s.parked && s.parked.piece === 1 && s.parked.x === 1 && s.parked.y === 1, `I2 not parked at (1,1): ${JSON.stringify(s.parked)}`);
    check(s.parked.valid === true, 'I2 at (1,1) should be valid');
    await click(g.cell(6, 6).x, g.cell(6, 6).y);
    s = await snapshot();
    log(`commit: history=${s.history} turn=${s.turn}`);
    check(s.history === 3 && s.turn === 1, 'P1 confirmation did not commit');

    // 7) keyboard-only placement: select from the tray, arrows move the piece,
    //    Enter parks and Enter confirms (no mouse involved)
    {
      await evaljs('document.querySelectorAll(".tray-piece")[0].focus()');
      await key('Enter', KEY.enter, '\r'); // activates the focused tray button
      let ks = await snapshot();
      check(ks.selected !== null, 'Enter on a tray piece should select it');
      await key('Enter', KEY.enter); // parks at the seat's own corner
      ks = await snapshot();
      log(`keyboard park: ${JSON.stringify(ks.parked)}`);
      check(!!ks.parked, 'Enter should park the selected piece');
      // nudge it to (11,12): the corner itself is taken by P2's domino, and
      // (12,12)/(12,13) would edge-touch it — (11,12) only touches diagonally
      await key('ArrowLeft', KEY.left);
      await key('ArrowLeft', KEY.left);
      await key('ArrowUp', KEY.up);
      ks = await snapshot();
      log(`keyboard nudge: ${JSON.stringify(ks.parked)}`);
      check(ks.parked && ks.parked.x === 11 && ks.parked.y === 12 && ks.parked.valid, 'arrows should nudge the parked piece onto a legal cell');
      await key('Enter', KEY.enter); // confirm
      ks = await snapshot();
      log(`keyboard confirm: history=${ks.history} turn=${ks.turn}`);
      check(ks.history === 4 && ks.turn === 0, 'the keyboard flow should commit a legal move');
      check(ks.parked === null, 'confirming should clear the parked piece');
    }
    // -- crash safety: reload mid-game, then continue from the home screen ---
    {
      await send('Page.reload');
      await sleep(1400);
      const cardText = String(await evaljs('document.querySelector(".resume-card")?.textContent ?? ""'));
      log(`resume card: ${cardText || "none"}`);
      check(cardText.includes('继续上局'), 'an interrupted game should offer to continue');
      await evaljs(
        '[...document.querySelectorAll(".resume-card button")].find((b) => b.textContent.includes("继续"))?.click()',
      );
      await sleep(500);
      const resumed = await snapshot();
      log(`resumed: history=${resumed.history} turn=${resumed.turn}`);
      check(resumed.history === 4 && resumed.turn === 0, 'continuing should restore the interrupted game exactly');
    }

    // -- replay + stats ------------------------------------------------------
    await evaljs('localStorage.removeItem("blokus.records"); localStorage.removeItem("blokus.stats")');
    await reload();
    await evaljs("window.__blokusAuto(240, 'duo', 2)"); // play a whole game
    await sleep(500);
    let rs = await snapshot();
    log(`auto game finished: over=${rs.over} history=${rs.history}`);
    check(rs.over === true, 'the auto-played game should finish');
    const replayBtn =
      '[...document.querySelectorAll(".result-actions button")].find((b) => b.textContent.includes("复盘"))';
    check(await evaljs(`!!${replayBtn}`), 'the result overlay should offer a replay');
    await evaljs(`${replayBtn}.click()`);
    await sleep(400);
    check(await evaljs('!!document.querySelector(".replay-bar")'), 'the replay screen should open');
    await evaljs('document.querySelector(".rp-first").click()');
    await sleep(200);
    let rTxt = await evaljs('document.querySelector(".rp-step")?.textContent');
    check(String(rTxt).startsWith('第 0/'), `replay should start at move 0 (got ${rTxt})`);
    await evaljs('document.querySelector(".rp-last").click()');
    await sleep(200);
    rTxt = await evaljs('document.querySelector(".rp-step")?.textContent');
    check(!String(rTxt).startsWith('第 0/'), 'replay should jump to the end');

    // back to the (finished) game, then home and into the stats screen
    await evaljs('document.querySelector(".topbar .btn")?.click()');
    await sleep(400);
    await evaljs(
      '[...document.querySelectorAll(".result-actions button")].find((b) => b.textContent.includes("返回主页"))?.click()',
    );
    await sleep(400);
    await evaljs(
      '[...document.querySelectorAll(".home-footer button")].find((b) => b.textContent.includes("战绩"))?.click()',
    );
    await sleep(400);
    const recentCount = await evaljs('document.querySelectorAll(".stats-game").length');
    const favText = await evaljs('document.querySelector(".stats-favorite")?.textContent');
    log(`stats screen: recent=${recentCount} favorite=${favText}`);
    check(recentCount >= 1, 'the finished game should be listed in the stats');
    await evaljs('document.querySelector(".stats-game")?.click()');
    await sleep(400);
    check(await evaljs('!!document.querySelector(".replay-bar")'), 'a recent game should reopen in the replay');
    await evaljs('document.querySelector(".topbar .btn")?.click()'); // back to stats
    await sleep(300);

    // -- mobile: phone layout + a real touch drag ---------------------------
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await reload();
    await evaljs('document.querySelectorAll(".mode-card")[1].click()');
    await sleep(250);
    await evaljs('document.querySelector(".setup-actions .btn.primary").click()');
    await sleep(500);
    {
      const gm = await geom(14);
      const touch = (type, x, y) =>
        send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
        });
      const start = gm.grab(0);
      const target = gm.cell(0, 0);
      await touch('touchStart', start.x, start.y);
      await sleep(40);
      // pulling the piece out of the tray vertically picks it up
      await touch('touchMove', start.x, start.y - 16);
      await sleep(50);
      for (let i = 1; i <= 8; i++) {
        await touch(
          'touchMove',
          start.x + ((target.x - start.x) * i) / 8,
          start.y - 16 + ((target.y - (start.y - 16)) * i) / 8,
        );
        await sleep(16);
      }
      await touch('touchEnd', target.x, target.y);
      await sleep(250);
      let ms = await snapshot();
      log(`mobile touch drag: parked=${JSON.stringify(ms.parked)}`);
      check(ms.parked && ms.parked.x === 0 && ms.parked.y === 0, 'touch drag should park the piece');
      // tapping the board confirms
      await touch('touchStart', gm.cell(5, 5).x, gm.cell(5, 5).y);
      await sleep(40);
      await touch('touchEnd', gm.cell(5, 5).x, gm.cell(5, 5).y);
      await sleep(500);
      ms = await snapshot();
      log(`mobile confirm: history=${ms.history}`);
      check(ms.history === 1, 'a touch tap should confirm the placement');
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // -- LAN: host a room, serve the SPA, accept a guest --------------------
    if (skipLan) {
      log('LAN section skipped (BLOKUS_E2E_SKIP_LAN=1)');
    } else {
      await reload();
      await evaljs('document.querySelectorAll(".mode-card")[2].click()');
      await sleep(400);
      // the LAN screen now searches for itself and offers a deep scan
      const lanButtons = await evaljs(
        '[...document.querySelectorAll(".list-head button")].map((b) => b.textContent).join("|")',
      );
      log(`lan screen buttons: ${lanButtons}`);
      check(String(lanButtons).includes('深度搜索'), 'the LAN screen should offer a deep search');
      check(String(lanButtons).includes('刷新'), 'the LAN screen should keep the manual refresh');
      await evaljs('document.querySelector(".setup-body .btn.primary").click()'); // 创建房间
      await sleep(1200);
      const lobbyTitle = await evaljs('document.querySelector(".lobby-title")?.textContent');
      const invite = await evaljs('document.querySelector(".addr")?.textContent');
      const codeText = String(await evaljs('document.querySelector(".lobby-code")?.textContent ?? ""'));
      const roomCode = (codeText.match(/(\d{4})/) ?? [])[1] ?? '';
      const protocol = Number(await evaljs('window.__blokusProtocol'));
      log(`lan lobby: ${lobbyTitle} | invite: ${invite} | code: ${roomCode} | protocol: ${protocol}`);
      check(String(invite ?? '').includes(':7667'), 'lobby should show a joinable address');
      check(!String(invite ?? '').includes('172.17.'), 'virtual adapter address leaked into the invite');
      check(/^\d{4}$/.test(roomCode), 'the lobby should show a 4-digit room code');
      check(String(invite ?? '').includes(`#c=${roomCode}`), 'the invite link should carry the room code');
      check(protocol >= 2, 'the app should expose the current protocol version');

      // QR: the canvas carries the invite URL and a real decoder can read it
      const qrPayload = await evaljs('document.querySelector(".lobby-qr canvas")?.dataset.qr');
      check(qrPayload === invite, 'the QR should encode exactly the invite URL');
      {
        const dataUrl = String(
          await evaljs('document.querySelector(".lobby-qr canvas")?.toDataURL("image/png")'),
        );
        const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
        const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
        log(`qr decode: ${decoded?.data}`);
        check(decoded?.data === invite, 'a phone-style QR decoder should read the invite URL');
      }
      await evaljs('document.querySelector(".lobby-qr")?.click()');
      await sleep(200);
      check(await evaljs('!!document.querySelector(".qr-overlay canvas")'), 'clicking the QR should enlarge it');
      await evaljs('document.querySelector(".qr-overlay")?.click()');
      await sleep(150);
      check(!(await evaljs('!!document.querySelector(".qr-overlay")')), 'the overlay should close again');

      // /room-info + TCP scan: the path a second desktop uses when UDP is filtered
      const info = await fetch('http://127.0.0.1:7667/room-info')
        .then((r) => r.json())
        .catch(() => null);
      log(`room-info: ${JSON.stringify(info)}`);
      check(info?.app === 'blokus' && info?.room === 'Blokus 对局', '/room-info should describe the room');
      check(info !== null && !('code' in info), '/room-info must not expose the room code');
      const scanned = await evaljs(
        'window.__TAURI_INTERNALS__.invoke("scan_hosts", { port: 7667, timeoutMs: 250 }).then(JSON.stringify)',
      );
      log(`tcp scan: ${scanned}`);
      check(String(scanned).includes('127.0.0.1'), 'the TCP scan should find the local room');

      const http = await fetch('http://127.0.0.1:7667/').catch(() => null);
      const html = http ? await http.text() : '';
      log(`lan http: ${http?.status ?? 'no response'} serves spa: ${html.includes('Blokus')} marker: ${html.includes('__blokusRoom')}`);
      check(!!http && http.status === 200 && html.includes('Blokus'), 'LAN server did not serve the SPA');
      check(html.includes('__blokusRoom'), 'the served page should mark itself as a room (browser auto-join)');

      // the room refuses a wrong code (privacy: nobody on the LAN joins by accident)
      {
        const bad = new WebSocket('ws://127.0.0.1:7667/ws');
        const badInbox = [];
        bad.onmessage = (ev) => badInbox.push(JSON.parse(ev.data));
        await new Promise((res, rej) => {
          bad.onopen = res;
          bad.onerror = () => rej(new Error('bad-code ws failed'));
        });
        bad.send(JSON.stringify({ t: 'join', name: '路人', token: 'bad-1', version: protocol, code: '0000' }));
        for (let i = 0; i < 15 && badInbox.length === 0; i++) await sleep(100);
        log(`bad code reply: ${JSON.stringify(badInbox[0])}`);
        check(badInbox[0]?.code === 'bad-code', 'a wrong room code must be rejected');
        bad.close();
      }

      const guest = new WebSocket('ws://127.0.0.1:7667/ws');
      const inbox = [];
      guest.onmessage = (ev) => inbox.push(JSON.parse(ev.data));
      await new Promise((res, rej) => {
        guest.onopen = res;
        guest.onerror = () => rej(new Error('guest ws failed'));
      });
      guest.send(JSON.stringify({ t: 'join', name: 'E2E 访客', token: 'e2e-guest', version: protocol, code: roomCode }));
      for (let i = 0; i < 20 && inbox.length === 0; i++) await sleep(100);
      const welcome = inbox.find((m) => m.t === 'welcome');
      log(`lan welcome: slot=${welcome?.slot} players=${welcome?.players?.length}`);
      check(!!welcome && welcome.slot === 1, 'guest did not receive slot 1');

      const found = await evaljs('window.__TAURI_INTERNALS__.invoke("discover_hosts", { ms: 1200 }).then(JSON.stringify)');
      log(`discovery: ${found}`);
      if (!String(found).includes('7667')) log('note: UDP discovery did not see the room (firewall?)');

      // start the game on the host, play one move, then let the guests move
      await evaljs('document.querySelector(".setup-actions .btn.primary").click()');
      await sleep(600);
      const g20 = await geom(20);
      await drag([g20.grab(0).x, g20.grab(0).y], [g20.cell(0, 0).x, g20.cell(0, 0).y]);
      let hs = await snapshot();
      check(hs.parked && hs.history === 0, 'host move should park first');
      await click(g20.cell(6, 6).x, g20.cell(6, 6).y); // confirm anywhere
      hs = await snapshot();
      log(`host move: history=${hs.history} turn=${hs.turn}`);
      check(hs.history === 1 && hs.turn === 1, 'host move should commit and pass the turn to the guest');

      const legal = hs.legalSample?.[0];
      check(!!legal, 'no legal move sample for the guest seat');
      if (legal) {
        // a request based on an older state version is refused (and resynced)
        guest.send(JSON.stringify({ t: 'msg', payload: { g: 'request', a: legal, v: 0 } }));
        await sleep(500);
        const stale = await snapshot();
        log(`stale request: history=${stale.history} syncs=${inbox.filter((m) => m.payload?.g === 'sync').length}`);
        check(stale.history === 1, 'a request with a stale state version must not be applied');
        check(
          inbox.some((m) => m.t === 'msg' && m.payload?.g === 'sync'),
          'a stale request should be answered with a fresh snapshot',
        );

        guest.send(JSON.stringify({ t: 'msg', payload: { g: 'request', a: legal, v: 1 } }));
        await sleep(600);
        const after = await snapshot();
        log(`remote highlight: ${JSON.stringify(after.remote)} history=${after.history}`);
        check(after.history === 2 && after.turn === 0, 'the guest move should be applied by the host');
        check(
          after.remote && after.remote.piece === legal.piece && after.remote.player === 1,
          'the host should highlight the remote move',
        );
        const applied = inbox.some((m) => m.t === 'msg' && m.payload?.g === 'applied');
        check(applied, 'the guest should receive the authoritative broadcast');
      }

      // -- spectators, undo vote, pause, nudge ------------------------------
      const spec = new WebSocket('ws://127.0.0.1:7667/ws');
      const specInbox = [];
      spec.onmessage = (ev) => specInbox.push(JSON.parse(ev.data));
      await new Promise((res, rej) => {
        spec.onopen = res;
        spec.onerror = () => rej(new Error('spectator ws failed'));
      });
      spec.send(JSON.stringify({ t: 'join', name: '奶奶', token: 'spec-1', version: protocol, code: roomCode }));
      for (let i = 0; i < 20 && !specInbox.some((m) => m.t === 'welcome'); i++) await sleep(100);
      const specWelcome = specInbox.find((m) => m.t === 'welcome');
      log(`spectator welcome: slot=${specWelcome?.slot} spectator=${specWelcome?.spectator}`);
      check(specWelcome?.spectator === true, 'a third connection should become a spectator');
      for (let i = 0; i < 20 && !specInbox.some((m) => m.t === 'msg' && m.payload?.g === 'sync'); i++) {
        await sleep(100);
      }
      const specSync = specInbox.find((m) => m.t === 'msg' && m.payload?.g === 'sync');
      check(
        specSync?.payload?.snapshot?.history?.length === 2,
        'the spectator should receive the current state',
      );

      // undo vote: the guest asks, the host agrees in the UI, the guest votes via WS
      guest.send(JSON.stringify({ t: 'msg', payload: { g: 'undo-ask' } }));
      await sleep(450);
      check(
        await evaljs('!!document.querySelector(".vote-card:not(.hidden)")'),
        'the host should show the vote card',
      );
      const undoReq = inbox.find((m) => m.t === 'msg' && m.payload?.g === 'undo-request');
      check(!!undoReq, 'the guest should receive the undo request');
      await evaljs(
        '[...document.querySelectorAll(".vote-actions button")].find((b) => b.textContent.includes("同意"))?.click()',
      );
      await sleep(200);
      if (undoReq) {
        guest.send(
          JSON.stringify({ t: 'msg', payload: { g: 'undo-vote', id: undoReq.payload.id, slot: 1, ok: true } }),
        );
      }
      await sleep(600);
      const afterUndo = await snapshot();
      log(`after undo vote: history=${afterUndo.history} paused=${afterUndo.paused}`);
      check(afterUndo.history === 1, 'the rollback should discard the guest move');
      const syncs = inbox.filter((m) => m.t === 'msg' && m.payload?.g === 'sync');
      check(
        syncs.length > 0 && syncs[syncs.length - 1].payload.snapshot.history.length === 1,
        'the guest should converge via a fresh sync',
      );
      check(
        await evaljs('!!document.querySelector(".vote-card.hidden")'),
        'the vote card should be hidden after the vote',
      );
      log(
        `vote cards: ${await evaljs(
          '[...document.querySelectorAll(".vote-card")].map((c) => c.className).join("|") || "none"',
        )}`,
      );

      // pause / resume (host only)
      await evaljs(
        '[...document.querySelectorAll(".action-row.social button")].find((b) => b.textContent.includes("暂停"))?.click()',
      );
      await sleep(350);
      check((await snapshot()).paused === true, 'the host should freeze while paused');
      check(
        inbox.some((m) => m.t === 'msg' && m.payload?.g === 'pause' && m.payload.on === true),
        'the guest should hear about the pause',
      );
      await evaljs(
        '[...document.querySelectorAll(".action-row.social button")].find((b) => b.textContent.includes("继续"))?.click()',
      );
      await sleep(350);
      check((await snapshot()).paused === false, 'resume should unfreeze the host');

      // nudge
      await evaljs(
        '[...document.querySelectorAll(".action-row.social button")].find((b) => b.textContent.includes("催促"))?.click()',
      );
      await sleep(350);
      check(
        inbox.some((m) => m.t === 'msg' && m.payload?.g === 'nudge'),
        'the guest should receive the nudge',
      );

      // AI caretaker: the guest drops mid-game, the host announces it and
      // plays for the missing seat so the table is not stuck
      {
        const before = await snapshot();
        guest.close();
        await sleep(1000);
        let seen = '';
        for (let i = 0; i < 60; i++) {
          seen += String(
            await evaljs('[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")'),
          );
          const cur = await snapshot();
          if (cur.history > before.history) break;
          await sleep(400);
        }
        const after = await snapshot();
        log(`caretaker: history ${before.history} -> ${after.history} toasts=${seen}`);
        check(after.history === before.history + 1, 'the host should play for the dropped guest');
        check(after.turn === 0 || after.over, 'the turn should move on after the caretaker move');
        check(seen.includes('代打'), 'the table should be told that the AI is covering the seat');
      }

      // a phone opening the invite link lands on the join screen with the
      // address and room code already filled in (no typing at all)
      if (!BROWSER) {
        log('no Chromium browser found — browser-guest check skipped');
      } else {
        const dom = execFileSync(
          BROWSER,
          [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${join(tmpdir(), 'blokus-e2e-browser')}`,
            '--dump-dom',
            `http://127.0.0.1:7667/#c=${roomCode}`,
          ],
          { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        log(`browser guest page: join screen=${dom.includes('manual-join')} code prefilled=${dom.includes(`value="${roomCode}"`)}`);
        check(dom.includes('manual-join'), 'the invite link should render the LAN join screen');
        check(dom.includes(`value="${roomCode}"`), 'the room code should be prefilled from the link');
        check(dom.includes('value="127.0.0.1:7667"'), 'the address should be prefilled from the link');
        check(!dom.includes('guide-body'), 'the join screen must win over the first-run guide');
      }
    }

    log(`console problems: ${problems.length}`);
    for (const p of problems.slice(0, 5)) log(`  ${String(p).slice(0, 200)}`);
    check(problems.length === 0, 'console errors/exceptions detected');
  } finally {
    stop();
  }

  log(failed === 0 ? 'E2E OK' : `E2E FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.log(`[e2e] ERROR: ${err.message}`);
  process.exit(1);
});
