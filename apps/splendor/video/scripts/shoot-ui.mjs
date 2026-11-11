/**
 * Captures the real UI in both languages for the promo:
 *   shots/{lang}/ai.png        the four AI difficulty chips (setup panel)
 *   shots/{lang}/settings.png  the animation-speed card
 *   shots/{lang}/replay.png    a finished game being replayed
 *   shots/{lang}/mobile.png    a 390×844 phone game
 *   shots/{lang}/lobby-qr.png  the lobby QR card (with the real room code)
 *   src/data/shots.json        the room code used by the QR (per language)
 *
 * Run: node scripts/shoot-ui.mjs   (needs a built client: npm run build -w @splendor/client)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import QRCode from "qrcode";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const OUT = join(here, "..", "public", "shots");
const DATA = join(here, "..", "src", "data", "shots.json");
const PORT = 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[shots] ${m}`);

mkdirSync(OUT, { recursive: true });

/** the address a phone on the same Wi-Fi would actually use */
function pickLanIp() {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal && iface.address)
    .map((iface) => iface.address);
  const rank = (ip) => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    const m = /^172\.(\d+)\./.exec(ip);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2;
    if (ip.startsWith("100.")) return 8;
    return 3;
  };
  return (ips.sort((a, b) => rank(a) - rank(b))[0] ?? "127.0.0.1");
}

if (!existsSync(join(ROOT, "packages", "client", "dist", "index.html"))) {
  console.error(`[shots] missing the built client — run: npm run build -w @splendor/client`);
  process.exit(2);
}

const server = spawn(
  "npm",
  ["run", "start", "-w", "@splendor/server"],
  {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT) },
  },
);
let browser = null;

const shots = {};

try {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(500);
    if (i === 59) throw new Error("server did not start");
  }
  log(`server up on ${BASE}`);

  browser = await chromium.launch({ channel: "msedge", headless: true });

  for (const lang of ["zh", "en"]) {
    const dir = join(OUT, lang);
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: lang === "zh" ? "zh-CN" : "en-US",
    });
    await context.addInitScript((language) => {
      try {
        localStorage.setItem(
          "splendor.settings.v1",
          JSON.stringify({
            lang: language,
            animations: false,
            animSpeed: 3,
            music: false,
            sound: false,
            uiClicks: false,
            uiScale: 1,
          }),
        );
        localStorage.setItem("splendor.tutorial.v1", "1");
      } catch {
        /* ignore */
      }
    }, lang);
    const page = await context.newPage();

    // 1) AI difficulty chips (the setup surface)
    await page.goto(`${BASE}/?screen=menu&lang=${lang}`, { waitUntil: "load" });
    await sleep(900);
    const setup = page.locator(".surface").filter({ hasText: lang === "zh" ? "陪玩" : "Companion" }).first();
    if ((await setup.count()) === 0) throw new Error(`${lang}: setup surface not found`);
    await setup.screenshot({ path: join(dir, "ai.png") });
    log(`${lang}: ai.png`);

    // 2) animation speed card
    await page.goto(`${BASE}/?screen=settings&lang=${lang}`, { waitUntil: "load" });
    await sleep(900);
    const speed = page
      .locator(".surface")
      .filter({ hasText: lang === "zh" ? "动画速度" : "Animation speed" })
      .first();
    if ((await speed.count()) === 0) throw new Error(`${lang}: speed card not found`);
    await speed.screenshot({ path: join(dir, "settings.png") });
    log(`${lang}: settings.png`);

    // 3) a replay of a finished game
    await page.goto(`${BASE}/?dev=records&lang=${lang}`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="record-row"]', { timeout: 12000 });
    await sleep(600);
    const row = page.locator('[data-testid="record-row"]').first();
    if ((await row.count()) === 0) throw new Error(`${lang}: no record rows`);
    await row.getByText(lang === "zh" ? "复盘" : "Replay", { exact: true }).click();
    await page.locator('[data-testid="replay-frame"]').waitFor({ timeout: 8000 });
    await sleep(700);
    await page.screenshot({ path: join(dir, "replay.png") });
    log(`${lang}: replay.png`);

    // 4) phone game, with the same family names as the video
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    const names =
      lang === "zh"
        ? encodeURIComponent("爸爸,妈妈,哥哥,妹妹")
        : encodeURIComponent("Dad,Mom,Mia,Leo");
    await phone.goto(
      `${BASE}/?dev=game&scene=fresh&human=1&players=4&names=${names}&seed=promo&turnsecs=0&lang=${lang}`,
      { waitUntil: "load" },
    );
    await sleep(2000);
    await phone.screenshot({ path: join(dir, "mobile.png") });
    log(`${lang}: mobile.png`);
    await phone.close();

    // 5) lobby QR card (real code + real join URL)
    await page.goto(`${BASE}/?screen=lobby&lang=${lang}`, { waitUntil: "load" });
    await sleep(700);
    const nameInput = page.locator('input[type="text"]').first();
    if ((await nameInput.count()) > 0 && (await nameInput.inputValue()) === "") {
      await nameInput.fill(lang === "zh" ? "爸爸" : "Dad");
    }
    await page.getByText(lang === "zh" ? "创建房间" : "Create room", { exact: true }).first().click();
    await page.locator('[data-testid="lobby-qr"]').waitFor({ timeout: 12000 });
    await sleep(600);
    const code = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find(
        (node) =>
          typeof node.className === "string" &&
          node.className.includes("text-[46px]") &&
          node.className.includes("font-mono"),
      );
      return el?.textContent?.trim() ?? "";
    });
    if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error(`${lang}: bad room code "${code}"`);
    // The app's QR encodes the join URL. The bare test server advertises
    // localhost first, so re-render the same QR with a reachable LAN address.
    const ip = pickLanIp();
    const joinUrl = `http://${ip}:${PORT}/?join=${code}`;
    await QRCode.toFile(join(dir, "lobby-qr.png"), joinUrl, {
      margin: 2,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#26303e", light: "#ffffff" },
    });
    shots[lang] = { code, url: joinUrl, ip };
    log(`${lang}: lobby-qr.png (room ${code} · ${joinUrl})`);

    await context.close();
  }

  writeFileSync(DATA, `${JSON.stringify(shots, null, 2)}\n`, "utf8");
  log(`wrote ${DATA}`);
} catch (error) {
  console.error(`[shots] ${String(error).slice(0, 500)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server.pid) spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
  await sleep(800);
}
