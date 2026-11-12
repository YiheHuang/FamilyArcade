import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19016);
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

async function handIds(page) {
  return page.locator('.hand .playing-card').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-card-id')).filter(Boolean),
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
  await host.getByTestId('start-lan').click();
  await host.getByTestId('host-name').fill('Mira');
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const code = (await host.locator('.room-code.big').innerText()).trim();
  assert(/^\d{4}$/.test(code), `room code should be four digits, got ${code}`);
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should use the relay port, got ${invite}`);
  console.log('room', code, invite);

  const guestOne = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  watch(guestOne, 'guest1');
  await guestOne.goto(invite, { waitUntil: 'networkidle' });
  await guestOne.getByTestId('guest-name').fill('Ana');
  await guestOne.getByTestId('guest-join').click();
  await guestOne.waitForSelector('.waiting-card', { timeout: 10000 });

  const guestTwo = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(guestTwo, 'guest2');
  await guestTwo.goto(invite, { waitUntil: 'networkidle' });
  await guestTwo.getByTestId('guest-name').fill('Ben');
  await guestTwo.getByTestId('guest-join').click();
  await guestTwo.waitForSelector('.waiting-card', { timeout: 10000 });

  await host.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lan-start"]');
    return button && !button.disabled;
  }, null, { timeout: 15000 });
  assert((await host.locator('.peer-chip').count()) === 3, 'host should list three seats');
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  await guestOne.waitForSelector('.game-shell', { timeout: 15000 });
  await guestTwo.waitForSelector('.game-shell', { timeout: 15000 });
  await host.waitForSelector('[data-testid="bid-3"]', { timeout: 15000 });

  const hands = [await handIds(host), await handIds(guestOne), await handIds(guestTwo)];
  assert(hands.every((hand) => hand.length === 17), `each bid hand should be 17, got ${hands.map((hand) => hand.length).join('/')}`);
  for (let a = 0; a < hands.length; a += 1) {
    for (let b = a + 1; b < hands.length; b += 1) {
      const overlap = hands[a].filter((card) => hands[b].includes(card));
      assert(overlap.length === 0, `hands ${a} and ${b} overlap: ${overlap.join(',')}`);
    }
  }
  assert((await guestOne.locator('.bottom-cards [data-card-id]').count()) === 0, 'guest received the hidden bottom cards');

  // Reconnecting guest keeps its own seat view.
  await guestOne.reload({ waitUntil: 'networkidle' });
  await guestOne.getByTestId('guest-join').click();
  await guestOne.waitForSelector('.game-shell', { timeout: 15000 });
  const reconnected = await handIds(guestOne);
  assert(reconnected.length === 17, 'reconnected guest should receive its hand');

  await host.getByTestId('bid-3').click();
  await host.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'playing',
    null,
    { timeout: 15000 },
  );
  await guestOne.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'playing',
    null,
    { timeout: 15000 },
  );
  assert((await host.locator('.hand .playing-card').count()) === 20, 'host landlord should hold 20 cards');

  // Host leads a single, then both guests pass; the trick resets to the host.
  await host.locator('.hand .playing-card').first().click();
  await host.getByTestId('play').click();
  await guestOne.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '1',
    null,
    { timeout: 15000 },
  );
  await guestTwo.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '1',
    null,
    { timeout: 15000 },
  );
  await guestOne.getByTestId('pass').click();
  await guestTwo.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '2',
    null,
    { timeout: 15000 },
  );
  await guestTwo.getByTestId('pass').click();
  await host.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '0' &&
      !document.querySelector('.trick-cards'),
    null,
    { timeout: 15000 },
  );
  assert((await host.locator('.hand .playing-card').count()) === 19, 'host should have played exactly one single');

  // Closing the room returns both guests to the join screen with an honest message.
  await host.locator('.game-top .back').click();
  await guestOne.waitForSelector('.error', { timeout: 10000 });
  await guestTwo.waitForSelector('.error', { timeout: 10000 });
  assert(/closed the room|host closed/i.test(await guestOne.locator('.error').innerText()), 'guest 1 should see the room closed');
  assert(/closed the room|host closed/i.test(await guestTwo.locator('.error').innerText()), 'guest 2 should see the room closed');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — relay port, host + 2 guests, disjoint hands, hidden bottom, reconnect, host lead, two passes, room close');
} finally {
  if (browser) await browser.close();
  relay.kill();
  await new Promise((resolve) => setTimeout(resolve, 250));
}
