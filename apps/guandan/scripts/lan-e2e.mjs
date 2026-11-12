import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_PORT || 19020);
const BASE = `http://127.0.0.1:${PORT}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

if (!existsSync('dist/index.html')) {
  throw new Error('Run npm run build first (dist/index.html is missing).');
}

const relay = spawn(
  process.execPath,
  ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);
let relayLog = '';
let relayExited = false;
relay.stdout.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.stderr.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.on('exit', () => {
  relayExited = true;
});

async function waitForRelay() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (relayExited) {
      throw new Error(`LAN relay stopped before listening on ${BASE}\n${relayLog}`);
    }
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`LAN relay did not start on ${BASE}\n${relayLog}`);
}

async function handIds(page) {
  return page.locator('.hand .playing-card').evaluateAll((els) =>
    els.map((element) => element.getAttribute('data-card')),
  );
}

async function waitTurn(page, seat, timeout = 15000) {
  await page.waitForFunction(
    (value) => {
      const felt = document.querySelector('.felt');
      return felt?.getAttribute('data-turn') === String(value);
    },
    seat,
    { timeout },
  );
}

async function clickForSeat(pages, seat, action) {
  const host = pages[0];
  await waitTurn(host, seat);
  const page = pageForSeat(pages, seat);
  await waitTurn(page, seat);
  if (action === 'pass') {
    await page.locator('.pass-button').click();
    return;
  }
  const cards = page.locator('.hand .playing-card');
  const count = await cards.count();
  assert(count > 0, `seat ${seat} has no cards`);
  if (action === 'high') await cards.nth(count - 1).click();
  else await cards.nth(0).click();
  await page.locator('.play-button').click();
}

function pageForSeat(pages, seat) {
  const found = pages.find(
    (page) => Number(page._seat) === seat,
  );
  if (!found) throw new Error(`no page for seat ${seat}`);
  return found;
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await hostContext.newPage();
  host.on('pageerror', (error) => errors.push(`host: ${error}`));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
  });
  await host.addInitScript(() => {
    window.__GUANDAN_FAST__ = true;
    localStorage.setItem('familyarcade.lang', 'en');
  });
  await host.goto(BASE, { waitUntil: 'networkidle' });

  await host.getByRole('button', { name: /LAN table/ }).click();
  await host.getByPlaceholder('Host').fill('Mira');
  await host.getByRole('button', { name: /Create a room/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 12000 });
  const invite = await host.locator('.invite-link').getAttribute('href');
  assert(invite && invite.includes(`:${PORT}/`), `invite should stay on the relay port, got ${invite}`);

  const pages = [host];
  host._seat = 0;
  for (let index = 1; index <= 3; index += 1) {
    const context = await browser.newContext({
      viewport: index === 3
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: index === 3,
      hasTouch: index === 3,
      deviceScaleFactor: index === 3 ? 2 : 1,
    });
    const guest = await context.newPage();
    guest.on('pageerror', (error) => errors.push(`guest${index}: ${error}`));
    guest.on('console', (message) => {
      if (message.type() === 'error') errors.push(`guest${index} console: ${message.text()}`);
    });
    await guest.addInitScript(() => {
      window.__GUANDAN_FAST__ = true;
      localStorage.setItem('familyarcade.lang', 'en');
    });
    const url = new URL(invite);
    url.searchParams.set('name', `Guest ${index}`);
    await guest.goto(url.toString(), { waitUntil: 'networkidle' });
    await guest.waitForSelector('.waiting-card', { timeout: 12000 });
    pages.push(guest);
  }

  await host.waitForFunction(
    () => document.querySelectorAll('.peer-chip.online').length === 4,
    null,
    { timeout: 15000 },
  );
  assert((await host.locator('.peer-chip.online').count()) === 4, 'host should list four people');

  await host.getByRole('button', { name: /Start the game/ }).click();
  for (const page of pages) {
    await page.waitForSelector('.felt', { timeout: 12000 });
    await page.waitForSelector('.hand .playing-card', { timeout: 12000 });
  }
  for (const page of pages) {
    assert((await page.locator('.seat').count()) === 4, 'every LAN view should have four seats');
    page._seat = Number(await page.locator('.felt').getAttribute('data-seat'));
  }
  assert(
    pages.map((page) => page._seat).sort().join(',') === '0,1,2,3',
    `LAN seats were not unique: ${pages.map((page) => page._seat).join(',')}`,
  );

  const hands = await Promise.all(pages.map((page) => handIds(page)));
  assert(hands.every((hand) => hand.length === 27), 'each LAN seat should receive 27 cards');
  const union = new Set(hands.flat());
  assert(union.size === 108, `LAN hands should be disjoint and cover 108 cards, got ${union.size}`);
  for (let left = 0; left < hands.length; left += 1) {
    for (let right = left + 1; right < hands.length; right += 1) {
      assert(
        hands[left].every((id) => !hands[right].includes(id)),
        `seats ${left} and ${right} received overlapping cards`,
      );
    }
  }

  // Seat 0 leads low, seat 1 beats high, seats 2/3 pass, seat 0 passes:
  // the trick resets to seat 1, who leads again.
  let actions = 0;
  await clickForSeat(pages, 0, 'low');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 1, 'high');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 2, 'pass');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 3, 'pass');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 0, 'pass');
  actions += 1;
  await host.waitForTimeout(300);
  await waitTurn(host, 1);
  assert(
    (await host.locator('.trick-area.has-trick').count()) === 0,
    'three passes should clear the trick',
  );

  await clickForSeat(pages, 1, 'low');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 2, 'high');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 3, 'pass');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 0, 'pass');
  actions += 1;
  await host.waitForTimeout(220);
  await clickForSeat(pages, 1, 'pass');
  actions += 1;
  await host.waitForTimeout(300);
  await waitTurn(host, 2);
  assert(actions >= 10, `LAN turns did not advance enough (${actions})`);
  assert(
    (await host.locator('.trick-area.has-trick').count()) === 0,
    'the second three-pass sequence should clear the trick',
  );
  assert(
    (await pages[2].locator('.hand .playing-card').count()) < 27,
    'guest did not receive the updated private view',
  );

  // Reload a guest: same seat and current private hand return.
  const beforeReload = await pages[2].locator('.hand .playing-card').count();
  await pages[2].reload({ waitUntil: 'networkidle' });
  await pages[2].waitForSelector('.felt', { timeout: 12000 });
  await pages[2].waitForSelector('.hand .playing-card', { timeout: 12000 });
  await host.waitForTimeout(500);
  assert(
    Number(await pages[2].locator('.felt').getAttribute('data-seat')) === 2,
    'reconnected guest changed seat',
  );
  assert(
    (await pages[2].locator('.hand .playing-card').count()) === beforeReload,
    'reconnected guest did not get the current private hand',
  );

  await host.getByRole('button', { name: /Home/ }).click();
  await pages[1].waitForSelector('.error', { timeout: 6000 });
  const closed = await pages[1].locator('.error').innerText();
  assert(/closed the room|The host/i.test(closed), `guest should see the room closed, got: ${closed}`);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'LAN E2E OK — host room, invite, three guests, four unique seats, 108 disjoint cards, live turns, three-pass reset, guest reconnect, host close',
  );
} finally {
  if (browser) await browser.close();
  relay.kill();
}
