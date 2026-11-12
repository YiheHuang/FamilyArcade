import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const PORT = 18080;
const BASE = `http://127.0.0.1:${PORT}`;

async function serverUp() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

let relay = null;
if (!(await serverUp())) {
  try {
    await access(path.resolve('dist/index.html'));
  } catch {
    console.error('LAN E2E needs a build first: npm run build');
    process.exit(1);
  }
  relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
    { stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await serverUp()) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!(await serverUp())) {
    relay.kill();
    console.error('LAN E2E relay did not start');
    process.exit(1);
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const makePage = async (label) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
  await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  return page;
};

try {
  const host = await makePage('host');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByTestId('start-lan').click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const code = (await host.locator('.room-code.big').innerText()).trim();
  const invite = await host.locator('.invite-link').getAttribute('href');
  console.log('room', code, invite);

  const guests = [];
  for (let i = 0; i < 3; i += 1) {
    const page = await makePage(`guest${i + 1}`);
    await page.goto(invite, { waitUntil: 'networkidle' });
    await page.waitForSelector('.waiting-card', { timeout: 15000 });
    guests.push(page);
  }
  await host.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="lan-start"]');
    return btn && !btn.disabled;
  }, null, { timeout: 15000 });
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  await host.waitForSelector('[data-testid="bid-cover"]', { timeout: 15000 });
  console.log('host bidding, guests', guests.length);

  const allHands = [];
  for (let index = 0; index < 4; index += 1) {
    const page = index === 0 ? host : guests[index - 1];
    await page.waitForSelector('[data-testid="bid-cover"]', { timeout: 15000 });
    await page.getByTestId('reveal').click();
    await page.waitForTimeout(180);
    const ids = await page
      .locator('.hand .card')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')));
    allHands.push(ids);
    console.log('seat', index, 'cards', ids.length, ids.slice(0, 3).join(','));
    await page.getByTestId('bid-3').click();
    await page.waitForTimeout(300);
  }
  for (let a = 0; a < allHands.length; a += 1) {
    for (let b = a + 1; b < allHands.length; b += 1) {
      const overlap = allHands[a].filter((id) => allHands[b].includes(id));
      if (overlap.length) throw new Error(`hands ${a} and ${b} overlap: ${overlap.join(',')}`);
    }
  }
  await host.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '0';
  }, null, { timeout: 15000 });
  console.log('playing started');
  await host.locator('.hand .card[data-legal="true"]').first().click();
  await guests[0].waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '1';
  }, null, { timeout: 15000 });
  const guest1Hand = await guests[0]
    .locator('.hand .card')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')));
  console.log('guest1 turn, hand', guest1Hand.length);
  await guests[0].locator('.hand .card[data-legal="true"]').first().click();
  await guests[1].waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-turn') === '2';
  }, null, { timeout: 15000 });
  console.log('guest2 turn reached');
  if (errors.length) throw new Error(errors.join(' | '));
  console.log('LAN E2E OK — host + 3 guests, per-seat hands disjoint, turn flow reached seat 2');
} finally {
  await browser.close();
  if (relay) relay.kill();
}
