import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5177';
const LAN_PORT = Number(process.env.LAN_PORT || 8090);
const LAN_BASE = process.env.LAN_URL || `http://localhost:${LAN_PORT}`;
const OUT = path.resolve('docs/screenshots');
const VIEWPORT = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForLanServer(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${LAN_BASE}/`);
      if (response.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureLanRelay() {
  if (await waitForLanServer(1000)) return null;
  if (!existsSync(path.resolve('dist', 'index.html'))) {
    throw new Error('LAN e2e needs dist/index.html; run npm run build first');
  }
  const relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(LAN_PORT)],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  if (!(await waitForLanServer())) {
    relay.kill();
    throw new Error(`LAN relay did not start on ${LAN_BASE}`);
  }
  return relay;
}

async function lanE2E(browser) {
  const relay = await ensureLanRelay();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const errors = [];
  const host = await context.newPage();
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host: ${message.text()}`);
  });
  host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
  const guest = await context.newPage();
  guest.on('console', (message) => {
    if (message.type() === 'error') errors.push(`guest: ${message.text()}`);
  });
  guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
  const frames = [];
  guest.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });

  try {
    await host.goto(`${LAN_BASE}/?tutorial=0&lang=en`, { waitUntil: 'networkidle' });
    await host.getByTestId('mode-lan').click();
    await host.getByTestId('lan-create').click();
    await host.waitForSelector('[data-testid="lan-code"]', { timeout: 8000 });
    const invite = await host.locator('.lan-qr code').innerText();
    assert(invite.includes('lan=') && invite.includes('code='), `bad invite: ${invite}`);

    await guest.goto(`http://${invite}&tutorial=0&lang=en`, { waitUntil: 'networkidle' });
    await guest.getByTestId('lan-join').click();
    await guest.waitForSelector('[data-testid="lan-players"]', { timeout: 8000 });
    await host.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="lan-start"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      { timeout: 8000 },
    );
    await host.getByTestId('lan-start').click();
    await guest.waitForSelector('.round-banner', { timeout: 8000 });

    // Host backs Sunny (index 2). The guest must receive only its own filtered view.
    await host.getByTestId('privacy-open').click();
    await host.getByTestId('balloon-choice-2').click();
    await host.getByTestId('lock-support').click();
    await guest.waitForSelector('.privacy-cover', { timeout: 8000 });
    const viewMessages = frames
      .map((frame) => {
        try {
          return JSON.parse(frame);
        } catch {
          return null;
        }
      })
      .filter((message) => message && message.t === 'view');
    assert(viewMessages.length > 0, 'guest received no views');
    assert(
      viewMessages.every((message) => !('windPlan' in message.view) && !('supports' in message.view)),
      'guest view leaked hidden state',
    );
    assert(
      viewMessages.some((message) => message.view.mySeat === 1),
      'guest view did not carry its own seat',
    );

    // Reconnect mid-round; the host should resend the guest's filtered view.
    await guest.reload({ waitUntil: 'networkidle' });
    await guest.getByTestId('lan-join').click();
    await guest.waitForSelector('.round-banner', { timeout: 10000 });
    if (await guest.getByTestId('privacy-open').count()) {
      assert(/Guest/.test(await guest.locator('.privacy-cover h2').innerText()), 'reconnect lost guest seat');
      await guest.getByTestId('privacy-open').click();
    }
    await guest.getByTestId('balloon-choice-0').click();
    await guest.getByTestId('lock-support').click();
    await host.waitForSelector('[data-testid="next-round"]', { timeout: 12000 });
    assert((await guest.getByTestId('next-round').count()) === 0, 'guest should not advance the host');

    await host.getByTestId('next-round').click();
    await host.waitForTimeout(700);
    assert(/Round 2/.test(await host.locator('.round-banner h1').innerText()), 'host did not advance');
    assert(/Round 2/.test(await guest.locator('.round-banner h1').innerText()), 'guest did not receive round 2');
    assert(errors.length === 0, `LAN console errors: ${errors.join(' | ')}`);
    console.log('LAN E2E OK — host authority, hidden view, reconnect, guest waits for host');
  } finally {
    await context.close();
    relay?.kill();
  }
}

async function pick(page, balloon = 1, tailwind = false) {
  await page.getByTestId('privacy-open').click();
  await page.waitForTimeout(200);
  await page.getByTestId(`balloon-choice-${balloon}`).click();
  if (tailwind && (await page.getByTestId('tailwind-toggle').isEnabled())) {
    await page.getByTestId('tailwind-toggle').click();
  }
  await page.getByTestId('lock-support').click();
}

