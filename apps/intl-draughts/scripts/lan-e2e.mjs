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
  for (let attempt = 0; attempt < 80; attempt += 1) {
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

async function clickSquare(page, index) {
  await page.locator(`[data-square="${index}"]`).click();
  await page.waitForTimeout(120);
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
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
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
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.waiting-card', { timeout: 10000 });
  await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
  assert((await host.locator('.peer-chip').count()) === 2, 'host should list two seats');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.board', { timeout: 10000 });
  assert((await guest.locator('.board .square.dark').count()) === 50, 'guest board should have 50 dark squares');
  assert((await guest.locator('.board .piece').count()) === 40, 'guest should see all 40 pieces');

  // Two quiet moves each, far apart so no capture interrupts the sequence.
  for (const [side, from, to] of [
    ['host', 69, 58],
    ['guest', 30, 41],
    ['host', 67, 56],
    ['guest', 32, 43],
  ]) {
    const page = side === 'host' ? host : guest;
    await clickSquare(page, from);
    await clickSquare(page, to);
    await host.waitForTimeout(260);
  }
  assert((await guest.locator('[data-square="58"] .piece').count()) === 1, 'guest missed the host move');
  assert((await guest.locator('[data-square="43"] .piece').count()) === 1, 'host missed the guest move');
  assert((await guest.locator('.board .piece').count()) === 40, 'quiet moves changed the piece count');

  // Reloading a guest reconnects the same seat and receives the live position.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 10000 });
  await host.waitForTimeout(500);
  assert((await guest.locator('[data-square="56"] .piece').count()) === 1, 'reconnected guest lost the position');
  await clickSquare(host, 65);
  await clickSquare(host, 54);
  await guest.waitForTimeout(500);
  assert((await guest.locator('[data-square="54"] .piece').count()) === 1, 'guest did not receive the live move');

  // Closing the room returns the guest to the join panel with an honest message.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 7000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host room, invite, guest join, live moves, reconnect, guest-locked flow, host close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
