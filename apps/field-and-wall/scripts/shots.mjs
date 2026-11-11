import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5176';
const LAN_PORT = Number(process.env.LAN_PORT || 8096);
const LAN_BASE = `http://127.0.0.1:${LAN_PORT}`;
const OUT = path.resolve('docs/screenshots');
const INFO = JSON.parse(await readFile('docs/demo-info.json', 'utf8'));
const TARGET = INFO.target;

async function shot(page, lang, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(OUT, lang, `${name}.png`),
    animations: 'disabled',
  });
}

async function loadSave(page, lang, file) {
  const json = await readFile(file, 'utf8');
  await page.evaluate((value) => {
    localStorage.setItem('fieldandwall.save.v1', value);
  }, json);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(850);
}

async function playTarget(page, target) {
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${target.x},${target.y}"]`);
    if (await slot.count()) {
      await slot.click();
      await page.waitForTimeout(220);
      if (await page.getByTestId('confirm-place').count()) break;
    }
    await page.keyboard.press('r');
    await page.waitForTimeout(220);
  }
  if (target.meeple != null) {
    const chip = page.locator(`[data-feature="${target.meeple}"]`);
    if (await chip.count()) await chip.click();
  }
  await page.getByTestId('confirm-place').click();
  await page.waitForTimeout(900);
}

async function seedStats(page, lang) {
  const full = JSON.parse(await readFile(`docs/full-game.${lang}.json`, 'utf8'));
  const names = lang === 'zh' ? ['阿禾', '小满', '外婆'] : ['Mira', 'Tomas', 'Grandma'];
  const scoreSets = [
    [67, 57],
    [52, 58],
    [44, 49],
  ];
  const history = scoreSets.map((scores, i) => ({
    id: `demo-${i}`,
    endedAt: Date.UTC(2026, 10, 8 - i, 19, 30),
    config: full.config,
    moves: full.moves,
    scores,
    winnerNames: [scores[0] > scores[1] ? names[0] : names[1]],
    lastScored: [],
  }));
  const stats = {
    version: 1,
    games: 9,
    players: {
      [names[0]]: { name: names[0], games: 9, wins: 5, bestScore: 67, totalScore: 520 },
      [names[1]]: { name: names[1], games: 9, wins: 4, bestScore: 61, totalScore: 498 },
      [names[2]]: { name: names[2], games: 4, wins: 1, bestScore: 48, totalScore: 170 },
    },
    currentStreak: { name: names[0], count: 2 },
    bestStreak: 3,
    lastWinner: names[0],
    history,
  };
  await page.evaluate((value) => {
    localStorage.setItem('fieldandwall.stats.v1', JSON.stringify(value));
  }, stats);
}


async function waitForRelay() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${LAN_BASE}/`);
      if (response.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('LAN relay did not start');
}

async function waitForTiles(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-tile]').length === expected,
    count,
    { timeout: 12_000 },
  );
}

async function captureLan(browser, lang) {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  host.on('dialog', (dialog) => dialog.accept());
  guest.on('dialog', (dialog) => dialog.accept());
  try {
    await host.goto(`${LAN_BASE}/?tutorial=0&lang=${lang}&lanPort=${LAN_PORT}`, { waitUntil: 'networkidle' });
    await host.getByTestId('mode-lan').click();
    await host.waitForTimeout(300);
    await host.getByTestId('lan-create').click();
    await host.getByTestId('lan-code').waitFor({ timeout: 15_000 });
    const invite = (await host.getByTestId('lan-invite').innerText()).trim();
    const guestUrl = new URL(invite);
    guestUrl.searchParams.set('lang', lang);
    guestUrl.searchParams.set('tutorial', '0');
    await guest.goto(guestUrl.toString(), { waitUntil: 'networkidle' });
    await guest.getByTestId('lan-join').click();
    await guest.getByTestId('lan-guest-joined').waitFor({ timeout: 10_000 });
    await host.waitForFunction(
      () => document.querySelector('[data-testid="lan-seat-1"]')?.classList.contains('is-online'),
      { timeout: 10_000 },
    );
    await shot(host, lang, 'lan-host');
    await shot(guest, lang, 'lan-guest');
    await host.getByTestId('lan-start').click();
    await waitForTiles(host, 1);
    await waitForTiles(guest, 1);
    await host.locator('.board-slot').first().click();
    await host.waitForTimeout(250);
    await host.getByTestId('confirm-place').click();
    await waitForTiles(host, 2);
    await waitForTiles(guest, 2);
    await guest.locator('.board-slot').first().click();
    await guest.waitForTimeout(250);
    await guest.getByTestId('confirm-place').click();
    await waitForTiles(host, 3);
    await waitForTiles(guest, 3);
    await shot(host, lang, 'lan-game');
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
}

async function captureLanguage(browser, lang) {
  await mkdir(path.join(OUT, lang), { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  const url = `${BASE}/?tutorial=0&lang=${lang}`;

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, lang, 'home');

  await page.getByTestId('mode-hotseat').click();
  await page.waitForTimeout(500);
  await shot(page, lang, 'setup');

  await loadSave(page, lang, `docs/demo-save.${lang}.json`);
  await shot(page, lang, 'game');

  const slots = page.locator('.board-slot');
  if (await slots.count()) {
    await slots.first().click();
    await page.waitForTimeout(350);
    const chips = page.locator('.feature-chip[data-feature]');
    if (await chips.count()) {
      await chips.first().click();
      await page.waitForTimeout(250);
    }
  }
  await shot(page, lang, 'game-select');

  await page.getByTestId('game-home').click();
  await page.waitForTimeout(400);
  await page.getByTestId('home-rules').click();
  await page.waitForTimeout(500);
  await shot(page, lang, 'rules');

  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.getByTestId('home-settings').click();
  await page.waitForTimeout(450);
  await shot(page, lang, 'settings');

  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await seedStats(page, lang);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(550);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(500);
  await shot(page, lang, 'stats');

  await page.evaluate(async (json) => {
    localStorage.setItem('fieldandwall.save.v1', json);
  }, await readFile(`docs/end-save.${lang}.json`, 'utf8'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(850);
  await playTarget(page, TARGET);
  await page.waitForTimeout(500);
  await shot(page, lang, 'game-over');

  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.on('dialog', (dialog) => dialog.accept());
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(500);
  await loadSave(mobile, lang, `docs/demo-save.${lang}.json`);
  await shot(mobile, lang, 'game-mobile');
  await mobileContext.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let relay = null;
if (existsSync(path.resolve('dist', 'index.html'))) {
  relay = spawn(
    process.execPath,
    [path.resolve('..', '..', 'tools', 'lan-server.mjs'), '--dist', path.resolve('dist'), '--port', String(LAN_PORT)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await waitForRelay();
}
for (const lang of ['en', 'zh']) {
  await captureLanguage(browser, lang);
  if (relay) await captureLan(browser, lang);
}
await browser.close();
relay?.kill();
console.log('screenshots written to', OUT);
