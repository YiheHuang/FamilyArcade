import { chromium } from 'playwright';

const HOST_BASE = process.env.HOST_URL || 'http://localhost:5198';
const LAN_PORT = Number(process.env.LAN_PORT || 8098);
const RELAY = `http://localhost:${LAN_PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const host = await hostContext.newPage();
const errors = [];
host.on('console', (message) => {
  if (message.type() === 'error') errors.push(`host: ${message.text()}`);
});
host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
await host.addInitScript((port) => {
  localStorage.setItem('familyarcade.lang', 'en');
  window.__FAMILYARCADE_LAN_PORT__ = port;
}, LAN_PORT);
await host.goto(HOST_BASE, { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.locator('.qr-card code').waitFor({ state: 'visible', timeout: 20000 });
assert((await host.locator('.room-code.big').innerText()).length === 4, 'room code missing');
const invitePath = await host.locator('.qr-card code').innerText();
const invite = `${RELAY}/?${invitePath.split('?')[1]}`;
assert(invite.includes('lan='), 'invite missing room');

const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const guest = await guestContext.newPage();
guest.on('console', (message) => {
  if (message.type() === 'error') errors.push(`guest: ${message.text()}`);
});
guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await guest.goto(invite, { waitUntil: 'networkidle' });
await guest.getByRole('button', { name: /^Join$/ }).click();
await host.getByRole('button', { name: /Start the game/ }).waitFor({ state: 'visible', timeout: 15000 });
await host.getByRole('button', { name: /Start the game/ }).click();
await guest.locator('.board').waitFor({ state: 'visible', timeout: 15000 });

// Guest board is rotated: the first square is e1.
assert((await guest.locator('.board .square').first().getAttribute('data-square')) === '29', 'guest board not flipped');

// Host is White. e2–e4, then Black answers d5–d4.
await host.locator('.square[data-square="24"]').click();
await host.locator('.square[data-square="14"]').click();
await guest.locator('.move-list li').first().waitFor({ state: 'visible', timeout: 10000 });
assert((await guest.locator('.move-list').innerText()).includes('e2–e4'), 'host move not forwarded');
await guest.locator('.square[data-square="8"]').click();
await guest.locator('.square[data-square="13"]').click();
await host.locator('.move-list li').nth(1).waitFor({ state: 'visible', timeout: 10000 });
assert((await host.locator('.move-list').innerText()).includes('d5–d4'), 'guest intent not applied');
assert((await host.locator('.turn-bar').innerText()).includes('White to move'), 'host turn did not return to White');

// A guest reload can rejoin from the invite URL and receives the current view.
await guest.reload({ waitUntil: 'networkidle' });
await guest.getByRole('button', { name: /^Join$/ }).click();
await guest.locator('.board').waitFor({ state: 'visible', timeout: 15000 });
await guest.locator('.move-list li').nth(1).waitFor({ state: 'visible', timeout: 15000 });
assert((await guest.locator('.move-list').innerText()).includes('d5–d4'), 'rejoined guest lost the game view');

// A third guest is rejected as room-full.
const thirdContext = await browser.newContext();
const third = await thirdContext.newPage();
await third.goto(invite, { waitUntil: 'networkidle' });
await third.getByRole('button', { name: /^Join$/ }).click();
await third.locator('.error').waitFor({ state: 'visible', timeout: 10000 });
assert((await third.locator('.error').innerText()).toLowerCase().includes('full'), 'third guest was not rejected');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN E2E OK — host, guest, flipped board, two-way moves, guest rejoin, room-full rejection');
