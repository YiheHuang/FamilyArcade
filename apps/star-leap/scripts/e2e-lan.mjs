import { chromium } from 'playwright';

const HOST = process.env.HOST_URL || 'http://localhost:5173/?tutorial=0&lang=en';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function pickMove(page, colorIndex) {
  const marbles = page.locator('g.hole').filter({
    has: page.locator(`circle[fill^="url(#sl-marble-${colorIndex})"]`),
  });
  const count = await marbles.count();
  for (let i = 0; i < count; i++) {
    await marbles.nth(i).click();
    await page.waitForTimeout(120);
    const target = page.locator('g.hole.is-legal').first();
    if (await target.count()) {
      await target.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage();
  const errors = [];
  host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
  host.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`host console: ${msg.text()}`);
  });

  await host.goto(HOST, { waitUntil: 'networkidle' });
  await host.evaluate(() => localStorage.clear());
  await host.reload({ waitUntil: 'networkidle' });
  await host.getByTestId('mode-lan').click();
  await host.waitForSelector('[data-testid="lan-room-code"]');
  await host.waitForFunction(() => {
    const el = document.querySelector('[data-testid="lan-room-code"]');
    return el && el.textContent !== '····';
  });
  const roomCode = (await host.getByTestId('lan-room-code').innerText()).trim();
  assert(/^\d{4}$/.test(roomCode), `room code missing: ${roomCode}`);
  const invite = (await host.getByTestId('lan-invite-url').innerText()).trim();
  const guestUrl = `http://${invite}`;
  const parsed = new URL(guestUrl);
  parsed.searchParams.set('tutorial', '0');
  assert(parsed.searchParams.get('code') === roomCode, 'invite does not carry the room code');
  assert(await host.getByTestId('lan-qr').locator('img').count(), 'QR image missing');

  // Join from the built relay page on :8080.
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
  guest.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`guest console: ${msg.text()}`);
  });
  await guest.goto(parsed.toString(), { waitUntil: 'networkidle' });
  await guest.waitForSelector('[data-testid="lan-guest-lobby"]');
  await guest.waitForSelector('[data-testid="lan-token"]');
  const token = (await guest.getByTestId('lan-token').innerText()).trim();
  assert(token.length >= 8, `reconnect token missing: ${token}`);
  assert(await host.getByTestId('lan-seat-1').getAttribute('class').then((c) => c.includes('is-online')), 'host did not see guest online');
  assert(await host.getByTestId('lan-start').isEnabled(), 'host start stayed disabled');

  await host.getByTestId('lan-start').click();
  await guest.getByTestId('lan-enter').click();
  await host.waitForSelector('.game');
  await guest.waitForSelector('.game');

  assert(await pickMove(host, 0), 'host had no legal move');
  await guest.waitForFunction(() => {
    const el = document.querySelector('.turn-banner small');
    return el && /Turn\s*[2-9]/.test(el.textContent || '');
  });
  const guestLast = await guest.locator('.game__last').innerText();
  assert(/Host/.test(guestLast), `guest did not receive host move: ${guestLast}`);
  assert(await pickMove(guest, 1), 'guest had no legal move');
  await host.waitForFunction(() => {
    const el = document.querySelector('.turn-banner small');
    return el && /Turn\s*[3-9]/.test(el.textContent || '');
  });
  const hostLast = await host.locator('.game__last').innerText();
  assert(/Guest/.test(hostLast), `host did not apply guest move: ${hostLast}`);

  // Drop the guest and rejoin with the same browser token: the host keeps the
  // seat and pushes a fresh view, rather than starting a second room.
  await guest.close();
  guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(`guest reconnect: ${String(error)}`));
  guest.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`guest reconnect console: ${msg.text()}`);
  });
  await guest.goto(parsed.toString(), { waitUntil: 'networkidle' });
  await guest.waitForSelector('[data-testid="lan-enter"]', { timeout: 15000 });
  const tokenAfter = (await guest.getByTestId('lan-token').innerText()).trim();
  assert(tokenAfter === token, `reconnect token changed: ${token} -> ${tokenAfter}`);
  await guest.getByTestId('lan-enter').click();
  await guest.waitForSelector('.game');
  const guestLastAfter = await guest.locator('.game__last').innerText();
  assert(/Guest|Host/.test(guestLastAfter), `reconnected guest lost the game: ${guestLastAfter}`);
  const guestTurnAfter = await guest.locator('.turn-banner small').innerText();
  assert(/Turn\s*[3-9]/.test(guestTurnAfter), `reconnected guest lost the turn: ${guestTurnAfter}`);

  // A wrong code is rejected in plain language, not with a raw socket error.
  const wrongContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const wrong = await wrongContext.newPage();
  const badUrl = new URL(parsed.toString());
  badUrl.searchParams.set('code', '0000');
  await wrong.goto(badUrl.toString(), { waitUntil: 'networkidle' });
  await wrong.waitForSelector('.notice--error', { timeout: 15000 });
  const wrongText = await wrong.locator('.notice--error').innerText();
  assert(/Wrong room code|rejected/i.test(wrongText), `wrong-code error was not honest: ${wrongText}`);
  assert(!/WebSocket|undefined|NaN/i.test(wrongText), `wrong-code error leaked internals: ${wrongText}`);
  await wrongContext.close();

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('LAN E2E OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
