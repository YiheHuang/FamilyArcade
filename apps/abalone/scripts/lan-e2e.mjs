import { chromium } from 'playwright';

const HOST_URL = process.env.HOST_URL || 'http://localhost:5212';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const host = await context.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
host.on('console', (message) => {
  if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
});
await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await host.goto(HOST_URL, { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /Play over the local network/ }).click();
await host.getByRole('button', { name: /Create room/ }).click();
await host.waitForSelector('.room-code.big', { timeout: 20000 });
const code = (await host.locator('.room-code.big').innerText()).trim();
assert(/^\d{4}$/.test(code), `bad room code: ${code}`);
const invite = await host.locator('.invite-link').getAttribute('href');
assert(invite && invite.includes(code), 'invite link missing the room code');
console.log('host room', code);

const guest = await context.newPage({ viewport: { width: 1280, height: 900 } });
guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
guest.on('console', (message) => {
  if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
});
await guest.goto(invite, { waitUntil: 'networkidle' });
await guest.waitForSelector('.waiting-card', { timeout: 20000 });
console.log('guest joined');

await host.waitForFunction(
  () => document.querySelectorAll('.peer-chip.online').length >= 2,
  null,
  { timeout: 20000 },
);
await host.getByRole('button', { name: /Start the game/ }).click();
await host.waitForSelector('.ab-board', { timeout: 10000 });
await guest.waitForSelector('.ab-board', { timeout: 10000 });

// Black (host) moves first.
await host.locator('.ab-point[data-index="13"]').click();
await host.locator('.direction-button[data-dir="SE"]').click();
await guest.waitForFunction(
  () => (document.querySelector('.turn-copy strong')?.textContent ?? '').includes('Your turn'),
  null,
  { timeout: 10000 },
);
assert(
  (await guest.locator('.ab-point[data-index="21"]').getAttribute('data-color')) === 'B',
  'guest did not receive the host move',
);

// White (guest) replies over the relay.
await guest.locator('.ab-point[data-index="47"]').click();
await guest.locator('.direction-button[data-dir="NW"]').click();
await host.waitForFunction(
  () => (document.querySelector('.match-middle')?.textContent ?? '').includes('2 moves played'),
  null,
  { timeout: 10000 },
);
assert(
  (await host.locator('.ab-point[data-index="39"]').getAttribute('data-color')) === 'W',
  'host did not receive the guest move',
);
assert(
  (await host.locator('.turn-copy').innerText()).includes('Your turn'),
  'host turn did not return',
);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN E2E OK — host code, guest join, start, both moves relayed');
