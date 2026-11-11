import { chromium } from 'playwright';

const HOST = process.env.BASE_URL || 'http://localhost:5192';
const LAN_PORT = process.env.LAN_PORT || '8080';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function takeTurn(page, label) {
  await page.locator('.turn-bar strong').filter({ hasText: /Your turn|轮到你了/ }).waitFor({ timeout: 8000 });
  const playable = page.locator('.hand .pcard.is-playable');
  if ((await playable.count()) > 0) {
    await playable.first().click();
    await page.waitForTimeout(350);
    if (await page.locator('.color-modal').isVisible()) {
      await page.locator('.color-choice').first().click();
      await page.waitForTimeout(350);
    }
    console.log(`${label}: played`);
  } else {
    const draw = page.locator('.draw-stack');
    if (await draw.isEnabled()) {
      await draw.click();
      await page.waitForTimeout(350);
    }
    const pass = page.getByRole('button', { name: /^Pass$|^过牌$/ });
    if (await pass.isEnabled()) {
      await pass.click();
      await page.waitForTimeout(350);
    }
    console.log(`${label}: drew and passed`);
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
for (const page of [host, guest]) {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

await host.goto(`${HOST}/?lanPort=${LAN_PORT}`, { waitUntil: 'domcontentloaded' });
await host.waitForTimeout(400);
await host.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('familyarcade.lang', 'en');
});
await host.reload({ waitUntil: 'domcontentloaded' });
await host.waitForTimeout(400);
await host.getByRole('button', { name: /LAN night/ }).click();
await host.waitForTimeout(300);
await host.getByRole('button', { name: /Open a room/ }).click();
await host.locator('.room-code.big').waitFor({ timeout: 12000 });
const inviteText = (await host.locator('.qr-card code').innerText()).trim();
assert(inviteText.startsWith(`localhost:${LAN_PORT}/?lan=`), `unexpected invite: ${inviteText}`);
const invite = `http://${inviteText}`;
console.log(`room invite: ${invite}`);

await guest.goto(invite, { waitUntil: 'networkidle' });
await guest.getByLabel(/Your name/).fill('Robin');
await guest.getByRole('button', { name: /^Join$/ }).click();
await host.waitForTimeout(700);
assert((await host.locator('.peer-list').innerText()).includes('Robin'), 'guest did not appear in host lobby');

await host.getByRole('button', { name: /Start the match/ }).click();
await host.waitForTimeout(900);
assert((await host.locator('.hand .pcard').count()) === 7, 'host hand missing');
assert((await guest.locator('.hand .pcard').count()) === 7, 'guest hand missing');
assert((await guest.locator('.opponent .pcard:not(.pcard-back)').count()) === 0, 'guest can see host cards');
assert((await guest.locator('.score-list').innerText()).includes('Host'), 'guest scoreboard missing host');
assert((await host.locator('.score-list').innerText()).includes('Robin'), 'host scoreboard missing guest');

// Host opens; then keep playing host turns until the guest gets the turn.
await takeTurn(host, 'host');
let guestTurnSeen = false;
for (let step = 0; step < 8 && !guestTurnSeen; step++) {
  await host.waitForTimeout(550);
  const guestTurn = (await guest.locator('.turn-bar strong').innerText()).includes('Your turn');
  if (guestTurn) {
    guestTurnSeen = true;
    break;
  }
  const hostTurn = (await host.locator('.turn-bar strong').innerText()).includes('Your turn');
  assert(hostTurn, 'neither seat has the turn after a host move');
  await takeTurn(host, 'host extra');
}
assert(guestTurnSeen, 'guest never received a turn');
assert((await guest.locator('.hand .pcard').count()) > 0, 'guest lost their hand');
await guest.getByRole('button', { name: /^Hint$/ }).click();
await guest.waitForTimeout(1200);
assert(await guest.locator('.toast').isVisible(), 'private LAN hint did not arrive');
await takeTurn(guest, 'guest');
await host.waitForTimeout(600);
assert((await host.locator('.table-talk li').count()) > 0, 'host table talk empty');
assert((await guest.locator('.table-talk li').count()) > 0, 'guest table talk empty');
assert(await guest.getByRole('button', { name: /^Undo$/ }).isDisabled(), 'guest undo should be disabled');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAN E2E OK — host+guest, private hands, host play, guest hint, guest play, undo lock');
