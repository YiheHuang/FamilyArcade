import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19026);
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
relay.stdout.on('data', (chunk) => { relayLog += chunk.toString(); });
relay.stderr.on('data', (chunk) => { relayLog += chunk.toString(); });
relay.on('exit', () => { relayExited = true; });

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

async function handTiles(page) {
  return page.locator('.hand .tile').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-tile') ?? ''),
  );
}

async function claimOpen(page) {
  return (await page.getByTestId('claim-panel').count()) > 0;
}

async function passClaims(pages) {
  for (const page of pages) {
    if (await claimOpen(page)) {
      const pass = page.getByTestId('pass');
      if (await pass.count()) await pass.click({ force: true }).catch(() => {});
    }
  }
}

async function forceClick(locator) {
  await locator.click({ force: true });
}

async function waitForSeat(pages, seat, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await passClaims(pages);
    for (const page of pages) {
      const shell = page.locator('.game-shell');
      if ((await shell.count()) === 0) continue;
      const currentSeat = await shell.getAttribute('data-seat');
      const currentTurn = await shell.getAttribute('data-turn');
      const currentPhase = await shell.getAttribute('data-phase');
      if (currentSeat === String(seat) && (currentPhase === 'draw' || currentPhase === 'discard') && currentTurn === String(seat)) {
        return page;
      }
      if (currentPhase === 'hand-over' || currentPhase === 'game-over') return page;
    }
    await pageWait(250);
  }
  throw new Error(`seat ${seat} was not reached`);
}

function pageWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const watch = (page, tag) => {
    page.on('pageerror', (error) => errors.push(`${tag}: ${String(error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${tag} console: ${message.text()}`);
    });
  };

  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(host, 'host');
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByTestId('start-lan').click();
  await host.getByTestId('lan-create').click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const invite = await host.getByTestId('invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should use the relay port, got ${invite}`);
  console.log('room invite', invite);

  const guests = [];
  for (let index = 0; index < 3; index += 1) {
    const guest = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    watch(guest, `guest${index + 1}`);
    await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
    const url = new URL(invite);
    url.searchParams.set('name', `Guest ${index + 1}`);
    await guest.goto(url.toString(), { waitUntil: 'networkidle' });
    guests.push(guest);
  }
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-list span').length === 4,
    null,
    { timeout: 15000 },
  );
  assert((await host.locator('.peer-list span').count()) === 4, 'host should list four seats');

  await host.getByTestId('lan-start').click();
  const pages = [host, ...guests];
  for (const page of pages) {
    await page.waitForSelector('.game-shell', { timeout: 15000 });
  }
  await pageWait(500);

  const hostHand = await handTiles(host);
  const guestHands = [];
  for (const guest of guests) {
    guestHands.push(await handTiles(guest));
    await guest.waitForFunction(() => {
      const shell = document.querySelector('.game-shell');
      return shell && ['1', '2', '3'].includes(shell.getAttribute('data-seat') ?? '');
    }, null, { timeout: 15000 });
  }
  assert(hostHand.length === 14, `host should hold 14 tiles, got ${hostHand.length}`);
  assert(guestHands.every((hand) => hand.length === 13), `guests should hold 13 tiles, got ${guestHands.map((hand) => hand.length).join(',')}`);
  const all = [...hostHand, ...guestHands.flat()];
  assert(all.length === 53, `seats should hold 53 tiles, got ${all.length}`);
  const counts = new Map();
  for (const tile of all) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  const overfull = [...counts.entries()].filter(([, count]) => count > 4);
  assert(overfull.length === 0, `per-seat views leaked duplicate tiles: ${overfull.map(([tile, count]) => `${tile}=${count}`).join(',')}`);
  assert(new Set(hostHand).size > 0 && guestHands.every((hand) => new Set(hand).size > 0), 'a hand is empty');
  console.log('host hand', hostHand.length, 'guest hands', guestHands.map((hand) => hand.length).join(','), 'unique multiset ok');

  // Host discards; pass any claim windows until guest 1 can act.
  await forceClick(host.locator('.hand .tile').first());
  await forceClick(host.getByTestId('discard'));
  const guest1 = await waitForSeat(pages, 1);
  const phase1 = await guest1.locator('.game-shell').getAttribute('data-phase');
  if (phase1 === 'draw') {
    await forceClick(guest1.getByTestId('draw'));
    await guest1.waitForTimeout(300);
  }
  assert((await guest1.locator('.hand .tile').count()) === 14, 'guest 1 draw should add one tile');
  await forceClick(guest1.locator('.hand .tile').first());
  await guest1.waitForTimeout(150);
  const selectedNote = await guest1.locator('.hand-head .muted').innerText();
  assert(/Selected|已选/.test(selectedNote), `guest 1 did not select a tile: ${selectedNote}`);
  await forceClick(guest1.getByTestId('discard'));
  await guest1.waitForTimeout(700);
  const guest2 = await waitForSeat(pages, 2);
  const phase2 = await guest2.locator('.game-shell').getAttribute('data-phase');
  assert(['draw', 'discard'].includes(phase2), `guest 2 should be on the clock, got ${phase2}`);
  console.log('turn flow reached seats 1 and 2');

  // Host close returns guests to an honest closed-room screen.
  await host.getByRole('button', { name: /Home/ }).click();
  await guests[0].waitForSelector('[data-testid="lan-screen"]', { timeout: 10000 });
  const guestText = await guests[0].locator('body').innerText();
  assert(/closed|房间已关闭|closed the room/i.test(guestText), 'guest should see the room closed');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('LAN E2E OK — host + 3 guests, 53 private tiles, turn flow seat 0→1→2, host close');
} finally {
  if (browser) await browser.close();
  relay.kill();
}
