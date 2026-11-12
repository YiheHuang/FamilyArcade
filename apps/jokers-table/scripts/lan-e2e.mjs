import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.LAN_PORT || 19019);
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
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
  await page.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.jokers-table.save');
    localStorage.removeItem('familyarcade.jokers-table.record');
  });
  return page;
};

async function finishBlind(page, count) {
  for (let hand = 0; hand < 4; hand += 1) {
    const cards = page.locator('.hand .pcard');
    for (let index = 0; index < count; index += 1) {
      await cards.nth(index).click();
    }
    await page.waitForTimeout(40);
    await page.getByTestId('play').click();
    await page.waitForTimeout(120);
    if ((await page.getByTestId('blind-result').count()) > 0) break;
  }
  await page.getByTestId('blind-result').waitFor({ timeout: 10000 });
  await page.getByTestId('continue').click();
  await page.waitForTimeout(180);
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
  if (!invite) throw new Error('invite link missing');

  const guests = [];
  for (let index = 0; index < 3; index += 1) {
    const url = new URL(invite);
    url.searchParams.set('name', `Guest ${index + 1}`);
    const page = await makePage(`guest${index + 1}`);
    await page.goto(url.toString(), { waitUntil: 'networkidle' });
    await page.waitForSelector('.waiting-card', { timeout: 15000 });
    guests.push(page);
  }

  await host.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lan-start"]');
    return button && !button.hasAttribute('disabled');
  }, null, { timeout: 15000 });
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('.game-shell', { timeout: 15000 });
  for (const page of guests) {
    await page.waitForSelector('.game-shell', { timeout: 15000 });
  }
  console.log('host + 3 guests started');

  const seeds = [];
  for (const page of [host, ...guests]) {
    seeds.push(await page.getByTestId('game-shell').getAttribute('data-seed'));
  }
  if (new Set(seeds).size !== 1) throw new Error(`seed mismatch: ${seeds.join(',')}`);
  console.log('shared seed', seeds[0]);

  await finishBlind(host, 1);
  await finishBlind(guests[0], 2);
  await finishBlind(guests[1], 3);
  await finishBlind(guests[2], 4);

  for (const page of [host, ...guests]) {
    await page.waitForSelector('[data-testid="compare"]', { timeout: 15000 });
  }
  const rows = await host.locator('[data-testid="compare-row"]').count();
  if (rows !== 4) throw new Error(`expected 4 comparison rows, got ${rows}`);
  const compareText = await host.getByTestId('compare').innerText();
  console.log('verdict', compareText.replace(/\s+/g, ' ').slice(0, 280));
  if (!/loses a heart|Tied at the bottom/.test(compareText)) {
    throw new Error('verdict did not explain the heart outcome');
  }
  console.log('comparison rows', rows);

  for (const page of [host, ...guests]) {
    await page.getByTestId('continue-compare').click();
  }
  for (const page of [host, ...guests]) {
    await page.waitForSelector('[data-testid="shop"]', { timeout: 15000 });
    const offers = await page.locator('[data-testid="offer"]').count();
    if (offers !== 3) throw new Error(`expected 3 shop offers, got ${offers}`);
  }
  console.log('shop reached by all four seats');

  if (errors.length) throw new Error(errors.join(' | '));
  console.log(
    'LAN E2E OK — host + 3 guests, shared seed, score submission, comparison, hearts, shop',
  );
} finally {
  await browser.close();
  if (relay) relay.kill();
}
