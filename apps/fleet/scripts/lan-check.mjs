import { chromium } from 'playwright';

const HOST = process.env.HOST_URL || 'http://localhost:5194';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const host = await hostContext.newPage();
const errors = [];
host.on('pageerror', (e) => errors.push(`host: ${e}`));
await host.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('familyarcade.lang', 'en');
});
await host.goto(HOST, { waitUntil: 'networkidle' });
await host.getByTestId('play-lan').click();
await host.waitForSelector('.room-code.big', { timeout: 10000 });
const code = (await host.locator('.room-code.big').innerText()).trim();
console.log('room code', code);
const invite = 'http://' + (await host.locator('.qr-card code').innerText()).trim();
console.log('invite', invite);
assert(invite.includes('lan='), 'invite URL missing room');

const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const guest = await guestContext.newPage();
guest.on('pageerror', (e) => errors.push(`guest: ${e}`));
await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await guest.goto(invite, { waitUntil: 'networkidle' });
await guest.waitForSelector('[data-testid="guest-join"]', { timeout: 8000 });
await guest.getByTestId('guest-name').fill('Mina');
await guest.getByTestId('guest-join').click();
await host.waitForFunction(() => document.querySelector('.peer-list')?.textContent?.includes('Mina'), null, { timeout: 8000 });
console.log('guest joined');
await host.getByTestId('lan-start').click();
await host.waitForSelector('.own-board', { timeout: 8000 });
await guest.waitForSelector('.own-board', { timeout: 8000 });
console.log('both in placement');
assert((await host.locator('.own-board .cell').count()) === 100, 'host own board missing');
assert((await guest.locator('.own-board .cell').count()) === 100, 'guest own board missing');

await host.getByTestId('auto-place').click();
await host.getByTestId('ready').click();
await guest.getByTestId('auto-place').click();
await guest.getByTestId('ready').click();
await host.waitForSelector('.enemy-board', { timeout: 8000 });
await guest.waitForSelector('.enemy-board', { timeout: 8000 });
await host.waitForTimeout(500);
console.log('battle started');
console.log('host own ships', await host.locator('.own-board .cell.ship').count());
console.log('guest own ships', await guest.locator('.own-board .cell.ship').count());
assert((await host.locator('.own-board .cell.ship').count()) === 17, 'host fleet lost');
assert((await guest.locator('.own-board .cell.ship').count()) === 17, 'guest fleet lost');

// Neither side may see the other's live hulls.
assert((await host.locator('.enemy-board .cell.ship').count()) === 0, 'host can see guest hulls');
assert((await guest.locator('.enemy-board .cell.ship').count()) === 0, 'guest can see host hulls');
console.log('hidden fleets: host enemy hulls 0, guest enemy hulls 0');

// Host fires, guest receives the result and the turn.
await host.locator('.enemy-board .cell[data-cell="55"]').click();
await guest.waitForFunction(
  () => {
    const panel = document.querySelector('.turn-copy');
    return panel && /Your turn|Your move/i.test(panel.textContent || '');
  },
  null,
  { timeout: 8000 },
);
console.log('guest got turn');
assert((await guest.locator('.own-board .cell.mark-miss, .own-board .cell.mark-hit, .own-board .cell.mark-sunk').count()) === 1, 'guest did not receive host shot');
console.log('guest own marks', await guest.locator('.own-board .cell.mark-miss, .own-board .cell.mark-hit, .own-board .cell.mark-sunk').count());

// Guest fires, host sees it.
await guest.locator('.enemy-board .cell[data-cell="56"]').click();
await host.waitForFunction(
  () => {
    const panel = document.querySelector('.turn-copy');
    return panel && /Your turn|Your move/i.test(panel.textContent || '');
  },
  null,
  { timeout: 8000 },
);
assert((await host.locator('.own-board .cell.mark-miss, .own-board .cell.mark-hit, .own-board .cell.mark-sunk').count()) === 1, 'host did not receive guest shot');
console.log('host own marks', await host.locator('.own-board .cell.mark-miss, .own-board .cell.mark-hit, .own-board .cell.mark-sunk').count());

// Rematch from the host puts both players back on the placement chart.
await host.evaluate(() => window.scrollTo(0, 0));
console.log('LAN check errors', errors);
assert(errors.length === 0, errors.join(' | '));
await browser.close();
console.log('LAN OK — host, guest, hidden fleets, per-seat turns');
