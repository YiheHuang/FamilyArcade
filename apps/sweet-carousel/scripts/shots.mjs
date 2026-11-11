import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5175';
const OUT = path.resolve('docs/screenshots');
const PROMO = path.resolve('docs/promo');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startRelay() {
  if (!existsSync(path.resolve('dist/index.html'))) {
    throw new Error('Run npm run build before npm run screenshots (the LAN screenshots need dist/).');
  }
  const port = await freePort();
  const child = spawn(process.execPath, ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LAN relay did not start')), 8000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('LAN relay')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`LAN relay exited with ${code}`));
    });
  });
  return { child, port };
}

async function captureLan(browser, lang, port) {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage();
  host.on('dialog', (dialog) => dialog.accept());
  await host.goto(`${BASE}/?tutorial=0&lang=${lang}&lanPort=${port}`, { waitUntil: 'networkidle' });
  await host.getByTestId('mode-lan').click();
  await host.getByTestId('lan-count-2').click();
  await host.getByTestId('lan-create').click();
  await host.getByTestId('lan-host-lobby').waitFor({ timeout: 10000 });
  const invite = await host.getByTestId('lan-invite').innerText();

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guest = await guestContext.newPage();
  guest.on('dialog', (dialog) => dialog.accept());
  await guest.goto(`${invite}&tutorial=0&lang=${lang}`, { waitUntil: 'networkidle' });
  await guest.getByTestId('lan-join').click();
  await guest.getByTestId('lan-guest-lobby').waitFor({ timeout: 10000 });
  await wait(500);

  await host.screenshot({ path: path.join(OUT, lang, 'lan-host.png') });
  await guest.screenshot({ path: path.join(OUT, lang, 'lan-guest.png') });

  await host.getByTestId('lan-start').click();
  await host.getByTestId('lan-game').waitFor({ timeout: 10000 });
  await guest.getByTestId('lan-game').waitFor({ timeout: 10000 });
  await wait(400);
  await host.screenshot({ path: path.join(OUT, lang, 'lan-game.png') });
  await guest.screenshot({ path: path.join(OUT, lang, 'lan-guest-game.png') });
  await guestContext.close();
  await hostContext.close();
}


async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readyIfCovered(page) {
  if (await page.getByTestId('privacy-cover').count()) {
    await page.getByTestId('cover-ready').click();
    await wait(120);
  }
}

async function pickFirst(page) {
  await readyIfCovered(page);
  const card = page.locator('.hand-fan .card-face').first();
  await card.waitFor({ timeout: 6000 });
  await card.click();
  await page.getByTestId('confirm-pick').click();
  await wait(90);
}

async function advanceIfReady(page) {
  if (await page.getByTestId('advance').count()) {
    await page.getByTestId('advance').click();
    await wait(140);
  }
}

async function nextRoundIfReady(page) {
  if (await page.getByTestId('next-round').count()) {
    await page.getByTestId('next-round').click();
    await wait(450);
  }
}

async function playPickGroups(page, groups, players) {
  for (let group = 0; group < groups; group++) {
    for (let player = 0; player < players; player++) await pickFirst(page);
    await advanceIfReady(page);
  }
}

async function captureLanguage(browser, lang, lanPort) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const base = `${BASE}/?tutorial=0&lang=${lang}&seed=shots-${lang}`;
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await mkdir(path.join(OUT, lang), { recursive: true });
  await page.screenshot({ path: path.join(OUT, lang, 'home.png') });

  await page.getByTestId('mode-hotseat').click();
  await wait(500);
  await page.getByTestId('player-count-4').click();
  await wait(250);
  await page.screenshot({ path: path.join(OUT, lang, 'setup.png') });
  await page.getByTestId('player-count-3').click();
  await wait(200);
  await page.getByTestId('start-game').click();
  await wait(500);

  // Two complete pick groups give the table some real history.
  await playPickGroups(page, 2, 3);

  // Third pick: uncover the first seat, capture the hand, then a selected card.
  await readyIfCovered(page);
  await wait(500);
  await page.screenshot({ path: path.join(OUT, lang, 'game.png') });
  await page.locator('.hand-fan .card-face').nth(2).click();
  await wait(350);
  await page.screenshot({ path: path.join(OUT, lang, 'game-select.png') });

  // Continue the selected pick and finish the whole three-round game.
  await page.getByTestId('confirm-pick').click();
  await wait(100);
  for (let player = 1; player < 3; player++) await pickFirst(page);
  await advanceIfReady(page);
  await playPickGroups(page, 5, 3);
  await nextRoundIfReady(page);
  await playPickGroups(page, 8, 3);
  await nextRoundIfReady(page);
  await playPickGroups(page, 8, 3);
  await nextRoundIfReady(page);
  await page.getByTestId('end-screen').waitFor({ timeout: 8000 });
  await wait(700);
  await page.screenshot({ path: path.join(OUT, lang, 'game-over.png') });

  await page.getByTestId('end-home').click();
  await wait(400);
  await page.getByTestId('home-stats').click();
  await wait(500);
  await page.screenshot({ path: path.join(OUT, lang, 'stats.png') });
  await page.getByTestId('back').click();
  await wait(300);
  await page.getByTestId('home-rules').click();
  await wait(600);
  await page.screenshot({ path: path.join(OUT, lang, 'rules.png') });
  await page.getByTestId('back').click();
  await wait(300);
  await page.getByTestId('home-settings').click();
  await wait(500);
  await page.screenshot({ path: path.join(OUT, lang, 'settings.png') });

  // Mobile layout in a fresh context so it has its own clean state.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.on('dialog', (dialog) => dialog.accept());
  await mobile.goto(`${BASE}/?tutorial=0&lang=${lang}&seed=shots-mobile-${lang}`, { waitUntil: 'networkidle' });
  await mobile.getByTestId('mode-hotseat').click();
  await mobile.getByTestId('start-game').click();
  await wait(350);
  await mobile.getByTestId('cover-ready').click();
  await wait(600);
  await mobile.screenshot({ path: path.join(OUT, lang, 'game-mobile.png') });
  await mobileContext.close();

  await captureLan(browser, lang, lanPort);

  // Real poster rendered from the same components, at print size.
  const posterPage = await context.newPage();
  await posterPage.setViewportSize({ width: 1200, height: 1600 });
  await posterPage.goto(`${BASE}/?poster=1&lang=${lang}`, { waitUntil: 'networkidle' });
  await wait(700);
  await mkdir(PROMO, { recursive: true });
  await posterPage.screenshot({ path: path.join(PROMO, `sweet-carousel-poster-${lang}.png`) });
  await posterPage.close();

  if (errors.length > 0) {
    console.error(`${lang}: console errors`, errors);
  } else {
    console.log(`${lang}: screenshots OK`);
  }
  await context.close();
}

async function main() {
  const relay = await startRelay();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await captureLanguage(browser, 'en', relay.port);
    await captureLanguage(browser, 'zh', relay.port);
  } finally {
    await browser.close();
    relay.child.kill();
  }
  console.log('screenshots written to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
