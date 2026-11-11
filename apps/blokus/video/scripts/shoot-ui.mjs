/**
 * Chinese UI stills for the promo's "three ways to play" cards.
 * Drives the packaged desktop app over CDP and captures 1500x1025 PNGs.
 *
 * Run: node scripts/shoot-ui.mjs   (needs src-tauri/target/release/blokus.exe)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const exe = join(here, "..", "..", "src-tauri", "target", "release", "blokus.exe");
const outDir = join(here, "..", "public", "shots");
const CDP_PORT = 9335;
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[shots] ${m}`);

if (!existsSync(exe)) {
  console.error(`[shots] missing ${exe} — run "npm run tauri build" in the repo root first`);
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` },
  stdio: "ignore",
});
const stop = () => {
  try {
    app.kill();
  } catch {
    /* gone */
  }
};
process.on("exit", stop);

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(500);
  try {
    const targets = await fetch(`${CDP}/json`).then((r) => r.json());
    target = targets.find((t) => t.type === "page") ?? null;
  } catch {
    /* not up yet */
  }
}
if (!target) throw new Error("app did not expose a debug target");

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
await send("Runtime.enable");
await send("Page.enable");

const evaljs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const waitForCards = async () => {
  for (let i = 0; i < 40; i++) {
    if (await evaljs('document.querySelectorAll(".mode-card").length')) return;
    await sleep(250);
  }
  throw new Error("home screen never appeared");
};
const reload = async () => {
  await send("Page.reload");
  await sleep(1200);
  await waitForCards();
};
const shoot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  const data = res.result?.data;
  if (!data) throw new Error(`screenshot ${name} failed`);
  const file = join(outDir, name);
  writeFileSync(file, Buffer.from(data, "base64"));
  log(`saved public/shots/${name}`);
};

// Chinese UI, no guide, no resume banner
await reload();
await evaljs('localStorage.setItem("blokus.lang", "zh")');
await evaljs('localStorage.setItem("blokus.sound", "off")');
await evaljs('localStorage.setItem("blokus.guide.seen", "1")');
await evaljs('localStorage.removeItem("blokus.current")');
await reload();
await sleep(300);

// 1) solo practice setup
await evaljs('document.querySelectorAll(".mode-card")[0].click()');
await sleep(400);
await shoot("setup.png");

// 2) a mid-game four-player board (real AI game, fixed seed)
await reload();
await evaljs("window.__blokusAuto(44, 'standard', 4, 20261020)");
await sleep(2600);
await shoot("game.png");

// 3) LAN lobby with the QR code
await reload();
await evaljs('document.querySelectorAll(".mode-card")[2].click()');
await sleep(400);
await evaljs('document.querySelector(".setup-body .btn.primary").click()');
await sleep(1400);
await shoot("lobby.png");

log("done");
stop();
process.exit(0);
