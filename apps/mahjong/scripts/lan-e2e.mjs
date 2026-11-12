import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.LAN_PORT || 19021);
const BASE = `http://127.0.0.1:${PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
  await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  return page;
};

async function passClaims(pages) {
  for (let round = 0; round < 10; round += 1) {
    let acted = false;
    for (const page of pages) {
      const pass = page.getByTestId('claim-pass');
      if (await pass.isVisible().catch(() => false)) {
        await pass.click();
        await page.waitForTimeout(220);
        acted = true;
      }
    }
    if (!acted) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitTurn(page, seat, handCount) {
  await page.waitForFunction(
    ({ seat, handCount }) => {
      const shell = document.querySelector('.game-shell');
      return (
        shell?.getAttribute('data-phase') === 'discard' &&
        shell?.getAttribute('data-turn') === String(seat) &&
        document.querySelectorAll('.hand .hand-tile').length === handCount
      );
    },
    { seat, handCount },
    { timeout: 25000 },
  );
}

try {
  const host = await makePage('host');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByTestId('start-lan').click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const code = (await host.locator('.room-code.big').innerText()).trim();
  const invite = await host.locator('.invite-link').getAttribute('href');
  console.log('room', code, invite);
  assert(invite && invite.includes('lan='), 'invite link missing');

  const guests = [];
  for (let index = 0; index < 3; index += 1) {
    const page = await makePage(`guest${index + 1}`);
    await page.goto(invite, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="waiting-card"]', { timeout: 15000 });
    guests.push(page);
  }
  await host.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lan-start"]');
    return button && !button.disabled;
  }, null, { timeout: 15000 });
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  for (const page of guests) await page.waitForSelector('.game-shell', { timeout: 25000 });

  const all = [host, ...guests];
  const seats = [];
  for (const page of all) {
    seats.push(Number(await page.locator('.game-shell').getAttribute('data-seat')));
  }
  assert(seats.join(',') === '0,1,2,3', `unexpected LAN seats ${seats.join(',')}`);

  await host.waitForFunction(() => {
    const shell = document.querySelector('.game-shell');
    return shell?.getAttribute('data-phase') === 'discard' && shell?.getAttribute('data-turn') === '0';
  }, null, { timeout: 15000 });

  const hands = [];
  for (const page of all) {
    const ids = await page
      .locator('.hand .hand-tile')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-tile')));
    hands.push(ids);
    console.log('seat', await page.locator('.game-shell').getAttribute('data-seat'), 'hand', ids.length, ids.join(' '));
  }
  assert(hands[0].length === 14, 'host dealer should have 14 tiles');
  for (let index = 1; index < hands.length; index += 1) {
    assert(hands[index].length === 13, `guest ${index} should have 13 tiles`);
  }
  const copies = new Map();
  for (const hand of hands) {
    for (const id of hand) copies.set(id, (copies.get(id) ?? 0) + 1);
  }
  for (const [id, count] of copies) {
    assert(count <= 4, `five copies of ${id} across the four hands`);
  }
  assert(hands.flat().length === 53, 'the four hands should total 53 tiles');

  await host.locator('.hand .hand-tile').first().click();
  await host.getByTestId('discard').click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await passClaims(all);
  await waitTurn(guests[0], 1, 14);
  console.log('seat 1 drew and can play');

  await guests[0].locator('.hand .hand-tile').first().click();
  await guests[0].getByTestId('discard').click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await passClaims(all);
  await waitTurn(guests[1], 2, 14);
  console.log('seat 2 drew and can play');

  await guests[1].locator('.hand .hand-tile').first().click();
  await guests[1].getByTestId('discard').click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await passClaims(all);
  await waitTurn(guests[2], 3, 14);
  console.log('seat 3 drew and can play');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host + 3 guests, per-seat hands respect the four-copy deck, turn flow through all four seats');
} finally {
  await browser.close();
  if (relay) relay.kill();
}
