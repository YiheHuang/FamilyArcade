import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

async function freePort(start) {
  for (let port = start; port < start + 50; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No free LAN test port found');
}

const PORT = await freePort(Number(process.env.LAN_PORT || 18927));
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
let relayListening = false;
relay.stdout.on('data', (chunk) => {
  relayLog += chunk.toString();
  if (relayLog.includes('Family Arcade LAN relay')) relayListening = true;
});
relay.stderr.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.on('exit', () => {
  relayExited = true;
});

async function waitForRelay() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (relayExited) throw new Error(`LAN relay stopped before listening on ${BASE}\n${relayLog}`);
    if (!relayListening) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
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

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const capture = (name, page) => {
    page.on('pageerror', (error) => errors.push(`${name}: ${error}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`);
    });
  };

  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  capture('host', host);
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.evaluate(() => {
    localStorage.removeItem('familyarcade.shogi.save');
    localStorage.removeItem('familyarcade.shogi.record');
  });
  await host.reload({ waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /Same Wi-Fi/ }).click();
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
  capture('guest', guest);
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.waiting-card', { timeout: 10000 });
  await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
  assert((await host.locator('.peer-chip').count()) === 2, 'host should list two seats');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.board', { timeout: 10000 });
  assert((await guest.locator('.cell').count()) === 81, 'guest board should have 81 squares');
  assert((await guest.locator('.piece').count()) === 40, 'guest board should start with 40 pieces');

  const clickMove = async (page, from, to) => {
    await page.locator('.cell').nth(from).click();
    await page.locator('.cell').nth(to).click();
    await page.waitForTimeout(350);
  };

  await clickMove(host, 58, 49);
  await guest.waitForTimeout(350);
  assert((await guest.locator('.cell.has-b').count()) === 20, 'guest did not receive host move');
  await clickMove(guest, 22, 31);
  await host.waitForTimeout(350);
  assert((await host.locator('.cell').nth(31).locator('.piece').count()) === 1, 'host did not receive guest move');
  assert((await host.locator('.turn-copy strong').innerText()).includes('Your move'), 'host turn did not return');

  // Guest reload reconnects to the same seat and receives the live view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 10000 });
  await host.waitForTimeout(600);
  assert((await guest.locator('.piece').count()) === 40, 'reconnected guest should receive the current board');
  assert((await guest.locator('.cell').nth(49).locator('.piece').count()) === 1, 'reconnected guest lost the host move');
  await clickMove(host, 57, 48);
  await guest.waitForTimeout(350);
  await clickMove(guest, 31, 40);
  await host.waitForTimeout(350);
  assert((await host.locator('.cell').nth(40).locator('.piece').count()) === 1, 'host did not receive reconnected guest move');

  // Closing the room returns the guest to the join panel with an honest message.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host room, invite, guest join, live moves both ways, reconnect, host close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
