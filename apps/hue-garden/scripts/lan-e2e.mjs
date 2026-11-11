import { chromium } from 'playwright';

const HOST = process.env.BASE_URL || 'http://localhost:5174';
const LAN = process.env.LAN_BASE || 'http://localhost:8097';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function stagePlay(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const tiles = page.locator('.rack .tile');
    const count = await tiles.count();
    for (let i = 0; i < count; i++) {
      await tiles.nth(i).click();
      await page.waitForTimeout(150);
      if (await page.locator('.legal-cell').count()) {
        await page.locator('.legal-cell').first().click();
        await page.waitForTimeout(180);
        await page.getByTestId('confirm-move').click();
        await page.waitForTimeout(650);
        return true;
      }
      await tiles.nth(i).click();
    }
    await page.waitForTimeout(350);
  }
  return false;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
host.on('pageerror', (error) => errors.push(`host: ${error}`));
host.on('console', (message) => {
  if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
});
await host.goto(`${HOST}/?tutorial=0&lang=en`, { waitUntil: 'networkidle' });
await host.evaluate(() => localStorage.clear());
await host.reload({ waitUntil: 'networkidle' });
await host.waitForTimeout(400);
await host.getByTestId('mode-lan').click();
await host.getByTestId('lan-create').click();
await host.getByTestId('lan-invite').waitFor({ timeout: 12000 });
const invite = `http://${await host.getByTestId('lan-invite').innerText()}`;
assert(invite.startsWith(LAN), `invite should use the LAN relay, got ${invite}`);

const guest = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
guest.on('console', (message) => {
  if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
});
await guest.goto(invite, { waitUntil: 'networkidle' });
await guest.getByTestId('lan-guest-status').waitFor({ timeout: 12000 });
assert((await host.getByTestId('lan-players').innerText()).includes('2 / 2'), 'host did not see the guest');
assert(
  /seat\s*:?\s*2/i.test(await guest.getByTestId('lan-guest-status').innerText()),
  'guest seat not assigned',
);

await host.getByTestId('lan-start').click();
await host.locator('.game').waitFor({ timeout: 8000 });
await guest.locator('.game').waitFor({ timeout: 8000 });
assert((await guest.locator('.turn-banner').innerText()).includes('Host to play'), 'guest should see host turn');
assert(await guest.getByTestId('undo').isDisabled(), 'guest undo should be disabled');

assert(await stagePlay(host), 'host could not make a move');
assert((await guest.locator('.turn-banner').innerText()).includes('Guest to play'), 'guest did not receive host view');
assert(await stagePlay(guest), 'guest could not make a move');
assert((await host.locator('.turn-banner').innerText()).includes('Host to play'), 'host did not receive guest intent');

// Reconnect: reload reuses the guest token and returns to the same seat.
await guest.reload({ waitUntil: 'networkidle' });
await guest.locator('.game').waitFor({ timeout: 12000 });
assert(/1 guest/i.test(await host.getByTestId('lan-game-status').innerText()), 'host lost guest after reconnect');
assert(
  /seat\s*:?\s*2/i.test(await guest.getByTestId('lan-game-status').innerText()),
  'guest did not return to seat 2',
);
assert((await guest.locator('.turn-banner').innerText()).includes('Host to play'), 'guest view missing after reconnect');

// Host sees the guest go offline when the page is closed.
await guest.close();
await host.waitForTimeout(1200);
assert(/0 guest/i.test(await host.getByTestId('lan-game-status').innerText()), 'host did not show guest offline');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN E2E OK — host/guest, views, intents, reconnect, offline seat');
