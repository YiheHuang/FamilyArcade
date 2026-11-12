import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19024);
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

async function ownDice(page) {
  return page.locator('.dice-tray .die').evaluateAll((els) =>
    els.map((element) => Number(element.getAttribute('data-value'))),
  );
}

async function currentBid(page) {
  const node = page.getByTestId('current-bid');
  if (!(await node.count())) return null;
  return {
    quantity: await node.getAttribute('data-quantity'),
    face: await node.getAttribute('data-face'),
  };
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

  await host.getByTestId('start-lan').click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.locator('.host-card .segment').filter({ hasText: /^3$/ }).click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on relay port, got ${invite}`);

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
  await guest.waitForSelector('.waiting-card', { timeout: 15000 });
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length === 2,
    null,
    { timeout: 15000 },
  );
  assert((await host.locator('.peer-chip.online').count()) === 2, 'host should list two people');

  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  await guest.waitForSelector('.game-shell', { timeout: 15000 });
  assert((await host.locator('.seat-card').count()) === 3, 'host table should have three seats');
  assert((await guest.locator('.seat-card').count()) === 3, 'guest table should have three seats');

  const hostHand = await ownDice(host);
  const guestHand = await ownDice(guest);
  assert(hostHand.length === 5, `host should see its own five dice, got ${hostHand.length}`);
  assert(guestHand.length === 5, `guest should see its own five dice, got ${guestHand.length}`);
  assert((await host.locator('.dice-tray').count()) === 1, 'host should render one private dice tray');
  assert((await guest.locator('.dice-tray').count()) === 1, 'guest should render one private dice tray');

  // Host opens 1×2; the guest sees the public bid and takes the next turn.
  await host.getByTestId('face-2').click();
  await host.getByTestId('raise').click();
  await guest.waitForFunction(() => {
    const node = document.querySelector('[data-testid="current-bid"]');
    return node?.getAttribute('data-quantity') === '1' && node?.getAttribute('data-face') === '2';
  }, null, { timeout: 10000 });
  const guestSees = await currentBid(guest);
  assert(guestSees?.quantity === '1' && guestSees?.face === '2', 'guest did not receive the host bid');

  // Guest raises to 1×3; the AI seat 2 then acts and the host gets the turn.
  await guest.getByTestId('face-3').click();
  await guest.getByTestId('raise').click();
  await host.waitForFunction(() => {
    const node = document.querySelector('[data-testid="current-bid"]');
    return node?.getAttribute('data-quantity') === '1' && node?.getAttribute('data-face') === '3';
  }, null, { timeout: 10000 });

  await host.waitForFunction(() => {
    const shell = document.querySelector('.game-shell');
    const phase = shell?.getAttribute('data-phase');
    return phase === 'reveal' || shell?.getAttribute('data-turn') === '0';
  }, null, { timeout: 15000 });

  const hostPhase = await host.locator('.game-shell').getAttribute('data-phase');
  if (hostPhase === 'bidding') {
    await host.getByTestId('challenge').click();
  }
  await guest.waitForSelector('[data-testid="reveal-panel"]', { timeout: 15000 });
  assert((await guest.locator('.reveal-seat').count()) === 3, 'guest reveal should show three cups');
  const guestRevealDice = await guest.locator('.reveal-seat .die').count();
  assert(guestRevealDice >= 10, 'guest reveal should show the public dice');
  await host.getByTestId('next-round').click();
  await guest.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'bidding',
    null,
    { timeout: 10000 },
  );

  // A reloaded guest reconnects the same seat and gets a fresh private view.
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.game-shell', { timeout: 15000 });
  assert((await guest.locator('.seat-card').count()) === 3, 'reconnected guest should see the table');
  const reconnected = await ownDice(guest);
  assert(reconnected.length === 5 || reconnected.length === 4, 'reconnected guest should see its own dice');
  assert((await guest.locator('.dice-tray').count()) === 1, 'reconnected guest should render one dice tray');

  await host.getByRole('button', { name: /Home/ }).click();
  await guest.waitForSelector('.error', { timeout: 8000 });
  const closed = await guest.locator('.error').innerText();
  assert(/closed the room|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — host room on assigned port, invite, guest join, 3-seat table, private dice trays, bid sync, guest turn, AI seat, challenge reveal, next round, guest reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
