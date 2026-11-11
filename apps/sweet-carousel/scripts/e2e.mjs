import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5175';
const URL = `${BASE}/?tutorial=0&lang=en&seed=e2e-sweet-carousel`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
  if (!existsSync('dist/index.html')) throw new Error('Run npm run build before E2E (dist is needed for LAN).');
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
      reject(new Error(`LAN relay exited: ${code}`));
    });
  });
  return { child, port };
}

async function lanPick(page) {
  await page.locator('.hand-fan .card-face').first().click();
  await page.getByTestId('lan-confirm').click();
  await wait(90);
}

async function pickFirst(page) {
  if (await page.getByTestId('privacy-cover').count()) {
    await page.getByTestId('cover-ready').click();
    await wait(100);
  }
  const card = page.locator('.hand-fan .card-face').first();
  await card.waitFor({ timeout: 6000 });
  await card.click();
  await page.getByTestId('confirm-pick').click();
  await wait(90);
}

async function advanceIfReady(page) {
  if (await page.getByTestId('advance').count()) {
    await page.getByTestId('advance').click();
    await wait(150);
  }
}

async function pickGroup(page, players) {
  for (let player = 0; player < players; player++) await pickFirst(page);
  await advanceIfReady(page);
}

async function main() {
  const relay = await startRelay();
  process.once('exit', () => relay.child.kill());
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(600);
  assert(await page.getByTestId('mode-solo').count(), 'home did not render');

  // Solo: privacy cover is not needed, AI seats answer, undo returns to the reveal.
  await page.getByTestId('mode-solo').click();
  await page.getByTestId('start-game').click();
  await wait(700);
  assert((await page.getByTestId('privacy-cover').count()) === 0, 'solo should not show a cover');
  assert((await page.locator('.hand-fan .card-face').count()) === 8, 'solo hand should have 8 cards');
  await page.locator('.hand-fan .card-face').first().click();
  await page.getByTestId('confirm-pick').click();
  await page.getByTestId('advance').waitFor({ timeout: 8000 });
  assert((await page.getByTestId('reveal-list').count()) === 1, 'solo reveal missing');
  await page.getByTestId('advance').click();
  await wait(400);
  assert((await page.locator('.hand-fan .card-face').count()) === 7, 'solo next hand should have 7 cards');
  await page.getByTestId('undo').click();
  await wait(300);
  assert((await page.locator('.hand-fan .card-face').count()) === 8, 'solo undo should reopen the previous hand');
  assert((await page.getByTestId('advance').count()) === 0, 'solo undo should return to picking');
  await page.getByTestId('game-home').click();
  await wait(300);

  // Hotseat: privacy, simultaneous reveal, resume, undo and a full game.
  await page.getByTestId('mode-hotseat').click();
  await wait(200);
  await page.getByTestId('player-count-2').click();
  await page.getByTestId('start-game').click();
  await wait(300);
  assert((await page.getByTestId('privacy-cover').count()) === 1, 'hotseat should show a cover');
  assert((await page.locator('.hand-fan .card-face').count()) === 0, 'hand leaked before cover is dismissed');
  await page.getByTestId('cover-ready').click();
  await wait(150);
  assert((await page.locator('.hand-fan .card-face').count()) === 8, 'first hand should have 8 cards');
  await page.locator('.hand-fan .card-face').first().click();
  await page.getByTestId('confirm-pick').click();
  await wait(200);
  assert((await page.getByTestId('privacy-cover').count()) === 1, 'second player cover missing');
  assert((await page.locator('.hand-fan .card-face').count()) === 0, 'hand leaked after first pick');
  await page.getByTestId('cover-ready').click();
  await wait(150);
  await page.locator('.hand-fan .card-face').first().click();
  await page.getByTestId('confirm-pick').click();
  await page.waitForTimeout(200);
  assert((await page.getByTestId('reveal-list').count()) === 1, 'reveal after both picks missing');
  await page.getByTestId('advance').click();
  await wait(300);

  // Autosave / resume: reload in the middle of pick 2.
  await page.reload({ waitUntil: 'networkidle' });
  await wait(500);
  assert(await page.getByTestId('continue-game').count(), 'continue card missing after reload');
  await page.getByTestId('continue-game').click();
  await wait(300);
  assert((await page.getByTestId('privacy-cover').count()) === 1, 'resume should cover the hand');
  assert((await page.getByTestId('privacy-cover').innerText()).includes('Player 1'), 'resume cover is for the wrong player');
  await page.getByTestId('cover-ready').click();
  await wait(150);
  assert((await page.locator('.hand-fan .card-face').count()) === 7, 'resumed hand should have 7 cards');

  // Finish pick 2, then rounds 1-3.
  await pickFirst(page); // player 1, pick 2
  await pickFirst(page); // player 2, pick 2
  await advanceIfReady(page);
  for (let group = 3; group <= 8; group++) await pickGroup(page, 2);
  assert(await page.getByTestId('round-summary').count(), 'round 1 summary missing');
  await page.getByTestId('next-round').click();
  await wait(500);
  for (let group = 1; group <= 8; group++) await pickGroup(page, 2);
  await page.getByTestId('next-round').click();
  await wait(500);
  for (let group = 1; group <= 8; group++) await pickGroup(page, 2);
  await page.getByTestId('next-round').click();
  await page.getByTestId('end-screen').waitFor({ timeout: 8000 });
  assert(await page.getByTestId('end-screen').innerText(), 'end screen is empty');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('sweetcarousel.stats.v1') || '{}'));
  assert(stats.games === 1, `stats games expected 1, got ${stats.games}`);
  assert(Object.values(stats.wins || {}).reduce((sum, value) => sum + value, 0) === 1, 'winner was not recorded');

  // Review and export are reachable from the real end screen.
  await page.getByTestId('review').click();
  await wait(300);
  assert(await page.getByTestId('review-screen').count(), 'review screen missing');
  await page.getByTestId('back').click();
  await wait(200);
  const downloadPromise = page.waitForEvent('download', { timeout: 6000 });
  await page.getByTestId('export-json').click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith('.json'), 'export download filename is not JSON');

  // Stats, settings and rules from the home screen.
  await page.getByTestId('end-home').click();
  await wait(300);
  await page.getByTestId('home-stats').click();
  await wait(300);
  assert(await page.getByTestId('stats-screen').count(), 'stats screen missing');
  assert((await page.getByTestId('stats-screen').innerText()).includes('1'), 'stats should show one game');
  await page.getByTestId('back').click();
  await page.getByTestId('home-settings').click();
  await wait(300);
  assert(await page.getByTestId('settings-screen').count(), 'settings screen missing');
  await page.getByTestId('settings-lang-zh').click();
  await wait(250);
  assert((await page.locator('h1').first().innerText()).includes('设置'), 'language did not switch to Chinese');
  await page.getByTestId('settings-lang-en').click();
  await wait(200);
  await page.getByTestId('settings-reduced-motion').check({ force: true });
  await wait(150);
  assert((await page.evaluate(() => document.documentElement.dataset.motion)) === 'reduced', 'reduced motion not applied');
  await page.getByTestId('settings-reduced-motion').uncheck({ force: true });
  await wait(100);
  await page.getByTestId('back').click();
  await page.getByTestId('home-rules').click();
  await wait(300);
  assert(await page.getByTestId('rules-screen').count(), 'rules screen missing');
  assert((await page.getByTestId('rules-screen').innerText()).includes('12'), 'scoring table missing');

  // Mobile: no horizontal overflow, hand appears after the cover, privacy holds.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.on('dialog', (dialog) => dialog.accept());
  await mobile.goto(`${BASE}/?tutorial=0&lang=en&seed=e2e-mobile`, { waitUntil: 'networkidle' });
  await mobile.getByTestId('mode-hotseat').click();
  await mobile.getByTestId('start-game').click();
  await wait(300);
  assert((await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) === false, 'mobile overflows horizontally');
  await mobile.getByTestId('cover-ready').click();
  await wait(300);
  assert((await mobile.locator('.hand-fan .card-face').count()) === 8, 'mobile hand missing');
  await mobile.locator('.hand-fan .card-face').first().click();
  await mobile.getByTestId('confirm-pick').click();
  await wait(200);
  assert((await mobile.getByTestId('privacy-cover').count()) === 1, 'mobile privacy cover missing');
  assert((await mobile.locator('.hand-fan .card-face').count()) === 0, 'mobile hand leaked');

  // LAN host/guest: real relay, per-seat views, reconnect and a full game.
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage();
  host.on('pageerror', (error) => errors.push(`LAN host: ${String(error)}`));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`LAN host console: ${message.text()}`);
  });
  await host.goto(`${BASE}/?tutorial=0&lang=en&lanPort=${relay.port}`, { waitUntil: 'networkidle' });
  await host.getByTestId('mode-lan').click();
  await host.getByTestId('lan-count-2').click();
  await host.getByTestId('lan-create').click();
  await host.getByTestId('lan-host-lobby').waitFor({ timeout: 10000 });
  const invite = await host.getByTestId('lan-invite').innerText();
  assert(invite.includes(`:${relay.port}/`), `invite should use relay port: ${invite}`);

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(`LAN guest: ${String(error)}`));
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`LAN guest console: ${message.text()}`);
  });
  await guest.goto(`${invite}&tutorial=0&lang=en`, { waitUntil: 'networkidle' });
  await guest.getByTestId('lan-join').click();
  await guest.getByTestId('lan-guest-lobby').waitFor({ timeout: 10000 });
  await wait(300);
  await host.getByTestId('lan-start').click();
  await host.getByTestId('lan-game').waitFor({ timeout: 10000 });
  await guest.getByTestId('lan-game').waitFor({ timeout: 10000 });
  const hostCards = await host.locator('.hand-fan .card-face').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-card-id')));
  const guestCards = await guest.locator('.hand-fan .card-face').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-card-id')));
  assert(hostCards.length === 8 && guestCards.length === 8, 'LAN hands should have 8 cards');
  assert(hostCards.every((id) => !guestCards.includes(id)), 'guest view leaked the host hand');

  // One complete group, then drop and rejoin the guest; the seat must survive.
  await lanPick(host);
  await lanPick(guest);
  await host.getByTestId('lan-advance').waitFor({ timeout: 5000 });
  await host.getByTestId('lan-advance').click();
  await wait(250);
  await guest.close();
  await wait(300);
  guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(`LAN guest: ${String(error)}`));
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`LAN guest console: ${message.text()}`);
  });
  await guest.goto(`${invite}&tutorial=0&lang=en`, { waitUntil: 'networkidle' });
  await guest.getByTestId('lan-join').click();
  await guest.getByTestId('lan-game').waitFor({ timeout: 10000 });
  await wait(300);
  assert((await guest.locator('.hand-fan .card-face').count()) === 7, 'reconnected guest should resume with 7 cards');

  for (let round = 1; round <= 3; round++) {
    const startGroup = round === 1 ? 2 : 1;
    for (let group = startGroup; group <= 8; group++) {
      await lanPick(host);
      await lanPick(guest);
      await host.getByTestId('lan-advance').waitFor({ timeout: 5000 });
      await host.getByTestId('lan-advance').click();
      await wait(90);
    }
    assert(await host.getByTestId('lan-round-summary').count(), `LAN host round ${round} summary missing`);
    assert(await guest.getByTestId('lan-round-summary').count(), `LAN guest round ${round} summary missing`);
    await host.getByTestId('lan-next').click();
    await wait(250);
  }
  await host.getByTestId('lan-end').waitFor({ timeout: 8000 });
  await guest.getByTestId('lan-end').waitFor({ timeout: 8000 });
  await host.getByTestId('lan-rematch').click();
  await host.getByTestId('lan-game').waitFor({ timeout: 8000 });
  await guest.getByTestId('lan-game').waitFor({ timeout: 8000 });
  await hostContext.close();
  await guestContext.close();
  relay.child.kill();

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await mobileContext.close();
  await context.close();
  await browser.close();
  console.log('E2E OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
