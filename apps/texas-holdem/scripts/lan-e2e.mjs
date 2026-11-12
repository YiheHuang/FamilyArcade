import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.LAN_PORT || 19017);
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
  for (let attempt = 0; attempt < 35; attempt += 1) {
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
const pages = [];

async function makePage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pages.push(page);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
  await page.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.texas-holdem.save');
    localStorage.removeItem('familyarcade.texas-holdem.record');
  });
  return page;
}

async function holeCards(page) {
  await page.waitForSelector('[data-testid="hole-cards"] .playing-card[data-card-id]', {
    timeout: 15000,
  });
  return page
    .locator('[data-testid="hole-cards"] .playing-card[data-card-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')));
}

async function publicCards(page) {
  return page
    .locator('[data-testid="board"] .playing-card[data-card-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')));
}

try {
  const host = await makePage('host');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByTestId('start-lan').click();
  await host.getByTestId('lan-seat-3').click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const code = (await host.locator('.room-code.big').innerText()).trim();
  const invite = await host.locator('.invite-link').getAttribute('href');
  console.log('room', code, invite);

  const guest1 = await makePage('guest1');
  await guest1.goto(invite, { waitUntil: 'networkidle' });
  await guest1.waitForSelector('.waiting-card', { timeout: 15000 });
  const guest2 = await makePage('guest2');
  await guest2.goto(invite, { waitUntil: 'networkidle' });
  await guest2.waitForSelector('.waiting-card', { timeout: 15000 });

  await host.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lan-start"]');
    return button && !button.disabled;
  }, null, { timeout: 15000 });
  await host.getByTestId('lan-start').click();
  await host.waitForSelector('[data-testid="game-shell"]', { timeout: 15000 });
  await guest1.waitForSelector('[data-testid="game-shell"]', { timeout: 15000 });
  await guest2.waitForSelector('[data-testid="game-shell"]', { timeout: 15000 });

  const hostHand = await holeCards(host);
  const guest1Hand = await holeCards(guest1);
  const guest2Hand = await holeCards(guest2);
  console.log('hands', hostHand, guest1Hand, guest2Hand);
  const all = [...hostHand, ...guest1Hand, ...guest2Hand];
  if (all.length !== 6 || new Set(all).size !== 6) {
    throw new Error(`hole cards are not six unique cards: ${all.join(',')}`);
  }

  for (const [label, page, own] of [
    ['host', host, hostHand],
    ['guest1', guest1, guest1Hand],
    ['guest2', guest2, guest2Hand],
  ]) {
    const visible = await page
      .locator('.poker-table .playing-card[data-card-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')));
    if (visible.length !== 2 || visible.some((id) => !own.includes(id))) {
      throw new Error(`${label} table exposed the wrong hole cards: ${visible.join(',')}`);
    }
    const leaked = await page.evaluate((ownCards) => {
      const ids = Array.from(document.querySelectorAll('[data-card-id]'))
        .map((el) => el.getAttribute('data-card-id'))
        .filter(Boolean);
      return ids.filter((id) => !ownCards.includes(id));
    }, own);
    if (leaked.length !== 0) {
      throw new Error(`${label} DOM leaked other cards: ${leaked.join(',')}`);
    }
  }

  await host.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-turn') === '0' && el?.getAttribute('data-phase') === 'preflop';
  }, null, { timeout: 15000 });
  await host.getByTestId('action-call').click();
  await guest1.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-turn') === '1' && el?.getAttribute('data-phase') === 'preflop';
  }, null, { timeout: 15000 });
  await guest1.getByTestId('action-call').click();
  await guest2.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-turn') === '2' && el?.getAttribute('data-phase') === 'preflop';
  }, null, { timeout: 15000 });
  await guest2.getByTestId('action-check').click();

  await guest1.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'flop' && el?.getAttribute('data-turn') === '1';
  }, null, { timeout: 20000 });
  await Promise.all(
    [host, guest1, guest2].map((page) =>
      page.waitForFunction(() => {
        const board = document.querySelector('[data-testid="board"]');
        return board?.getAttribute('data-card-count') === '3';
      }, null, { timeout: 20000 }),
    ),
  );
  const boards = await Promise.all([publicCards(host), publicCards(guest1), publicCards(guest2)]);
  console.log('board', boards[0]);
  if (boards.some((board) => board.length !== 3)) {
    throw new Error(`board did not reach three cards: ${JSON.stringify(boards)}`);
  }
  if (JSON.stringify(boards[0]) !== JSON.stringify(boards[1]) || JSON.stringify(boards[0]) !== JSON.stringify(boards[2])) {
    throw new Error(`board differs between seats: ${JSON.stringify(boards)}`);
  }

  if (errors.length) throw new Error(errors.join(' | '));
  console.log(
    'LAN E2E OK — host + 2 guests, per-seat hole cards disjoint, no card leakage, turn flow through the flop',
  );
} finally {
  await browser.close();
  if (relay) relay.kill();
}
