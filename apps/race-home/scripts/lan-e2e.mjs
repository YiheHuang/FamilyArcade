/**
 * LAN smoke test for Race Home.
 *
 * Prerequisites (three terminals from apps/race-home):
 *   npm run build
 *   npm run dev        # host page, http://localhost:5188
 *   npm run lan        # relay + built guest page, http://localhost:8080
 *
 * Then: node scripts/lan-e2e.mjs
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST_URL || 'http://localhost:5188';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
await hostContext.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
const host = await hostContext.newPage();
const hostErrors = [];
host.on('console', (m) => { if (m.type() === 'error') hostErrors.push(m.text()); });
host.on('pageerror', (e) => hostErrors.push(String(e)));

await host.goto(HOST, { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.getByRole('button', { name: /Open a room/ }).click();
await host.locator('.room-code.big').waitFor({ timeout: 15000 });
const code = (await host.locator('.room-code.big').innerText()).trim();
const invite = (await host.locator('.qr-card code').innerText()).trim();
console.log('host room code', code, 'invite', invite);
const guestUrl = invite.startsWith('http') ? invite : `http://${invite}`;

const guestContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  locale: 'en-US',
});
await guestContext.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
const guest = await guestContext.newPage();
const guestErrors = [];
guest.on('console', (m) => { if (m.type() === 'error') guestErrors.push(m.text()); });
guest.on('pageerror', (e) => guestErrors.push(String(e)));
await guest.goto(guestUrl, { waitUntil: 'networkidle' });
await guest.getByRole('button', { name: /Join the room/ }).click();
await host.locator('.peer-list .online').first().waitFor({ timeout: 10000 });
assert((await host.locator('.peer-list .online').count()) >= 2, 'host did not see the guest');
await host.getByRole('button', { name: /Start the race/ }).click();
await host.locator('.board').waitFor({ timeout: 8000 });
await guest.locator('.board').waitFor({ timeout: 8000 });
console.log('lan game started for host and guest');

const greenOutOnHost = () =>
  host.locator('.pawn-green[data-zone="ring"], .pawn-green[data-zone="lane"], .pawn-green[data-zone="home"]').count();
const redOutOnHost = () =>
  host.locator('.pawn-red[data-zone="ring"], .pawn-red[data-zone="lane"], .pawn-red[data-zone="home"]').count();

let bothMoved = false;
for (let i = 0; i < 220; i++) {
  if (await host.locator('.result-banner').count()) break;
  const hostRoll = host.locator('.roll-button');
  const guestRoll = guest.locator('.roll-button');
  if (await hostRoll.isEnabled()) {
    await hostRoll.click();
    await host.waitForTimeout(70);
  } else if (await host.locator('.pawn.legal').count()) {
    await host.locator('.pawn.legal').first().click();
    await host.waitForTimeout(95);
  } else if (await guestRoll.isEnabled()) {
    const turnColor = await guest.locator('.turn-dot').getAttribute('class');
    assert(turnColor.includes('dot-green'), `guest turn dot was ${turnColor}`);
    await guestRoll.click();
    await guest.waitForTimeout(95);
  } else if (await guest.locator('.pawn.legal').count()) {
    await guest.locator('.pawn.legal').first().click();
    await guest.waitForTimeout(170);
  } else {
    await host.waitForTimeout(90);
  }
  if ((await redOutOnHost()) > 0 && (await greenOutOnHost()) > 0) {
    bothMoved = true;
    break;
  }
}

assert((await redOutOnHost()) > 0, 'host pawn never left the yard');
assert((await greenOutOnHost()) > 0, 'guest pawn never left the yard on the host board');
assert(bothMoved, 'guest move never reached the host board');

const hostActive = (await host.locator('.player-list li.active .player-line strong').innerText()).trim();
const guestActive = (await guest.locator('.player-list li.active .player-line strong').innerText()).trim();
console.log('active player host/guest:', hostActive, '/', guestActive);
assert(hostActive === guestActive, 'host and guest disagree about the active player');
assert(hostErrors.length === 0, `host console errors: ${hostErrors.join(' | ')}`);
assert(guestErrors.length === 0, `guest console errors: ${guestErrors.join(' | ')}`);
console.log('LAN OK — room, join, start, host move, guest move, shared turn state');
await browser.close();
