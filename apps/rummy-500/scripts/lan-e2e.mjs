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

async function handLabels(page) {
  return page.locator('.hand-scroll .playing-card').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const watch = (page, tag) => {
    page.on('pageerror', (error) => errors.push(`${tag}: ${error}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${tag} console: ${message.text()}`);
    });
  };

  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(host, 'host');
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByRole('button', { name: /LAN night/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 10000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should use the relay port, got ${invite}`);

  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  watch(guest, 'guest');
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.waiting-card', { timeout: 10000 });
  await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
  assert((await host.locator('.peer-chip').count()) === 2, 'host should list two seats');

  await host.getByRole('button', { name: /Deal the cards/ }).click();
  await guest.waitForSelector('.table-stage', { timeout: 10000 });

  assert((await host.locator('.hand-scroll .playing-card').count()) === 13, 'host should hold 13 cards');
  assert((await guest.locator('.hand-scroll .playing-card').count()) === 13, 'guest should hold 13 cards');
  const hostHand = await handLabels(host);
  const guestHand = await handLabels(guest);
  assert(hostHand.every((card) => !guestHand.includes(card)), 'guest view leaked a host card');

  await host.locator('.stock-pile').click();
  await host.waitForTimeout(250);
  assert((await host.locator('.hand-scroll .playing-card').count()) === 14, 'host draw failed');
  assert((await guest.locator('.turn-panel strong').innerText()).includes('Mira'), 'guest should see the host turn');
  await host.locator('.hand-scroll .playing-card').first().click();
  await host.getByRole('button', { name: 'Discard', exact: true }).click();
  await guest.waitForFunction(
    () => document.querySelector('.turn-panel strong')?.textContent?.includes('Your turn'),
    null,
    { timeout: 8000 },
  );
  await guest.locator('.stock-pile').click();
  await guest.waitForTimeout(700);
  assert((await guest.locator('.hand-scroll .playing-card').count()) === 14, 'guest draw failed');
  await guest.locator('.hand-scroll .playing-card').first().click();
  await guest.getByRole('button', { name: 'Discard', exact: true }).click();
  await host.waitForFunction(
    () => document.querySelector('.turn-panel strong')?.textContent?.includes('Your turn'),
    null,
    { timeout: 8000 },
  );

  // A reloading guest reclaims the same seat and receives the live view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.table-stage', { timeout: 10000 });
  assert((await guest.locator('.hand-scroll .playing-card').count()) === 13, 'reconnected guest should receive its hand');
  assert((await guest.locator('.turn-panel strong').innerText()).length > 0, 'reconnected guest should see the turn');

  // Closing the room returns the guest to the join card with an honest error.
  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 6000 });
  assert(/closed the room|host closed/i.test(await guest.locator('.error').innerText()), 'guest should see the room closed');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — room, invite, guest join, private hands, live turns, reconnect, host close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
