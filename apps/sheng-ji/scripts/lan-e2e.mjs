import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19023);
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

async function handIds(page) {
  return page.locator('.hand .playing-card').evaluateAll((els) =>
    els.map((element) => element.getAttribute('data-card')),
  );
}

async function hostTurn(host) {
  if (!(await host.locator('.turn-medallion.live').count())) return false;
  const hint = host.locator('.hint-button');
  if (!(await hint.isEnabled().catch(() => false))) return false;
  await hint.click();
  await host.waitForTimeout(100);
  if (await host.locator('.declare-option.hinted').count()) {
    await host.locator('.declare-option.hinted').first().click();
  } else if (await host.locator('.declare-panel').count()) {
    await host.locator('.pass-declare-button').click();
  } else if (
    (await host.locator('.bury-panel').count()) > 0 &&
    (await host.locator('.bury-button').isEnabled().catch(() => false))
  ) {
    await host.locator('.bury-button').click();
  } else if (
    (await host.locator('.play-button').count()) > 0 &&
    (await host.locator('.play-button').isEnabled().catch(() => false))
  ) {
    await host.locator('.play-button').click();
  } else {
    return false;
  }
  await host.waitForTimeout(280);
  return true;
}

async function guestTurn(guest) {
  if (!(await guest.locator('.turn-medallion.live').count())) return false;
  if (await guest.locator('.declare-panel').count()) {
    if (await guest.locator('.declare-option').count()) {
      await guest.locator('.declare-option').first().click();
    } else if (await guest.locator('.pass-declare-button').count()) {
      await guest.locator('.pass-declare-button').click();
    } else {
      return false;
    }
  } else if (await guest.locator('.bury-panel').count()) {
    const cards = guest.locator('.hand .playing-card');
    const count = await cards.count();
    if (count < 8) return false;
    for (let index = 0; index < 8; index += 1) await cards.nth(index).click();
    if (!(await guest.locator('.bury-button').isEnabled().catch(() => false))) return false;
    await guest.locator('.bury-button').click();
  } else if (await guest.locator('.play-button').count()) {
    const legal = guest.locator('.hand .playing-card[data-legal="true"]');
    const count = await legal.count();
    if (count === 0) return false;
    for (let index = 0; index < Math.min(count, 4); index += 1) {
      await legal.nth(index).click();
      if (await guest.locator('.play-button').isEnabled().catch(() => false)) {
        await guest.locator('.play-button').click();
        await guest.waitForTimeout(280);
        return true;
      }
    }
    await guest.locator('.clear-button').click();
    return false;
  } else {
    return false;
  }
  await guest.waitForTimeout(280);
  return true;
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  host.setDefaultTimeout(12000);
  host.on('pageerror', (error) => errors.push(`host: ${error}`));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
  });
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await host.goto(BASE, { waitUntil: 'domcontentloaded' });

  await host.getByRole('button', { name: /Wi-Fi table/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 12000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on the relay port, got ${invite}`);

  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  guest.setDefaultTimeout(12000);
  guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
  });
  await guest.goto(invite, { waitUntil: 'domcontentloaded' });
  await guest.waitForSelector('.waiting-card', { timeout: 12000 });
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length === 2,
    null,
    { timeout: 12000 },
  );
  assert((await host.locator('.peer-chip.online').count()) === 2, 'host should list two people');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.felt', { timeout: 12000 });
  await host.waitForSelector('.felt', { timeout: 12000 });
  assert((await host.locator('.seat-badge').count()) === 4, 'host table should have four seats');
  assert((await guest.locator('.seat-badge').count()) === 4, 'guest table should have four seats');

  const hostHand = await handIds(host);
  const guestHand = await handIds(guest);
  assert(hostHand.length > 0 && guestHand.length > 0, 'both LAN hands should be dealt');
  assert(
    hostHand.every((id) => !guestHand.includes(id)),
    'each LAN seat must receive only its own hand',
  );

  let actions = 0;
  for (let step = 0; step < 80 && actions < 5; step += 1) {
    if (await host.locator('.result-panel').count()) break;
    const hostActed = await hostTurn(host);
    if (hostActed) actions += 1;
    const guestActed = await guestTurn(guest);
    if (guestActed) actions += 1;
    if (!hostActed && !guestActed) await host.waitForTimeout(260);
  }
  assert(actions >= 3, `LAN turns did not advance, ${actions} actions`);
  assert((await guest.locator('.trick-area').innerText()).length > 0, 'guest did not receive the live trick');
  assert(
    (await guest.locator('.turn-bar').innerText()).length > 0,
    'guest did not receive a live turn bar',
  );

  // Reloading a guest reconnects the same seat and receives the current private view.
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await guest.waitForSelector('.felt', { timeout: 12000 });
  await host.waitForTimeout(700);
  assert((await guest.locator('.seat-badge').count()) === 4, 'reconnected guest should see the table');
  assert((await guest.locator('.hand .playing-card').count()) > 0, 'reconnected guest should see its hand');
  assert(
    (await host.locator('.seat-badge').count()) === 4,
    'host table should survive a guest reload',
  );

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);

  await host.locator('.game-top .back').click();
  await guest.waitForSelector('.error', { timeout: 8000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  console.log(
    `LAN E2E OK — port ${PORT}, host room, invite, guest join, four seats, private hands, ${actions} live actions, reconnect, host close`,
  );
} finally {
  if (browser) await browser.close().catch(() => undefined);
  relay.kill();
}
process.exit(0);
