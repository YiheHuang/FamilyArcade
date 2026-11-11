/**
 * Manual LAN smoke test. Requires:
 *   npm run dev            (host page, :5181)
 *   npm run build && npm run lan   (relay + guest page, :8080)
 *
 * Run: node scripts/lan-test.mjs
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST_URL || 'http://localhost:5181';
const RELAY = process.env.RELAY_URL || 'http://localhost:8080';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
host.on('pageerror', (error) => errors.push(`host: ${error}`));
host.on('console', (message) => {
  if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
});
await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await host.goto(HOST, { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.locator('.qr-card code').waitFor({ timeout: 15000 });
const invite = await host.locator('.qr-card code').innerText();
const roomCode = await host.locator('.room-code.big').innerText();
assert(invite.includes('lan='), 'invite has no room');
console.log('host room', roomCode, 'invite', invite);

const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
guest.on('console', (message) => {
  if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
});
await guest.goto(`http://${invite}`, { waitUntil: 'networkidle' });
assert(await guest.getByRole('heading', { name: 'Join the table' }).isVisible(), 'guest join screen missing');
await guest.getByRole('button', { name: 'Join', exact: true }).click();

await host.getByRole('button', { name: 'Start the game' }).waitFor({ timeout: 15000 });
await host.getByRole('button', { name: 'Start the game' }).click();
await guest.getByRole('button', { name: /Start the game/ }).click({ timeout: 15000 });
await host.waitForTimeout(400);

const dropHost = async (col) => {
  await host.locator('.col').nth(col).click();
  await host.waitForTimeout(250);
};
const dropGuest = async (col) => {
  await guest.locator('.col').nth(col).click();
  await guest.waitForTimeout(250);
};

await dropHost(0);
assert((await guest.locator('.slot .disc').count()) === 1, 'guest did not receive host move');
await dropGuest(1);
assert((await host.locator('.slot .disc').count()) === 2, 'host did not receive guest move');
await dropHost(0);
await dropGuest(1);
await dropHost(0);
await dropGuest(1);
await dropHost(0);
await host.waitForTimeout(500);

assert((await host.locator('.result-banner').innerText()).includes('Red wins'), 'host result missing');
assert((await guest.locator('.result-banner').innerText()).includes('Red wins'), 'guest result missing');
assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN OK — host room, QR invite, guest join, alternating drops, result mirrored');
