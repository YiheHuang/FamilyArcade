import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5196';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const requested = process.argv.slice(2).filter((value) => value === 'en' || value === 'zh');
const LANGS = requested.length > 0 ? requested : ['en', 'zh'];

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once('error', () => {
        if (port - start > 40) reject(new Error('no free relay port'));
        else tryPort(port + 1);
      });
      server.once('listening', () => {
        const { port: actual } = server.address();
        server.close(() => resolve(actual));
      });
      server.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

async function waitForRelay(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`relay on ${port} did not start`);
}

const relayPort = await findFreePort(8137);
const relay = spawn(
  process.execPath,
  ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(relayPort)],
  { cwd: process.cwd(), stdio: 'ignore' },
);
await waitForRelay(relayPort);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

function watch(page, label) {
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(30000);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
}

async function shot(page, dir, name) {
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(dir, name) });
}

async function claimHinted(page) {
  const hint = page.locator('.tool-buttons .secondary').first();
  if (await hint.isDisabled().catch(() => true)) return 0;
  await hint.click();
  await page.waitForTimeout(90);
  const hinted = page.locator('.card-face.is-hinted');
  if ((await hinted.count()) !== 3) return 0;
  const ids = [];
  for (let index = 0; index < 3; index += 1) {
    ids.push(await hinted.nth(index).getAttribute('data-card-id'));
  }
  for (const id of ids) {
    await page.locator(`.card-face[data-card-id="${id}"]`).click();
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(200);
  return 1;
}

async function finishByHints(page) {
  let claims = 0;
  for (let step = 0; step < 80; step += 1) {
    if (await page.locator('.result-overlay').isVisible().catch(() => false)) break;
    const active = (await page.locator('.player-chip.active').count()) > 0;
    if (!active) {
      const chips = page.locator('.player-chip');
      const count = await chips.count();
      let called = false;
      for (let offset = 0; offset < count; offset += 1) {
        const chip = chips.nth((step + offset) % count);
        if (!(await chip.isDisabled().catch(() => true))) {
          await chip.click();
          called = true;
          break;
        }
      }
      if (!called) {
        await page.waitForTimeout(280);
        continue;
      }
      await page.waitForTimeout(70);
    }
    const gained = await claimHinted(page);
    if (gained === 0) {
      await page.waitForTimeout(2150);
      continue;
    }
    claims += gained;
  }
  return claims;
}

async function runDesktop(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  watch(page, `${lang}-desktop`);
  await page.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, dir, 'home.png');

  await page.getByRole('button', { name: /Solo vs AI|单人挑战 AI/ }).first().click();
  await page.waitForTimeout(200);
  await shot(page, dir, 'setup.png');

  await page.getByRole('button', { name: /Companion|陪玩/ }).click();
  await page.getByRole('button', { name: /Start the race|开始竞速/ }).click();
  await page.waitForTimeout(350);
  await shot(page, dir, 'game.png');

  await page.locator('.tool-buttons .secondary').first().click();
  await page.waitForTimeout(300);
  await shot(page, dir, 'game-hint.png');

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Hot-seat|同屏热座/ }).first().click();
  await page.getByRole('button', { name: /Start the table|开局/ }).click();
  await page.waitForTimeout(300);

  // One manual set for Player 1 makes the final sheet a win, not a 12–12 draw.
  await page.locator('.player-chip').first().click();
  await page.waitForTimeout(80);
  await claimHinted(page);

  const claims = await finishByHints(page);
  await shot(page, dir, 'game-over.png');

  await page.getByRole('button', { name: /See the family record|查看家庭战绩/ }).click();
  await page.waitForTimeout(300);
  await shot(page, dir, 'record.png');

  await page.getByRole('button', { name: /Back|返回/ }).click();
  await page.getByRole('button', { name: /How to play|怎么玩/ }).click();
  await page.waitForTimeout(220);
  await shot(page, dir, 'rules.png');
  await context.close();
  console.log(`desktop ${lang}: ok (${claims + 1} sets to finish)`);
}

async function runLan(lang) {
  const dir = path.join(OUT, lang);
  const hostContext = await browser.newContext({ viewport: DESKTOP });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  watch(hostPage, `${lang}-lan-host`);
  watch(guestPage, `${lang}-lan-guest`);
  await hostPage.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  const hostUrl = new URL(BASE);
  hostUrl.searchParams.set('lanPort', String(relayPort));
  await hostPage.goto(hostUrl.toString(), { waitUntil: 'networkidle' });
  await hostPage.getByRole('button', { name: /LAN night|局域网之夜/ }).click();
  await hostPage.waitForSelector('.room-code.big', { timeout: 20000 });
  const invite = await hostPage.locator('.qr-card code').innerText();
  await guestPage.goto(`http://${invite}`, { waitUntil: 'networkidle' });
  await guestPage.getByRole('button', { name: /Join the room|加入房间/ }).click();
  await hostPage.waitForFunction(
    () => document.querySelectorAll('.peer-list li.online').length >= 2,
    null,
    { timeout: 20000 },
  );
  await shot(hostPage, dir, 'lan.png');
  await guestContext.close();
  await hostContext.close();
  console.log(`lan ${lang}: ok`);
}

async function runMobile(lang) {
  const dir = path.join(OUT, lang);
  const context = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  watch(page, `${lang}-mobile`);
  await page.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, dir, 'home-mobile.png');
  await page.getByRole('button', { name: /Hot-seat|同屏热座/ }).first().click();
  await page.getByRole('button', { name: /Start the table|开局/ }).click();
  await page.waitForTimeout(300);
  await page.locator('.player-chip').first().click();
  await page.waitForTimeout(100);
  await claimHinted(page);
  await page.waitForTimeout(500);
  await shot(page, dir, 'game-mobile.png');
  await context.close();
  console.log(`mobile ${lang}: ok`);
}

try {
  for (const lang of LANGS) {
    await runDesktop(lang);
    await runLan(lang);
    await runMobile(lang);
  }
  if (errors.length > 0) {
    console.error('console errors:', errors.join(' | '));
    process.exitCode = 1;
  } else {
    console.log('screenshots: no console errors');
  }
} finally {
  relay.kill();
  await browser.close();
}