async function waitSummary(page) {
  await page.waitForSelector('[data-testid="next-round"]', { timeout: 12000 });
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('dialog', (dialog) => dialog.accept());
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const url = (lang) => `${BASE}/?tutorial=0&lang=${lang}`;

  // 1. Home and setup
  await page.goto(url('en'), { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  assert(await page.getByTestId('mode-solo').count(), 'home missing');
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'en', 'home.png') });

  await page.getByTestId('mode-hotseat').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'en', 'setup.png') });

  // 2. Solo complete rally through the real UI
  await page.getByRole('button', { name: /Back/i }).click();
  await page.waitForTimeout(250);
  await page.getByTestId('mode-solo').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(500);
  for (let round = 1; round <= 4; round++) {
    if (round === 1) {
      await page.getByTestId('privacy-open').click();
      await page.getByTestId('hint-button').click();
      await page.waitForSelector('.hint-box', { timeout: 5000 });
      assert((await page.locator('.hint-box').innerText()).length > 5, 'hint text missing');
      await page.getByTestId('balloon-choice-3').click();
      await page.getByTestId('tailwind-toggle').click();
      await page.getByTestId('lock-support').click();
    } else {
      await pick(page, (round + 1) % 5, false);
    }
    await waitSummary(page);
    if (round < 4) {
      await page.getByTestId('next-round').click();
      await page.waitForTimeout(500);
    }
  }
  await page.getByTestId('next-round').click();
  await page.waitForSelector('[data-testid="end-modal"]', { timeout: 5000 });
  assert(await page.getByTestId('end-modal').isVisible(), 'end modal missing');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('balloonrally.stats.v1') || '{}'));
  assert(stats.games === 1, `stats games expected 1, got ${stats.games}`);
  await page.screenshot({ path: path.join(OUT, 'en', 'game-over.png') });

  // Replay and back to the finished game
  await page.getByTestId('replay').click();
  await page.waitForTimeout(600);
  assert(await page.getByRole('heading', { name: /Replay/i }).count(), 'replay screen missing');
  await page.getByTestId('replay-play').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('back').click();
  await page.waitForTimeout(400);
  assert(await page.getByTestId('end-modal').count(), 'replay back should return to end modal');

  // Stats screen
  await page.getByTestId('modal-home').click();
  await page.waitForTimeout(500);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(400);
  assert(await page.locator('.stats-table').count(), 'stats table missing');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('stats-export').click();
  const download = await downloadPromise;
  assert(download.suggestedFilename() === 'balloon-rally-stats.json', `unexpected export: ${download.suggestedFilename()}`);
  await page.getByTestId('back').click();
  await page.waitForTimeout(300);

  // 3. Hot-seat privacy, undo, autosave, resume
  await page.getByTestId('mode-hotseat').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(400);
  await page.getByTestId('privacy-open').click();
  await page.getByTestId('balloon-choice-2').click();
  await page.getByTestId('tailwind-toggle').click();
  await page.getByTestId('lock-support').click();
  await page.waitForTimeout(400);
  assert(/Player 2/.test(await page.locator('.privacy-cover h2').innerText()), 'privacy cover did not pass');
  await page.getByTestId('privacy-open').click();
  await page.getByTestId('balloon-choice-0').click();
  await page.getByTestId('lock-support').click();
  await waitSummary(page);
  await page.getByTestId('undo').click();
  await page.waitForTimeout(500);
  assert(/Player 2/.test(await page.locator('.privacy-cover h2').innerText()), 'undo did not return to Player 2');
  await page.getByTestId('privacy-open').click();
  await page.getByTestId('balloon-choice-1').click();
  await page.getByTestId('lock-support').click();
  await waitSummary(page);
  await page.getByTestId('next-round').click();
  await page.waitForTimeout(500);
  assert(/Round 2/.test(await page.locator('.round-banner h1').innerText()), 'not in round 2');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  assert(await page.getByTestId('continue-game').count(), 'continue card missing after reload');
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(600);
  assert(/Round 2/.test(await page.locator('.round-banner h1').innerText()), 'resume failed');
  assert(await page.locator('.privacy-cover').count(), 'resume should show cover');

  // 4. Tutorial first-run flow
  await page.goto(`${BASE}/?lang=en`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('balloonrally.tutorial.v1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(await page.locator('.tutorial').count(), 'tutorial did not open');
  await page.getByTestId('tutorial-next').click();
  await page.locator('.tutorial-choice__item').nth(2).click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-done').click();
  await page.waitForTimeout(300);
  assert(!(await page.locator('.tutorial').count()), 'tutorial did not close');

  // 5. Mobile layout
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobileErrors = [];
  mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
  mobile.on('console', (message) => {
    if (message.type() === 'error') mobileErrors.push(message.text());
  });
  await mobile.goto(`${BASE}/?tutorial=0&lang=en&demo=support`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(700);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'mobile page overflows horizontally');
  await mobile.getByTestId('privacy-open').click();
  await mobile.getByTestId('balloon-choice-1').click();
  assert(await mobile.getByTestId('lock-support').isVisible(), 'mobile lock button missing');
  await mobile.screenshot({ path: path.join(OUT, 'en', 'game-mobile.png') });
  await mobile.getByTestId('lock-support').click();
  await mobile.waitForSelector('.privacy-cover', { timeout: 5000 });
  assert(await mobile.locator('.privacy-cover').isVisible(), 'mobile privacy pass missing');
  assert(await mobile.locator('.privacy-cover h2').innerText(), 'mobile privacy title missing');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  assert(mobileErrors.length === 0, `mobile console errors: ${mobileErrors.join(' | ')}`);
  await lanE2E(browser);
  await browser.close();
  console.log('E2E OK — solo, hot-seat, undo, resume, tutorial, mobile, LAN');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
