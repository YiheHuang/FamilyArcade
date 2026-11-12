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

  await host.locator('[data-nav=lan]').click();
  await host.locator('[data-lan=host-name]').fill('Mira');
  await host.locator('[data-action=create-room]').click();
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

  await host.locator('[data-action=start-lan]').click();
  await guest.waitForSelector('.board', { timeout: 10000 });
  assert((await guest.locator('.cell').count()) === 16, 'guest board should have sixteen cells');

  // Host P1 chooses 0; guest P2 places 0. Guest chooses 2; host places 1.
  // Host chooses 4; guest places 2. Guest chooses 6; host places 3 and wins.
  await host.locator('.piece-slot[data-piece="0"]').click();
  await guest.waitForTimeout(300);
  await guest.locator('.cell[data-cell="0"]').click();
  await guest.waitForTimeout(300);
  await guest.locator('.piece-slot[data-piece="2"]').click();
  await host.waitForTimeout(300);
  await host.locator('.cell[data-cell="1"]').click();
  await host.waitForTimeout(300);
  await host.locator('.piece-slot[data-piece="4"]').click();
  await guest.waitForTimeout(300);
  await guest.locator('.cell[data-cell="2"]').click();
  await guest.waitForTimeout(300);
  await guest.locator('.piece-slot[data-piece="6"]').click();
  await host.waitForTimeout(300);
  await host.locator('.cell[data-cell="3"]').click();
  await host.waitForTimeout(500);

  await guest.waitForSelector('.result-banner', { timeout: 5000 });
  const guestBanner = await guest.locator('.result-banner').innerText();
  assert(
    guestBanner.includes('Player 1 wins'),
    `guest should see Player 1 win, got: ${guestBanner}`,
  );
  assert(
    (await guest.locator('.result-banner button').count()) === 0,
    'guest result banner must not offer a local restart',
  );
  assert(
    (await host.locator('.result-banner button').count()) >= 1,
    'host should own the restart button',
  );

  const hostRecord = await host.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.quarto.record') || '{"games":0}'),
  );
  assert(hostRecord.games === 1 && hostRecord.byMode?.lan === 1, 'host should record the LAN result');
  assert(hostRecord.winsP1 === 1, 'host should record Player 1 win');
  const guestRecord = await guest.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.quarto.record') || '{"games":0}'),
  );
  assert(guestRecord.games === 0, 'guest must not write to the host record');

  await host.locator('[data-action=restart]').click();
  await guest.waitForTimeout(600);
  assert((await guest.locator('.result-banner').count()) === 0, 'guest banner should clear after host restart');
  assert((await guest.locator('.cell .piece').count()) === 0, 'guest board should reset after host restart');

  // Reloading a guest reconnects the same seat and the host resends the live view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 10000 });
  await host.waitForTimeout(500);
  assert((await guest.locator('.cell .piece').count()) === 0, 'reconnected guest should receive the current board');
  await host.locator('.piece-slot[data-piece="0"]').click();
  await guest.waitForTimeout(500);
  await guest.locator('.cell[data-cell="0"]').click();
  await host.waitForTimeout(400);
  assert((await host.locator('.cell[data-cell="0"] .piece').count()) === 1, 'host should receive guest placement');

  // Closing the room returns the guest to the join panel with an honest message.
  await host.locator('[data-action=home]').click();
  await guest.waitForSelector('.error', { timeout: 5000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host room, invite, guest join, live actions, guest-locked result, restart, reconnect, host close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
