import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 18927);
const BASE = `http://127.0.0.1:${PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

if (!existsSync('dist/index.html')) {
  throw new Error('Run npm run build first (dist/index.html is missing).');
}

const relay = spawn(
  process.execPath,
  ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);
let relayLog = '';
let relayExited = false;
relay.stdout.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.stderr.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.on('exit', () => {
  relayExited = true;
});

async function waitForRelay() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (relayExited) {
      throw new Error(`LAN relay stopped before listening on ${BASE}\n${relayLog}`);
    }
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`LAN relay did not start on ${BASE}\n${relayLog}`);
}

async function move(page, from, to) {
  await page.locator('.cell').nth(from).click();
  await page.waitForTimeout(90);
  await page.locator('.cell').nth(to).click();
  await page.waitForTimeout(200);
}

const HOST_MOVES = [46, 45, 38, 31, 24, 17, 10];
const GUEST_MOVES = [0, 6, 8, 12, 18, 20];
const HOST_TO = [45, 38, 31, 24, 17, 10, 3];
const GUEST_TO = [7, 13, 1, 5, 19, 27];

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  host.on('pageerror', (error) => errors.push(`host: ${error}`));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
  });
  await host.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.jungle-chess.record');
  });
  await host.goto(BASE, { waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /Play on the same Wi-Fi/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 10000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should use the relay port, got ${invite}`);

  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
  });
  await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.waiting-card', { timeout: 10000 });
  await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
  assert((await host.locator('.peer-chip').count()) === 2, 'host should list two seats');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.board', { timeout: 10000 });
  assert((await guest.locator('.cell').count()) === 63, 'guest board should have 63 cells');

  for (let index = 0; index < HOST_MOVES.length; index += 1) {
    await move(host, HOST_MOVES[index], HOST_TO[index]);
    if (index < GUEST_MOVES.length) {
      await move(guest, GUEST_MOVES[index], GUEST_TO[index]);
    }
  }

  await guest.waitForSelector('.result-banner', { timeout: 5000 });
  const guestBanner = await guest.locator('.result-banner').innerText();
  assert(/Red wins/.test(guestBanner), `guest should see Red wins, got: ${guestBanner}`);
  assert((await guest.locator('.result-banner button').count()) === 0, 'guest must not restart');
  assert((await host.locator('.result-banner button').count()) === 1, 'host owns restart');
  const hostRecord = await host.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.jungle-chess.record') || '{"games":0}'),
  );
  assert(hostRecord.games === 1 && hostRecord.byMode?.lan === 1, 'host should record LAN');
  const guestRecord = await guest.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.jungle-chess.record') || '{"games":0}'),
  );
  assert(guestRecord.games !== 1, 'guest must not write the host record');

  await host.getByRole('button', { name: /Play again/ }).click();
  await guest.waitForTimeout(400);
  assert((await guest.locator('.result-banner').count()) === 0, 'guest banner should clear');
  assert((await guest.locator('.piece').count()) === 16, 'guest board should reset');

  // A reloaded guest reconnects and receives the live host view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 10000 });
  await host.waitForTimeout(500);
  await move(host, 46, 45);
  await guest.waitForTimeout(350);
  assert(
    (await guest.locator('.cell').nth(45).locator('.piece').count()) === 1,
    'reconnected guest should receive host moves',
  );

  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see closure: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — room, invite port, guest join, 63-cell view, live moves, den result, guest lock, restart, reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
