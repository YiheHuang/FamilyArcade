import { chromium } from 'playwright';
import { prepare, playAttempt } from './harness.mjs';

/** Manual LAN check. Run the relay on 8181 first:
 *  node ../../tools/lan-server.mjs --dist dist --port 8181
 *  (the host page is opened with ?lanPort=8181)
 */
const HOST_URL = process.env.LAN_HOST_URL || 'http://localhost:5190/?fast=1&lanPort=8181';
const GUEST_BASE = process.env.LAN_GUEST_BASE || 'http://localhost:8181';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
};

const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
watch(host);
await prepare(host, 'en');
await host.goto(HOST_URL, { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.locator('.picker').nth(1).click(); // three seats
await host.getByRole('button', { name: /Create room/ }).click();
await host.waitForSelector('.room-code.big', { timeout: 15000 });
const code = (await host.locator('.room-code.big').innerText()).trim();
assert(/^\d{4}$/.test(code), `bad room code: ${code}`);

async function join(name) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  watch(page);
  await prepare(page, 'en');
  const url = `${GUEST_BASE}/?lan=pair-up-${code}&code=${code}&name=${encodeURIComponent(name)}&fast=1`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Join room/ }).click();
  await page.waitForTimeout(350);
  return page;
}

const mia = await join('Mia');
const ben = await join('Ben');
await host.waitForFunction(
  () => document.querySelectorAll('.peer-list .online').length >= 3,
  null,
  { timeout: 10000 },
);
await host.locator('.lan-card .primary').click();
await host.waitForSelector('.tile-grid .tile');
await mia.waitForSelector('.tile-grid .tile', { timeout: 10000 });
await ben.waitForSelector('.tile-grid .tile', { timeout: 10000 });
assert((await mia.locator('.tile').count()) === 16, 'guest board is not 16 cards');
assert((await ben.locator('.tile').count()) === 16, 'second guest board is not 16 cards');

// Host keeps flipping until the turn passes to a phone.
const known = { byIndex: new Map(), byEmoji: new Map() };
for (let i = 0; i < 12; i++) {
  const current = await host.locator('.player-chip.current .chip-name').innerText().catch(() => '');
  if (current !== 'Host') break;
  await playAttempt(host, known);
  await host.waitForTimeout(180);
}
const activeName = (await host.locator('.player-chip.current .chip-name').innerText()).trim();
assert(['Mia', 'Ben'].includes(activeName), `turn did not reach a guest: ${activeName}`);
const active = activeName === 'Mia' ? mia : ben;
const other = activeName === 'Mia' ? ben : mia;
await active.waitForFunction(
  (name) => document.querySelector('.player-chip.current .chip-name')?.textContent?.trim() === name,
  activeName,
  { timeout: 5000 },
);

// The active guest flips one card; both the host and the other guest see it.
const index = Number(await active.locator('.tile:not(.face-up)').first().getAttribute('data-index'));
await active.locator('.tile').nth(index).click();
await active.waitForTimeout(500);
assert((await active.locator('.tile.face-up').count()) >= 1, 'guest flip did not open');
await host.waitForFunction(
  () => document.querySelectorAll('.tile.face-up').length >= 1,
  null,
  { timeout: 5000 },
);
await other.waitForFunction(
  () => document.querySelectorAll('.tile.face-up').length >= 1,
  null,
  { timeout: 5000 },
);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`LAN OK — room ${code}, host + Mia + Ben, guest flip broadcast to both views`);
