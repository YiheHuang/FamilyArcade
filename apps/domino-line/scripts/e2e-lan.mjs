import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5191';
const PORT = Number(process.env.LAN_PORT || 8147);
const OUT = path.resolve('docs/screenshots');
const relayUrl = `http://localhost:${PORT}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function isDominoRelay() {
  try {
    const response = await fetch(relayUrl, { signal: AbortSignal.timeout(1500) });
    const html = await response.text();
    return html.includes('<title>Domino Line');
  } catch {
    return false;
  }
}

let relay = null;
if (!(await isDominoRelay())) {
  relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(200);
    if (await isDominoRelay()) break;
  }
  if (!(await isDominoRelay())) {
    relay.kill();
    throw new Error(`could not start a Domino Line relay on port ${PORT}`);
  }
}

function resolvePlay(hand, left, right) {
  const plays = [];
  for (const tile of hand) {
    const [a, b] = tile.split('-').map(Number);
    const add = (end) => {
      if (!plays.some((play) => play.tile === tile && play.end === end)) {
        plays.push({ tile, end });
      }
    };
    if (a === right || b === right) add('right');
    if (a === left || b === left) add('left');
  }
  if (left === right) {
    const seen = new Set();
    return plays.filter((play) => {
      if (seen.has(play.tile)) return false;
      seen.add(play.tile);
      return true;
    });
  }
  return plays;
}

async function guestInfo(page) {
  return page.evaluate(() => {
    const hand = [...document.querySelectorAll('.hand-tile')].map((tile) => tile.dataset.tile);
    const leftText = document.querySelector('.board-end.left .end-pip')?.textContent?.trim() ?? '';
    const rightText = document.querySelector('.board-end.right .end-pip')?.textContent?.trim() ?? '';
    return {
      hand,
      left: Number(leftText),
      right: Number(rightText),
      turn: document.querySelector('.game-shell')?.getAttribute('data-turn'),
      drawDisabled: document.querySelector('.draw-btn')?.disabled ?? true,
      passDisabled: document.querySelector('.pass-btn')?.disabled ?? true,
      board: document.querySelectorAll('.placed-domino').length,
    };
  });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await hostContext.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  const host = await hostContext.newPage();
  const errors = [];
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host: ${message.text()}`);
  });
  host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));

  await host.goto(`${BASE}/?lanPort=${PORT}`, { waitUntil: 'networkidle' });
  await host.locator('[data-action="lan"]').click();
  await host.locator('[data-action="create-room"]').click();
  await host.waitForSelector('.room-code.big');
  const inviteText = (await host.locator('.qr-card code').innerText()).trim();
  const invite = `http://${inviteText}`;
  assert(invite.includes(`:${PORT}/`), `invite did not use relay port ${PORT}`);

  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guestContext.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  const guest = await guestContext.newPage();
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest: ${message.text()}`);
  });
  guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));

  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.locator('[data-action="join"]').click();
  await host.waitForFunction(() => {
    const button = document.querySelector('[data-action="start-lan"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert((await host.locator('.peer-list .online').count()) >= 2, 'host did not see the guest');
  await host.waitForTimeout(400);
  await host.screenshot({ path: path.join(dir, 'lan.png') });

  await host.locator('[data-action="start-lan"]').click();
  await host.waitForSelector('.game-shell');
  await guest.waitForSelector('.game-shell');
  await guest.waitForFunction(() => document.querySelectorAll('.hand-tile').length > 0);

  const hostHand = await host.evaluate(() =>
    [...document.querySelectorAll('.hand-tile')].map((tile) => tile.dataset.tile),
  );
  const guestHand = await guest.evaluate(() =>
    [...document.querySelectorAll('.hand-tile')].map((tile) => tile.dataset.tile),
  );
  assert(hostHand.length === 7 && guestHand.length === 7, 'LAN seats did not draw seven tiles');
  assert(hostHand.every((tile) => !guestHand.includes(tile)), 'guest could see the host hand');

  // Host starts the line.
  await host.locator('.hand-tile').first().click();
  await host.locator('.play-right').click();
  await host.waitForFunction(() => document.querySelectorAll('.placed-domino').length === 1);
  await guest.waitForFunction(() => {
    const shell = document.querySelector('.game-shell');
    return shell?.getAttribute('data-turn') === '1' && document.querySelectorAll('.placed-domino').length === 1;
  });

  // Guest plays (drawing first if necessary); the host is authoritative.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const info = await guestInfo(guest);
    if (info.board >= 2) break;
    const plays = resolvePlay(info.hand, info.left, info.right);
    if (plays.length > 0) {
      const play = plays[0];
      await guest.locator(`.hand-tile[data-tile="${play.tile}"]`).click();
      await guest.locator(play.end === 'left' ? '.play-left' : '.play-right').click();
      await host.waitForFunction(() => document.querySelectorAll('.placed-domino').length >= 2);
      break;
    }
    if (!info.drawDisabled) {
      await guest.locator('.draw-btn').click();
      await guest.waitForTimeout(250);
      continue;
    }
    if (!info.passDisabled) {
      await guest.locator('.pass-btn').click();
      await guest.waitForTimeout(250);
      continue;
    }
    throw new Error('guest had no legal action');
  }

  const hostBoard = await host.locator('.placed-domino').count();
  const guestBoard = await guest.locator('.placed-domino').count();
  assert(hostBoard === 2, `host board expected 2 tiles, got ${hostBoard}`);
  assert(guestBoard === 2, `guest board expected 2 tiles, got ${guestBoard}`);
  assert(errors.length === 0, `LAN console errors: ${errors.join(' | ')}`);

  await guestContext.close();
  await hostContext.close();
  await browser.close();
  console.log(`LAN E2E OK (${lang}) — room, QR invite, guest join, hidden hands, host-authoritative play`);
}

try {
  await run('en');
  await run('zh');
} finally {
  if (relay) relay.kill();
}
