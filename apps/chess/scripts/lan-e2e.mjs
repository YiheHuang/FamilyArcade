import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 18929);
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
    if (relayExited) throw new Error(`LAN relay stopped before listening\n${relayLog}`);
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
  await page.locator(`[data-square="${from}"]`).click();
  await page.waitForTimeout(60);
  await page.locator(`[data-square="${to}"]`).click();
  await page.waitForTimeout(260);
}

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
    if (!sessionStorage.getItem('chess.lan.cleared')) {
      localStorage.removeItem('familyarcade.chess.record');
      localStorage.removeItem('familyarcade.chess.save');
      sessionStorage.setItem('chess.lan.cleared', '1');
    }
  });
  await host.goto(BASE, { waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /Play on the local network/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 10000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on the relay port, got ${invite}`);

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

  await host.getByRole('button', { name: /Start game/ }).click();
  await guest.waitForSelector('.board', { timeout: 10000 });
  assert((await guest.locator('.square').count()) === 64, 'guest board should have 64 squares');

  // Host is White, guest is Black. Scholar's Mate over the wire.
  await move(host, 'e2', 'e4');
  await guest.waitForFunction(
    () => document.querySelector('[data-square="e4"] .piece') !== null,
    null,
    { timeout: 5000 },
  );
  await move(guest, 'e7', 'e5');
  await host.waitForFunction(
    () => document.querySelector('[data-square="e5"] .piece') !== null,
    null,
    { timeout: 5000 },
  );
  await move(host, 'f1', 'c4');
  await move(guest, 'b8', 'c6');
  await move(host, 'd1', 'h5');
  await move(guest, 'g8', 'f6');
  await move(host, 'h5', 'f7');

  await guest.waitForSelector('.result-banner', { timeout: 5000 });
  const guestBanner = await guest.locator('.result-banner').innerText();
  assert(/White wins/.test(guestBanner), `guest should see White wins, got: ${guestBanner}`);
  assert(/Checkmate/.test(guestBanner), `guest should see checkmate, got: ${guestBanner}`);
  assert((await guest.locator('.result-banner button').count()) === 0, 'guest must not get a restart button');
  assert((await host.locator('.result-banner button').count()) === 1, 'host should own the restart button');

  const hostRecord = await host.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.chess.record') || '{"games":0}'),
  );
  assert(hostRecord.games === 1 && hostRecord.byMode?.lan === 1, 'host should record the LAN result');
  assert(hostRecord.whiteWins === 1, 'host should record a White win');
  const guestRecord = await guest.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.chess.record') || '{"games":0}'),
  );
  assert(guestRecord.games === 0, 'guest must not write to the host record');

  await host.getByRole('button', { name: /Play again/ }).click();
  await guest.waitForTimeout(600);
  assert((await guest.locator('.result-banner').count()) === 0, 'guest banner should clear after restart');
  assert((await guest.locator('.square .piece').count()) === 32, 'guest should see 32 pieces after restart');

  // A guest reload reconnects the same seat and receives the live view.
  await move(host, 'e2', 'e4');
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 10000 });
  await host.waitForTimeout(700);
  assert(
    (await guest.locator('[data-square="e4"] .piece').count()) === 1,
    'reconnected guest should receive the current board',
  );

  // Closing the room returns the guest to the join panel with an honest message.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — room, invite, guest join, live moves, checkmate, guest-locked result, restart, reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
