import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19022);
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
    if (relayExited) throw new Error(`LAN relay stopped before listening on ${BASE}\n${relayLog}`);
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
  const turnSeat = await page.locator('.seat.is-turn').getAttribute('data-seat').catch(() => null);
  if (Number(turnSeat) !== seat) return false;
  const pass = page.locator('.pass-button');
  if (await pass.isEnabled().catch(() => false)) {
    await pass.click();
    await page.waitForTimeout(280);
    return true;
  }
  const d3 = page.locator('.hand .playing-card[data-card="D3"]');
  const card = (await d3.count()) > 0 ? d3.first() : page.locator('.hand .playing-card').first();
  await card.click();
  await page.locator('.play-button').click();
  await page.waitForTimeout(280);
  return true;
}

let browser;
const contexts = [];
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  host.on('pageerror', (error) => errors.push(`host: ${error}`));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
  });
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await host.goto(BASE, { waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /Wi-Fi table/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 12000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on the relay port, got ${invite}`);

  const guests = [];
  const guestNames = ['Ana', 'Ben', 'Cleo'];
  for (let index = 0; index < guestNames.length; index += 1) {
    const context = await browser.newContext({
      viewport: index === 2 ? { width: 390, height: 844 } : { width: 1024, height: 800 },
      isMobile: index === 2,
      hasTouch: index === 2,
      deviceScaleFactor: index === 2 ? 2 : 1,
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`guest ${index + 1}: ${error}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`guest ${index + 1} console: ${message.text()}`);
    });
    await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
    const url = new URL(invite);
    url.searchParams.set('name', guestNames[index]);
    await page.goto(url.toString(), { waitUntil: 'networkidle' });
    await page.waitForSelector('.waiting-card', { timeout: 12000 });
    guests.push(page);
  }

  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length === 4,
    null,
    { timeout: 12000 },
  );
  assert((await host.locator('.peer-chip.online').count()) === 4, 'host should list four people');
  assert((await host.locator('.peer-list').innerText()).includes('Cleo'), 'guest name missing');

  await host.getByRole('button', { name: /Start the game/ }).click();
  await host.waitForSelector('.felt', { timeout: 12000 });
  for (const guest of guests) await guest.waitForSelector('.felt', { timeout: 12000 });

  assert((await host.locator('.seat').count()) === 4, 'host table should have four seats');
  for (const guest of guests) {
    assert((await guest.locator('.seat').count()) === 4, 'guest table should have four seats');
  }

  const hands = [await handIds(host)];
  for (const guest of guests) hands.push(await handIds(guest));
  for (let index = 0; index < hands.length; index += 1) {
    assert(hands[index].length === 13, `seat ${index} should hold thirteen cards`);
  }
  const all = hands.flat();
  assert(new Set(all).size === 52, 'four LAN seats should hold the whole deck exactly once');
  for (let a = 0; a < hands.length; a += 1) {
    for (let b = a + 1; b < hands.length; b += 1) {
      assert(hands[a].every((id) => !hands[b].includes(id)), 'LAN hands must not overlap');
    }
  }

  let actions = 0;
  for (let step = 0; step < 60 && actions < 10; step += 1) {
    if (await host.locator('.result-panel').count()) break;
    const acted = await takeTurn(host, 0);
    if (acted) actions += 1;
    for (let index = 0; index < guests.length; index += 1) {
      const guestActed = await takeTurn(guests[index], index + 1);
      if (guestActed) actions += 1;
    }
    await host.waitForTimeout(180);
  }
  assert(actions >= 4, `LAN turns did not advance, ${actions} actions`);
  assert(
    (await guests[0].locator('.trick-copy').innerText()).length > 0,
    'guest did not receive the live trick',
  );

  // Reloading a guest reconnects the same token and receives its private view.
  await guests[0].reload({ waitUntil: 'networkidle' });
  await guests[0].waitForSelector('.felt', { timeout: 12000 });
  await host.waitForTimeout(600);
  assert((await guests[0].locator('.seat').count()) === 4, 'reconnected guest should see four seats');
  assert((await guests[0].locator('.hand .playing-card').count()) > 0, 'reconnected guest should see its hand');
  assert(
    (await guests[0].locator('.hand .playing-card').count()) <= 13,
    'reconnected guest hand is impossible',
  );

  await host.getByRole('button', { name: /Home/ }).click();
  await guests[0].waitForSelector('.error', { timeout: 8000 });
  const closed = await guests[0].locator('.error').innerText();
  assert(/closed the room|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — host room, invite, three guests, four seats, 52 unique private cards, live turns, reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
