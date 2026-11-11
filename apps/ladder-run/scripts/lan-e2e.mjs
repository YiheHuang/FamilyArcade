import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForRelay(port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(150);
  }
  throw new Error('LAN relay did not start (run npm run build first)');
}

const port = await freePort();
const relay = spawn(process.execPath, ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(port)], {
  cwd: process.cwd(),
  stdio: 'ignore',
  windowsHide: true,
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let hostContext;
let guestContext;

try {
  await waitForRelay(port);
  hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await hostContext.newPage();
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host: ${message.text()}`);
  });
  host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
  await hostContext.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));

  const base = `http://localhost:${port}`;
  await host.goto(`${base}/?lanPort=${port}`, { waitUntil: 'domcontentloaded' });
  await host.getByTestId('play-lan').waitFor();
  await host.getByTestId('play-lan').click();
  await host.getByTestId('setup-begin').click();
  await host.locator('.qr-card code').waitFor();
  assert(await host.getByTestId('lan-start').isDisabled(), 'start should wait for a guest');

  const invite = await host.locator('.qr-card code').innerText();
  guestContext = await browser.newContext({ viewport: { width: 780, height: 900 } });
  const guest = await guestContext.newPage();
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest: ${message.text()}`);
  });
  guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
  await guestContext.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await guest.goto(`http://${invite}`, { waitUntil: 'domcontentloaded' });
  await guest.getByTestId('guest-join').waitFor();
  await guest.getByTestId('guest-join').click();
  await host.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lan-start"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert((await guest.locator('.lan-waiting').innerText()).includes('TEAL'), 'guest did not receive the teal seat');

  await host.getByTestId('lan-start').click();
  await host.locator('.game-shell').waitFor();
  await guest.locator('.game-shell').waitFor();
  assert((await guest.locator('.turn-bar').innerText()).includes("Host's turn"), 'guest did not see the host turn');

  await host.getByTestId('roll-button').click();
  await host.waitForTimeout(700);
  assert((await guest.locator('.last-card').innerText()).includes('Host rolled'), 'guest did not receive the host roll');
  assert(!(await guest.getByTestId('roll-button').isDisabled()), 'guest should be allowed to roll');

  await guest.getByTestId('roll-button').click();
  await host.waitForTimeout(700);
  assert((await host.locator('.last-card').innerText()).includes('Guest rolled'), 'host did not receive the guest intent');

  // Guest leaves on its turn: host may finish the roll for the absent seat.
  await host.getByTestId('roll-button').click();
  await host.waitForTimeout(700);
  await guestContext.close();
  guestContext = null;
  await host.waitForTimeout(900);
  assert((await host.getByTestId('roll-button').innerText()).includes('Roll for Guest'), 'host did not offer a rescue roll');
  await host.getByTestId('roll-button').click();
  await host.waitForTimeout(700);
  assert((await host.locator('.last-card').innerText()).includes('Guest rolled'), 'rescue roll did not advance the guest');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host lobby, guest join, start, host roll, guest intent, disconnect rescue');
} finally {
  await guestContext?.close().catch(() => undefined);
  await hostContext?.close().catch(() => undefined);
  await browser.close();
  relay.kill();
}
