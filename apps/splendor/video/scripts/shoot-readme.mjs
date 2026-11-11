/**
 * Captures the README screenshots in both languages, at 2×, from the real app.
 * Writes JPEGs to docs/screenshots/{en,zh}/.
 *
 * Run: node scripts/shoot-readme.mjs   (needs a built client)
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const VIDEO = resolve(here, "..");
const TMP = join(ROOT, "data", "tmp", "readme-shots");
const OUT = join(ROOT, "docs", "screenshots");
const PORT = 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[readme] ${m}`);

const NAMES = {
  zh: encodeURIComponent("爸爸,妈妈,哥哥,妹妹"),
  en: encodeURIComponent("Dad,Mom,Mia,Leo"),
};

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
for (const lang of ["en", "zh"]) mkdirSync(join(OUT, lang), { recursive: true });

const server = spawn("npm", ["run", "start", "-w", "@splendor/server"], {
  cwd: ROOT,
  shell: true,
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORT) },
});
let browser = null;

const shot = async (page, name) => {
  const file = join(TMP, name);
  await page.screenshot({ path: file, fullPage: false });
  log(`captured ${name}`);
};

const jpeg = (from, to, width) => {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", from, "-vf", `scale=${width}:-1:flags=lanczos`, "-q:v", "3", "-y", to],
    { stdio: "ignore" },
  );
};

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(500);
    if (i === 59) throw new Error("server did not start");
  }
  log(`server up on ${BASE}`);

  browser = await chromium.launch({ channel: "msedge", headless: true });

  for (const lang of ["en", "zh"]) {
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

    await page.goto(`${BASE}/?screen=menu&lang=${lang}`, { waitUntil: "load" });
    await sleep(900);
    await shot(page, `${lang}-menu.png`);

    await page.goto(
      `${BASE}/?dev=game&scene=midgame&players=4&names=${NAMES[lang]}&seed=readme&turnsecs=0&lang=${lang}`,
      { waitUntil: "load" },
    );
    await sleep(1600);
    await shot(page, `${lang}-game.png`);

    await page.goto(`${BASE}/?dev=records&lang=${lang}`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="record-row"]', { timeout: 12000 });
    await page.getByText(lang === "zh" ? "战绩" : "Stats", { exact: true }).first().click();
    await sleep(700);
    await shot(page, `${lang}-stats.png`);

    await page.goto(`${BASE}/?screen=lobby&lang=${lang}`, { waitUntil: "load" });
    await sleep(700);
    const nameInput = page.locator('input[type="text"]').first();
    if ((await nameInput.count()) > 0 && (await nameInput.inputValue()) === "") {
      await nameInput.fill(lang === "zh" ? "爸爸" : "Dad");
    }
    await page.getByText(lang === "zh" ? "创建房间" : "Create room", { exact: true }).first().click();
    await page.locator('[data-testid="lobby-qr"]').waitFor({ timeout: 12000 });
    await sleep(900);
    await shot(page, `${lang}-lobby.png`);

    await context.close();

    // replay + mobile come from the promo captures (already 2×, real UI)
    for (const [src, name, width] of [
      [join(VIDEO, "public", "shots", lang, "replay.png"), `${lang}-replay.png`, 1440],
      [join(VIDEO, "public", "shots", lang, "mobile.png"), `${lang}-mobile.png`, 390],
    ]) {
      if (!existsSync(src)) throw new Error(`missing ${src}`);
      const preview = join(TMP, name);
      if (name.includes("mobile")) {
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-vf", `scale=${width}:-1:flags=lanczos`, "-y", preview], { stdio: "ignore" });
      } else {
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-y", preview], { stdio: "ignore" });
      }
      log(`prepared ${name}`);
    }

    for (const [name, width] of [
      ["menu", 1440],
      ["game", 1440],
      ["stats", 1440],
      ["lobby", 1440],
      ["replay", 1440],
      ["mobile", 390],
    ]) {
      const png = join(TMP, `${lang}-${name}.png`);
      if (!existsSync(png)) throw new Error(`missing capture ${png}`);
      jpeg(png, join(OUT, lang, `${name}.jpg`), width);
    }
    log(`${lang}: README screenshots written`);
  }
} catch (error) {
  console.error(`[readme] ${String(error).slice(0, 500)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server.pid) spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
  await sleep(800);
}
