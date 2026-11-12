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

async function handIds(page) {
  return page.locator('.hand .playing-card').evaluateAll((els) =>
    els.map((element) => element.getAttribute('data-card')),
  );
}

async function takeTurn(page, seat) {
  const turnSeat = await page.locator('.seat.is-turn').getAttribute('data-seat');
  if (Number(turnSeat) !== seat) return false;
  const pass = page.locator('.pass-button');
  if (await pass.isEnabled().catch(() => false)) {
    await pass.click();
    return true;
  }
  const c3 = page.locator('.hand .playing-card[data-card="C3"]');
  const card =
    (await c3.count()) > 0 ? c3.first() : page.locator('.hand .playing-card').first();
  await card.click();
  await page.locator('.play-button').click();
  return true;
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

  await host.getByRole('button', { name: /Wi-Fi table/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /^3$/ }).click();
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
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length === 2,
    null,
    { timeout: 10000 },
  );
  assert((await host.locator('.peer-chip.online').count()) === 2, 'host should list two people');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.felt', { timeout: 10000 });
  await host.waitForSelector('.felt', { timeout: 10000 });
  assert((await host.locator('.seat').count()) === 3, 'host table should have three seats');
  assert((await guest.locator('.seat').count()) === 3, 'guest table should have three seats');

  const hostHand = await handIds(host);
  const guestHand = await handIds(guest);
  assert(hostHand.length > 0 && guestHand.length > 0, 'both LAN hands should be dealt');
  assert(
    hostHand.every((id) => !guestHand.includes(id)),
    'each LAN seat must receive only its own hand',
  );

  let actions = 0;
  for (let step = 0; step < 40 && actions < 4; step += 1) {
    if (await host.locator('.result-panel').count()) break;
    const hostActed = await takeTurn(host, 0);
    if (hostActed) actions += 1;
    const guestActed = await takeTurn(guest, 1);
    if (guestActed) actions += 1;
    await host.waitForTimeout(420);
  }
  assert(actions >= 3, `LAN turns did not advance, ${actions} actions`);
  assert(
    (await guest.locator('.trick-copy').innerText()).length > 0,
    'guest did not receive the live trick',
  );

  // Reloading a guest reconnects the same seat and receives the current private view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.felt', { timeout: 10000 });
  await host.waitForTimeout(500);
  assert((await guest.locator('.seat').count()) === 3, 'reconnected guest should see the table');
  assert((await guest.locator('.hand .playing-card').count()) > 0, 'reconnected guest should see its hand');

  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — host room, invite, guest join, 3-seat table, private hands, live turns, reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
