import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.LAN_PORT || 8096);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForRelay() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`LAN relay did not start on ${BASE}`);
}

async function waitForTiles(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-tile]').length === expected,
    count,
    { timeout: 12_000 },
  );
}

async function main() {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('dist is missing; run npm run build first');
  }
  const relay = spawn(
    process.execPath,
    [
      path.resolve(ROOT, '..', '..', 'tools', 'lan-server.mjs'),
      '--dist',
      path.resolve(ROOT, 'dist'),
      '--port',
      String(PORT),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let relayLog = '';
  relay.stdout.on('data', (chunk) => {
    relayLog += String(chunk);
  });
  relay.stderr.on('data', (chunk) => {
    relayLog += String(chunk);
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  try {
    await waitForRelay();
    const host = await hostContext.newPage();
    host.on('dialog', (dialog) => dialog.accept());
    host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
    host.on('console', (message) => {
      if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
    });
    await host.goto(`${BASE}/?tutorial=0&lang=en&lanPort=${PORT}`, { waitUntil: 'networkidle' });
    await host.getByTestId('mode-lan').click();
    await host.waitForTimeout(300);
    await host.getByTestId('lan-create').click();
    await host.getByTestId('lan-code').waitFor({ timeout: 15_000 });
    const code = (await host.getByTestId('lan-code').innerText()).trim();
    const invite = (await host.getByTestId('lan-invite').innerText()).trim();
    assert(code.length === 4, `room code should be 4 digits, got ${code}`);
    assert(invite.includes(`lan=${code}`), `invite should carry the room: ${invite}`);

    const guest = await guestContext.newPage();
    guest.on('dialog', (dialog) => dialog.accept());
    guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
    guest.on('console', (message) => {
      if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
    });
    const guestUrl = new URL(invite);
    guestUrl.searchParams.set('lang', 'en');
    guestUrl.searchParams.set('tutorial', '0');
    await guest.goto(guestUrl.toString(), { waitUntil: 'networkidle' });
    await guest.getByTestId('lan-join').click();
    await guest.getByTestId('lan-guest-joined').waitFor({ timeout: 10_000 });
    await host.waitForFunction(
      () => document.querySelector('[data-testid="lan-seat-1"]')?.classList.contains('is-online'),
      { timeout: 10_000 },
    );
    await host.getByTestId('lan-start').click();
    await waitForTiles(host, 1);
    await waitForTiles(guest, 1);
    assert((await guest.locator('.board-slot').count()) === 0, 'guest should not act out of turn');

    await host.locator('.board-slot').first().click();
    await host.waitForTimeout(250);
    await host.getByTestId('confirm-place').click();
    await waitForTiles(host, 2);
    await waitForTiles(guest, 2);

    await guest.locator('.board-slot').first().click();
    await guest.waitForTimeout(250);
    await guest.getByTestId('confirm-place').click();
    await waitForTiles(host, 3);
    await waitForTiles(guest, 3);
    assert((await guest.locator('.board-slot').count()) === 0, 'guest still should not act out of turn');
    assert((await host.locator('.board-slot').count()) > 0, 'host should be able to act');

    // Reconnect: the host keeps the seat; the guest resumes the same view.
    await guest.close();
    await host.waitForFunction(
      () => document.querySelector('.lan-strip.is-closed') !== null,
      { timeout: 10_000 },
    );
    const guest2 = await guestContext.newPage();
    guest2.on('dialog', (dialog) => dialog.accept());
    guest2.on('pageerror', (error) => errors.push(`guest2: ${String(error)}`));
    await guest2.goto(guestUrl.toString(), { waitUntil: 'networkidle' });
    await guest2.getByTestId('lan-join').click();
    await waitForTiles(guest2, 3);
    await host.waitForFunction(
      () => document.querySelector('.lan-strip:not(.is-closed)') !== null &&
        document.querySelectorAll('.lan-strip__names span.is-online').length === 2,
      { timeout: 10_000 },
    );

    assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    console.log(`LAN E2E OK — room ${code}, host + guest moves + reconnect`);
  } catch (error) {
    console.error(relayLog);
    throw error;
  } finally {
    await browser.close();
    relay.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
