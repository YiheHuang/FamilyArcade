import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { GAME_SEQUENCE } from './sequence.mjs';

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

const hex = (q, r) => `.hex[data-key="${q},${r}"]`;
const hand = (player, kind) => `.hand-piece[data-kind="${kind}"][data-player="${player}"]`;

async function move(page, moveValue, index) {
  const player = index % 2 === 0 ? 'W' : 'B';
  if (moveValue.type === 'place') {
    await page.locator(hand(player, moveValue.kind)).click();
    await page.waitForTimeout(25);
    await page.locator(hex(moveValue.at.q, moveValue.at.r)).click();
  } else {
    await page.locator(hex(moveValue.from.q, moveValue.from.r)).click();
    await page.waitForTimeout(25);
    await page.locator(hex(moveValue.to.q, moveValue.to.r)).click();
  }
  await page.waitForTimeout(220);
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

  await host.getByRole('button', { name: /Play on this network/ }).click();
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

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.hive-board', { timeout: 10000 });
  assert((await guest.locator('.piece-layer').count()) === 0, 'guest board should start empty');

  // A full 44-move LAN game. Host is Amber, guest is Onyx.
  for (let index = 0; index < GAME_SEQUENCE.length; index += 1) {
    const side = index % 2 === 0 ? host : guest;
    await move(side, GAME_SEQUENCE[index], index);
  }

  await guest.waitForSelector('.result-banner', { timeout: 8000 });
  const guestBanner = await guest.locator('.result-banner').innerText();
  assert(guestBanner.includes('Amber wins'), `guest should see Amber win, got: ${guestBanner}`);
  assert((await guest.locator('.result-banner button').count()) === 0, 'guest result must not restart locally');
  assert((await host.locator('.result-banner button').count()) === 1, 'host should own the restart button');

  const hostRecord = await host.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.hive.record') || '{"games":0}'),
  );
  assert(hostRecord.games === 1 && hostRecord.byMode?.lan === 1, 'host should record the LAN result');
  const guestRecord = await guest.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.hive.record') || '{"games":0}'),
  );
  assert(guestRecord.games === 0, 'guest must not write to the host record');

  await host.getByRole('button', { name: /Play again/ }).click();
  await guest.waitForTimeout(700);
  assert((await guest.locator('.result-banner').count()) === 0, 'guest banner should clear after restart');
  assert((await guest.locator('.piece-layer').count()) === 0, 'guest board should reset after restart');

  // Reloading a guest reconnects the same seat and the host sends the live view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.hive-board', { timeout: 12000 });
  await host.waitForTimeout(700);
  assert((await guest.locator('.piece-layer').count()) === 0, 'reconnected guest should receive the empty board');
  await move(host, GAME_SEQUENCE[0], 0);
  await guest.waitForTimeout(600);
  assert((await guest.locator('.piece-layer').count()) === 1, 'reconnected guest should receive host moves');

  // Closing the room returns the guest to the join panel with an honest message.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 6000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|host closed|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host, invite, guest, full live game, result, host-only record, restart, reconnect, close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
