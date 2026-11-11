// Optional LAN smoke test. Start `npm run dev` and `npm run lan`, then run this file.
// It opens the host on :5182 and the guest from the relay's QR invite on :8080.
import { chromium } from 'playwright';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
host.on('pageerror', (error) => errors.push(`host: ${String(error)}`));
await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await host.goto('http://localhost:5182', { waitUntil: 'networkidle' });
await host.getByRole('button', { name: /LAN night/ }).click();
await host.locator('.room-code.big').waitFor({ timeout: 15000 });
const invite = await host.locator('.qr-card code').innerText();
console.log('invite', invite);

const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
guest.on('pageerror', (error) => errors.push(`guest: ${String(error)}`));
await guest.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await guest.goto(`http://${invite}`, { waitUntil: 'networkidle' });
await guest.getByRole('button', { name: /^Join$/ }).click();
await host.locator('.peer-list').getByText(/Guest/).waitFor({ timeout: 10000 });
const start = host.getByRole('button', { name: /Start the game/ });
await start.waitFor();
await start.click();
await guest.locator('.board').waitFor({ timeout: 10000 });
await guest.waitForTimeout(300);

assert((await guest.locator('.cell .disc').count()) === 4, 'guest did not receive the opening board');
await host.locator('.cell.legal').first().click();
await host.waitForTimeout(500);
assert((await guest.locator('.cell .disc').count()) === 5, 'host move did not reach the guest');
assert((await guest.locator('.score-card.black strong').innerText()) === '4', 'guest score did not update');

const guestLegal = guest.locator('.cell.legal');
assert((await guestLegal.count()) > 0, 'guest has no legal reply');
await guestLegal.first().click();
await guest.waitForTimeout(500);
const guestDiscs = await guest.locator('.cell .disc').count();
const hostDiscs = await host.locator('.cell .disc').count();
assert(guestDiscs === 6, `expected 6 discs after guest reply, got ${guestDiscs}`);
assert(hostDiscs === guestDiscs, 'host and guest boards diverged');
assert((await host.locator('.turn-note strong').innerText()).includes('Your turn'), 'turn did not return to host');

assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN OK — room, join, start, host move, guest intent, synchronized boards');
