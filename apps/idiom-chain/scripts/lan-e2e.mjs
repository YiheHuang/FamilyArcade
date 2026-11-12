import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.LAN_PORT || 19025);
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) throw new Error(message);
};

async function serverUp() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(900) });
    return response.ok;
  } catch {
    return false;
  }
}

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
    if (!sessionStorage.getItem('idiom-chain.lan.ready')) {
      localStorage.removeItem('familyarcade.idiom-chain.save');
      localStorage.removeItem('familyarcade.idiom-chain.record');
      sessionStorage.setItem('idiom-chain.lan.ready', '1');
    }
  });
}

let relay = null;
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

try {
  await access(path.resolve('dist/index.html'));
} catch {
  console.error('LAN E2E needs a build first: run npm run build (or npm run check).');
  process.exit(1);
}

if (!(await serverUp())) {
  relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
    { stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await serverUp()) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!(await serverUp())) {
    relay.kill();
    console.error(`LAN relay did not start on :${PORT}`);
    process.exit(1);
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(host, 'host');
  await prepare(host);
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByTestId('start-lan').click();
  await host.getByTestId('lan-seats-3').click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('[data-testid="lan-room-code"]', { timeout: 15000 });
  const code = (await host.getByTestId('lan-room-code').innerText()).trim();
  assert(/^\d{4}$/.test(code), `bad room code: ${code}`);
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(Boolean(invite && invite.includes(`code=${code}`)), `bad invite: ${invite}`);
  console.log('room', code, invite);

  const makeGuest = async (name, label) => {
    const page = await browser.newPage({ viewport: { width: 980, height: 860 } });
    watch(page, label);
    await prepare(page);
    await page.goto(invite, { waitUntil: 'networkidle' });
    await page.getByTestId('lan-name').fill(name);
    await page.getByTestId('lan-join').click();
    await page.waitForSelector('[data-testid="guest-waiting"], .game-shell', { timeout: 15000 });
    return page;
  };

  const mia = await makeGuest('Mia', 'mia');
  const ben = await makeGuest('Ben', 'ben');
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-list .online').length >= 3,
    null,
    { timeout: 12000 },
  );
  assert(await host.getByTestId('lan-start').isEnabled(), 'host start button did not enable');
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  await mia.waitForSelector('.game-shell', { timeout: 15000 });
  await ben.waitForSelector('.game-shell', { timeout: 15000 });

  assert((await host.locator('.game-shell').getAttribute('data-mode')) === 'lan-host', 'host mode missing');
  assert((await mia.locator('.game-shell').getAttribute('data-mode')) === 'lan-guest', 'guest mode missing');
  assert((await ben.locator('.game-shell').getAttribute('data-mode')) === 'lan-guest', 'second guest mode missing');
  assert((await host.locator('.game-shell').getAttribute('data-turn')) === '0', 'host did not start');
  assert((await host.locator('.game-shell').getAttribute('data-can-play')) === 'true', 'host cannot play the opener');
  assert((await mia.locator('.game-shell').getAttribute('data-can-play')) === 'false', 'guest 1 played out of turn');
  assert((await ben.locator('.game-shell').getAttribute('data-can-play')) === 'false', 'guest 2 played out of turn');

  // Host opens the chain.
  await host.getByTestId('idiom-input').fill('一心一意');
  await host.getByTestId('idiom-input').press('Enter');
  await mia.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '1',
    null,
    { timeout: 10000 },
  );
  assert((await mia.locator('.game-shell').getAttribute('data-can-play')) === 'true', 'guest 1 did not get the turn');
  assert((await ben.locator('.game-shell').getAttribute('data-can-play')) === 'false', 'guest 2 can play early');
  assert((await host.locator('.chain-entry').count()) === 1, 'host chain did not update');
  assert((await mia.locator('.chain-entry').count()) === 1, 'guest 1 chain did not update');

  // Guest 1 uses a hint, which travels to the host with the play intent.
  await mia.getByTestId('hint').click();
  await mia.waitForSelector('[data-testid="hint-card"]');
  const hint1 = (await mia.getByTestId('hint-idiom').innerText()).trim();
  assert(hint1.charAt(0) === '意', `guest hint does not follow: ${hint1}`);
  await mia.getByTestId('idiom-input').fill(hint1);
  await mia.getByTestId('idiom-input').press('Enter');
  await ben.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '2',
    null,
    { timeout: 10000 },
  );
  assert((await ben.locator('.game-shell').getAttribute('data-can-play')) === 'true', 'guest 2 did not get the turn');
  assert((await host.locator('.chain-entry').count()) === 2, 'host missed guest 1 play');

  // Guest 2 closes the round; the host gets the turn back.
  await ben.getByTestId('hint').click();
  await ben.waitForSelector('[data-testid="hint-card"]');
  const hint2 = (await ben.getByTestId('hint-idiom').innerText()).trim();
  assert(hint2.charAt(0) === hint1.slice(-1), `guest 2 hint does not follow: ${hint2}`);
  await ben.getByTestId('idiom-input').fill(hint2);
  await ben.getByTestId('idiom-input').press('Enter');
  await host.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '0',
    null,
    { timeout: 10000 },
  );
  assert((await host.locator('.game-shell').getAttribute('data-can-play')) === 'true', 'host turn did not return');
  assert((await host.locator('.chain-entry').count()) === 3, 'host chain did not reach 3');
  assert((await mia.locator('.chain-entry').count()) === 3, 'guest 1 chain did not reach 3');
  assert((await ben.locator('.chain-entry').count()) === 3, 'guest 2 chain did not reach 3');

  if (errors.length) throw new Error(errors.join(' | '));
  console.log(`LAN E2E OK — ${checks} checks, room ${code}, host + Mia + Ben, per-seat turns and hint plays`);
} finally {
  await browser.close();
  if (relay) relay.kill();
}
