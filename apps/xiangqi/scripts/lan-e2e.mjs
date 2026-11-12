import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 18927);
const BASE = `http://127.0.0.1:${PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const MATE = [
  [70, 7],
  [8, 7],
  [64, 1],
  [0, 1],
  [58, 49],
  [3, 13],
  [56, 47],
  [19, 73],
  [85, 76],
  [25, 23],
  [88, 69],
  [7, 79],
  [76, 67],
  [1, 64],
];

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

async function stopRelay(relay) {
  relay.kill();
  await Promise.race([
    new Promise((resolve) => relay.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

function point(page, index) {
  return page.locator(`.xq-point[data-index="${index}"]`);
}

async function play(page, from, to) {
  await point(page, from).click();
  await point(page, to).click();
  await page.waitForTimeout(250);
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
    localStorage.removeItem('familyarcade.xiangqi.record');
  });
  await host.goto(BASE, { waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /Play over the local network/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 10000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on the relay port, got ${invite}`);

  const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
  });
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.waiting-card', { timeout: 10000 });
  await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
  assert((await host.locator('.peer-chip').count()) === 2, 'host should list two seats');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.xq-board', { timeout: 10000 });
  assert((await guest.locator('.xq-point').count()) === 90, 'guest board should have ninety points');
  assert((await host.locator('.xq-point').count()) === 90, 'host board should have ninety points');

  for (let index = 0; index < MATE.length; index += 1) {
    const [from, to] = MATE[index];
    await play(index % 2 === 0 ? host : guest, from, to);
  }

  await guest.waitForSelector('.result-banner', { timeout: 5000 });
  const guestBanner = await guest.locator('.result-banner').innerText();
  assert(/Black wins/i.test(guestBanner), `guest should see Black wins, got: ${guestBanner}`);
  assert(/Checkmate/i.test(guestBanner), `guest should see Checkmate, got: ${guestBanner}`);
  assert((await guest.locator('.result-banner button').count()) === 0, 'guest result banner must not offer a local restart');
  assert((await host.locator('.result-banner button').count()) === 1, 'host should own the restart button');

  const hostRecord = await host.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.xiangqi.record') || '{"games":0}'),
  );
  assert(hostRecord.games === 1 && hostRecord.byMode?.lan === 1, 'host should record the LAN result');
  assert(hostRecord.winsBlack === 1, 'host should record Black as the winner');
  const guestRecord = await guest.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.xiangqi.record') || '{"games":0}'),
  );
  assert(guestRecord.games === 0, 'guest must not write to the host record');

  await host.getByRole('button', { name: /Play again/ }).click();
  await guest.waitForTimeout(600);
  assert((await guest.locator('.result-banner').count()) === 0, 'guest banner should clear after host restart');
  assert((await guest.locator('.xq-disc').count()) === 32, 'guest board should reset after host restart');

  // Reloading a guest reconnects the same seat and the host sends the live view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.xq-board', { timeout: 10000 });
  await host.waitForTimeout(600);
  assert((await guest.locator('.xq-disc').count()) === 32, 'reconnected guest should receive the current board');
  await play(host, 64, 67);
  await guest.waitForTimeout(600);
  assert((await point(guest, 67).locator('.xq-disc-r').count()) === 1, 'reconnected guest should receive host moves');

  // Closing the room returns the guest to the join panel with an honest message.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host room, invite, guest join, full checkmate, guest-locked result, restart, reconnect, host close');
} finally {
  if (browser) await browser.close();
  await stopRelay(relay);
}
