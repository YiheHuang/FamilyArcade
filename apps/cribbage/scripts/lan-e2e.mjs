import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const HOST_BASE = process.env.BASE_URL || 'http://localhost:5211';
const RELAY = 'http://localhost:8080';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitForRelay(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(RELAY);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

let relay = null;
try {
  await access('dist/index.html');
  relay = spawn(process.execPath, ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', '8080'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (!(await waitForRelay())) {
    throw new Error('LAN relay did not start on :8080');
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage();
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host: ${message.text()}`);
  });
  host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
  await host.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.cribbage.save');
    localStorage.removeItem('familyarcade.cribbage.record');
  });
  await host.goto(`${HOST_BASE}/?deal=555`, { waitUntil: 'networkidle' });

  const openRoom = async (name, seats) => {
    await host.getByRole('button', { name: /LAN table/ }).click();
    await host.locator('.host-card input').fill(name);
    if (seats !== 2) {
      await host.locator('.segmented.compact button').nth(seats - 2).click();
    }
    await host.getByRole('button', { name: /Open the room/ }).click();
    await host.waitForSelector('.room-code.big', { timeout: 10000 });
    const code = (await host.locator('.room-code.big').innerText()).trim();
    const invite = await host.locator('.invite-link').getAttribute('href');
    assert(invite && invite.includes(`lan=${code}`), 'invite URL missing');
    return { code, invite };
  };

  const { invite } = await openRoom('Host', 2);
  const guestContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const guest = await guestContext.newPage();
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest: ${message.text()}`);
  });
  guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length >= 2,
    null,
    { timeout: 12000 },
  );

  await host.getByRole('button', { name: /Start the game/ }).click();
  await host.waitForSelector('.phase-chip');
  await guest.waitForSelector('.phase-chip');
  assert((await guest.locator('.hand .playing-card').count()) === 6, 'guest hand not dealt');
  assert(
    (await guest.locator('.crib-slot .card-back').count()) === 0,
    'guest saw the crib before the show',
  );

  for (let index = 0; index < 2; index += 1) {
    await host.locator('.hand .playing-card').nth(index).click();
  }
  await host.getByRole('button', { name: /Send to crib/ }).click();
  await guest.waitForTimeout(300);
  assert((await guest.locator('.hand .playing-card').count()) === 6, 'guest view did not update');
  for (let index = 0; index < 2; index += 1) {
    await guest.locator('.hand .playing-card').nth(index).click();
  }
  await guest.getByRole('button', { name: /Send to crib/ }).click();
  await host.waitForSelector('.cut-stage');
  await host.getByRole('button', { name: /Cut the deck/ }).click();
  await host.waitForTimeout(250);
  const hostLegal = host.locator('.hand .playing-card:not(.is-dim)');
  assert((await hostLegal.count()) > 0, 'host has no legal peg card');
  await hostLegal.first().click();
  await guest.waitForTimeout(350);
  assert((await guest.locator('.peg-lane .playing-card').count()) === 1, 'guest missed the pegged card');
  assert((await guest.locator('.hand .playing-card').count()) === 4, 'guest hand count changed wrongly');

  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.hand', { timeout: 12000 });
  assert((await guest.locator('.hand .playing-card').count()) === 4, 'guest did not reconnect to the seat');

  // A four-seat room proves the host sends a separate view to every seat.
  await guestContext.close();
  await hostContext.close();
  const fourContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const hostFour = await fourContext.newPage();
  hostFour.on('pageerror', (error) => errors.push(`host4: ${String(error)}`));
  await hostFour.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await hostFour.goto(`${HOST_BASE}/?deal=999`, { waitUntil: 'networkidle' });
  await hostFour.getByRole('button', { name: /LAN table/ }).click();
  await hostFour.locator('.host-card input').fill('Host');
  await hostFour.locator('.segmented.compact button').nth(2).click();
  await hostFour.getByRole('button', { name: /Open the room/ }).click();
  await hostFour.waitForSelector('.room-code.big', { timeout: 10000 });
  const fourInvite = await hostFour.locator('.invite-link').getAttribute('href');
  const guests = [];
  for (const name of ['Ann', 'Ben', 'Cara']) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name}: ${String(error)}`));
    await page.goto(fourInvite.replace('name=Guest', `name=${name}`), { waitUntil: 'networkidle' });
    guests.push(page);
  }
  await hostFour.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length >= 4,
    null,
    { timeout: 15000 },
  );
  await hostFour.getByRole('button', { name: /Start the game/ }).click();
  await hostFour.waitForTimeout(500);
  assert((await hostFour.locator('.hand .playing-card').count()) === 5, '4-seat host hand missing');
  for (const page of guests) {
    assert((await page.locator('.hand .playing-card').count()) === 5, '4-seat guest hand missing');
  }
  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('LAN E2E OK — 2-player host/guest, per-seat views, reconnect, 4-seat room');
} finally {
  if (relay) relay.kill();
}
