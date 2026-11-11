import { chromium } from 'playwright';

const RELAY_PORT = process.env.RELAY_PORT || '8080';
const HOST = process.env.HOST_URL || `http://localhost:5195/?relay=${RELAY_PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
for (const [name, page] of [['host', host], ['guest', guest]]) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${name}: ${String(error)}`));
}

const guestFrames = [];
guest.on('websocket', (socket) => {
  socket.on('framereceived', (event) => guestFrames.push(String(event.payload)));
});

await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));

await host.goto(HOST, { waitUntil: 'domcontentloaded' });
await host.getByRole('button', { name: /LAN night/ }).waitFor({ timeout: 20000 });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.locator('.room-code.big').waitFor({ timeout: 10000 });
const roomCode = (await host.locator('.room-code.big').innerText()).trim();
const inviteText = await host.locator('.qr-card code').innerText();
const invite = `http://${inviteText.trim()}`;
assert(roomCode.length === 4, 'host did not show a four-digit room code');

await guest.goto(invite, { waitUntil: 'domcontentloaded' });
await guest.locator('.lan-form input').first().waitFor({ timeout: 20000 });
await guest.locator('.lan-form input').first().fill('Nana');
await guest.getByRole('button', { name: /Join room/ }).click();
await guest.getByText('Connected.').waitFor({ timeout: 10000 });
await host.getByText('Both seats are here.').waitFor({ timeout: 10000 });

// Host sets: the guest must never receive the secret in a view frame.
await host.getByRole('button', { name: /Start the round/ }).click();
await host.locator('.action-panel .palette-btn').first().waitFor({ timeout: 5000 });
await host.locator('.palette-btn').nth(0).click();
await host.locator('.palette-btn').nth(1).click();
await host.locator('.palette-btn').nth(2).click();
await host.locator('.palette-btn').nth(3).click();
await host.getByRole('button', { name: /Lock the code/ }).click();
await guest.locator('.action-panel .palette-btn').first().waitFor({ timeout: 10000 });
assert((await guest.locator('.secret-card .peg-hidden').count()) === 4, 'guest breaker sees hidden pegs');
assert(
  !guestFrames.some((frame) => frame.includes('["red","yellow","green","blue"]')),
  'guest received the secret over the relay',
);

for (const index of [0, 1, 2, 3]) await guest.locator('.palette-btn').nth(index).click();
await guest.getByRole('button', { name: /Submit guess/ }).click();
await guest.locator('.result-card').waitFor({ timeout: 10000 });
assert((await guest.locator('.result-card').innerText()).includes('Code cracked!'), 'guest did not see result');
assert((await guest.locator('.secret-card .peg-hidden').count()) === 0, 'guest did not get reveal after round');
assert((await guest.locator('.secret-card .peg').count()) === 4, 'guest secret card missing revealed pegs');
await host.locator('.result-card').waitFor({ timeout: 10000 });

// Host rematches and swaps roles: the guest now sets on their own phone.
await host.getByRole('button', { name: /Rematch/ }).click();
await guest.getByText('Lock in your secret').waitFor({ timeout: 10000 });
for (const index of [4, 4, 5, 5]) await guest.locator('.palette-btn').nth(index).click();
await guest.getByRole('button', { name: /Lock the code/ }).click();
await host.locator('.action-panel .palette-btn').first().waitFor({ timeout: 10000 });
assert((await host.locator('.secret-card .peg-hidden').count()) === 4, 'host breaker sees hidden pegs');

for (const index of [0, 0, 0, 0]) await host.locator('.palette-btn').nth(index).click();
await host.getByRole('button', { name: /Submit guess/ }).click();
await host.locator('.guess-row.done').waitFor({ timeout: 5000 });
await guest.locator('.guess-row.done').waitFor({ timeout: 5000 });

for (const index of [4, 4, 5, 5]) await host.locator('.palette-btn').nth(index).click();
await host.getByRole('button', { name: /Submit guess/ }).click();
await host.locator('.result-card').waitFor({ timeout: 10000 });
await guest.locator('.result-card').waitFor({ timeout: 10000 });
assert((await host.locator('.result-card').innerText()).includes('Code cracked!'), 'host did not crack');
assert((await guest.locator('.result-card').innerText()).includes('Code cracked!'), 'guest did not see final result');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN OK — room join, host-sets hidden code, guest crack, rematch, guest-sets hidden code, host crack');
process.exit(0);
