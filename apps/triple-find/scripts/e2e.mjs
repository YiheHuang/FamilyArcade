import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const BASE = process.env.BASE_URL || 'http://localhost:5196';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once('error', () => {
        if (port - start > 40) reject(new Error('no free relay port'));
        else tryPort(port + 1);
      });
      server.once('listening', () => {
        const { port: actual } = server.address();
        server.close(() => resolve(actual));
      });
      server.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

async function waitForRelay(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`relay on ${port} did not start`);
}

async function scores(page) {
  return (await page.locator('.player-score').allInnerTexts()).map((value) => Number(value));
}

async function claimHinted(page) {
  const hint = page.locator('.tool-buttons .secondary').first();
  assert(!(await hint.isDisabled()), 'hint button unexpectedly disabled');
  await hint.click();
  await page.waitForTimeout(90);
  const hinted = page.locator('.card-face.is-hinted');
  assert((await hinted.count()) === 3, 'hint did not highlight three cards');
  const ids = [];
  for (let index = 0; index < 3; index += 1) {
    ids.push(await hinted.nth(index).getAttribute('data-card-id'));
  }
  for (const id of ids) {
    await page.locator(`.card-face[data-card-id="${id}"]`).click();
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(230);
}

async function finishByHints(page) {
  let claims = 0;
  for (let step = 0; step < 80; step += 1) {
    if (await page.locator('.result-overlay').isVisible().catch(() => false)) break;
    const active = (await page.locator('.player-chip.active').count()) > 0;
    if (!active) {
      const chips = page.locator('.player-chip');
      const count = await chips.count();
      let called = false;
      for (let offset = 0; offset < count; offset += 1) {
        const chip = chips.nth((step + offset) % count);
        if (!(await chip.isDisabled().catch(() => true))) {
          await chip.click();
          called = true;
          break;
        }
      }
      if (!called) {
        await page.waitForTimeout(280);
        continue;
      }
      await page.waitForTimeout(70);
    }
    const hint = page.locator('.tool-buttons .secondary').first();
    if (await hint.isDisabled().catch(() => true)) {
      await page.waitForTimeout(320);
      continue;
    }
    await hint.click();
    await page.waitForTimeout(80);
    const hinted = page.locator('.card-face.is-hinted');
    if ((await hinted.count()) !== 3) {
      await page.waitForTimeout(2150);
      continue;
    }
    const ids = [];
    for (let index = 0; index < 3; index += 1) {
      ids.push(await hinted.nth(index).getAttribute('data-card-id'));
    }
    for (const id of ids) {
      await page.locator(`.card-face[data-card-id="${id}"]`).click();
      await page.waitForTimeout(55);
    }
    claims += 1;
    await page.waitForTimeout(210);
  }
  return claims;
}

async function setOnPage(page) {
  const cards = await page.locator('.card-face').evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: Number(node.getAttribute('data-card-id')),
      c: Number(node.getAttribute('data-color')),
      s: Number(node.getAttribute('data-shape')),
      f: Number(node.getAttribute('data-fill')),
      n: Number(node.getAttribute('data-count')),
    })),
  );
  const isSet = (a, b, c) => {
    for (const key of ['c', 's', 'f', 'n']) {
      const values = [a[key], b[key], c[key]];
      const same = values[0] === values[1] && values[1] === values[2];
      const different =
        values[0] !== values[1] && values[1] !== values[2] && values[0] !== values[2];
      if (!same && !different) return false;
    }
    return true;
  };
  for (let i = 0; i < cards.length - 2; i += 1) {
    for (let j = i + 1; j < cards.length - 1; j += 1) {
      for (let k = j + 1; k < cards.length; k += 1) {
        if (isSet(cards[i], cards[j], cards[k])) return [cards[i], cards[j], cards[k]];
      }
    }
  }
  return null;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

let relay = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  watch(page, 'main');
  await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  assert((await page.locator('h1').innerText()) === 'Triple Find', 'home title missing');
  assert((await page.locator('.hero .card-face').count()) === 3, 'hero set missing');

  // Bilingual UI is real, not a string table.
  await page.getByRole('button', { name: '中文' }).click();
  await page.waitForTimeout(150);
  assert((await page.locator('h1').innerText()) === '三连找', 'Chinese UI did not switch');
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForTimeout(150);
  assert((await page.locator('h1').innerText()) === 'Triple Find', 'English UI did not return');

  // Solo against Hard: the AI should claim quickly.
  await page.getByRole('button', { name: /Solo vs AI/ }).first().click();
  await page.getByRole('button', { name: /Hard/ }).click();
  await page.getByRole('button', { name: /Start the race/ }).click();
  await page.waitForTimeout(3600);
  const aiScores = await scores(page);
  assert(aiScores[1] > 0, `Hard AI did not score (scores ${aiScores.join(',')})`);
  const aiTable = await page.locator('.card-face').count();
  assert(aiTable >= 12 && aiTable % 3 === 0, `table has an odd size after the AI claim: ${aiTable}`);
  await page.getByRole('button', { name: /Home/ }).click();

  // Hot-seat: call, hint, valid claim, undo, then a deliberately wrong claim.
  await page.getByRole('button', { name: /Hot-seat/ }).first().click();
  await page.getByRole('button', { name: /Start the table/ }).click();
  await page.waitForTimeout(250);
  assert((await page.locator('.card-face').count()) === 12, 'hot-seat table missing');
  assert((await page.locator('.player-chip').count()) === 2, 'hot-seat player count wrong');

  await page.locator('.player-chip').first().click();
  await page.waitForTimeout(100);
  assert((await page.locator('.player-chip.active').count()) === 1, 'call did not activate');
  await claimHinted(page);
  let hotScores = await scores(page);
  assert(hotScores[0] === 1, 'valid claim did not score');
  assert((await page.locator('.set-log li').count()) === 1, 'set log did not update');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(180);
  hotScores = await scores(page);
  assert(hotScores[0] === 0, 'undo did not restore the score');

  await page.locator('.player-chip').nth(1).click();
  await page.waitForTimeout(100);
  await page.locator('.tool-buttons .secondary').first().click();
  await page.waitForTimeout(90);
  const hinted = page.locator('.card-face.is-hinted');
  assert((await hinted.count()) === 3, 'hint missing for invalid-claim test');
  const hintedIds = [];
  for (let index = 0; index < 3; index += 1) {
    hintedIds.push(await hinted.nth(index).getAttribute('data-card-id'));
  }
  const allIds = await page
    .locator('.card-face')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-card-id')));
  const badId = allIds.find((id) => !hintedIds.includes(id));
  assert(badId !== undefined, 'no non-set card available');
  for (const id of [hintedIds[0], hintedIds[1], badId]) {
    await page.locator(`.card-face[data-card-id="${id}"]`).click();
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(320);
  assert(await page.locator('.selection-error').isVisible(), 'wrong claim gave no feedback');
  hotScores = await scores(page);
  assert(hotScores[0] === 0 && hotScores[1] === 0, 'wrong claim changed the score');
  await page.waitForTimeout(950);

  // Finish the whole deck through the real UI, then check the record.
  const claims = await finishByHints(page);
  assert(claims >= 20, `too few sets claimed before the end: ${claims}`);
  assert(await page.locator('.result-overlay').isVisible(), 'game did not finish');
  const resultText = await page.locator('.result-sheet').innerText();
  assert(/Final scores/i.test(resultText), 'result sheet lacks final scores');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.triple-find.record') || '{}'),
  );
  assert(stored.games === 1, `record games expected 1, got ${stored.games}`);
  assert(stored.bestScore > 0, 'record best score not updated');
  assert(stored.players && stored.players['Player 1'], 'record player missing');

  await page.getByRole('button', { name: /See the family record/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('.leaderboard tbody tr').count()) >= 1, 'leaderboard empty');
  assert((await page.locator('.recent-list li').count()) === 1, 'recent game missing');
  await page.getByRole('button', { name: /Back/ }).click();

  // Autosave survives a reload and Continue restores the score.
  await page.getByRole('button', { name: /Hot-seat/ }).first().click();
  await page.getByRole('button', { name: /Start the table/ }).click();
  await page.waitForTimeout(220);
  await page.locator('.player-chip').first().click();
  await page.waitForTimeout(90);
  await claimHinted(page);
  assert((await scores(page))[0] === 1, 'autosave setup claim failed');
  await page.reload({ waitUntil: 'networkidle' });
  const continueButton = page.getByRole('button', { name: /Continue last game/ });
  assert(await continueButton.isVisible(), 'Continue card missing after reload');
  await continueButton.click();
  await page.waitForTimeout(250);
  assert((await scores(page))[0] === 1, 'resumed score was not preserved');
  assert((await page.locator('.card-face').count()) === 12, 'resumed table missing');
  await page.getByRole('button', { name: /Home/ }).click();
  await context.close();

  // Five-minute clock with Playwright's fake clock.
  const clockContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const clockPage = await clockContext.newPage();
  watch(clockPage, 'clock');
  await clockPage.clock.install({ time: new Date('2026-01-01T12:00:00') });
  await clockPage.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await clockPage.goto(BASE, { waitUntil: 'networkidle' });
  await clockPage.getByRole('button', { name: /Hot-seat/ }).first().click();
  await clockPage.getByRole('button', { name: /Start the table/ }).click();
  await clockPage.waitForTimeout(300);
  await clockPage.clock.fastForward(300_500);
  await clockPage.waitForTimeout(450);
  assert(await clockPage.locator('.result-overlay').isVisible(), 'clock did not finish the game');
  const clockResult = await clockPage.locator('.result-sheet').innerText();
  assert(/Time is up/i.test(clockResult), 'clock result did not say time is up');
  await clockContext.close();

  // Mobile layout and a real touch-sized claim.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  watch(mobile, 'mobile');
  await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  assert(await mobile.locator('h1').isVisible(), 'mobile home missing');
  await mobile.getByRole('button', { name: /Hot-seat/ }).first().click();
  await mobile.getByRole('button', { name: /Start the table/ }).click();
  await mobile.waitForTimeout(250);
  assert((await mobile.locator('.card-face').count()) === 12, 'mobile table missing');
  const boardBox = await mobile.locator('.card-table').boundingBox();
  assert(boardBox && boardBox.width <= 390, 'mobile table overflows viewport');
  await mobile.locator('.player-chip').first().click();
  await mobile.waitForTimeout(90);
  await claimHinted(mobile);
  assert((await scores(mobile))[0] === 1, 'mobile claim did not score');
  await mobileContext.close();

  // LAN: host on the dev server, guest on the relay, one real claim.
  const relayPort = await findFreePort(8137);
  relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(relayPort)],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  await waitForRelay(relayPort);

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  watch(host, 'lan-host');
  watch(guest, 'lan-guest');
  await host.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  const hostUrl = new URL(BASE);
  hostUrl.searchParams.set('lanPort', String(relayPort));
  await host.goto(hostUrl.toString(), { waitUntil: 'networkidle' });
  await host.getByRole('button', { name: /LAN night/ }).click();
  await host.waitForSelector('.room-code.big', { timeout: 15000 });
  const invite = await host.locator('.qr-card code').innerText();
  assert(await host.locator('.qr-card img').isVisible(), 'LAN QR missing');
  await guest.goto(`http://${invite}`, { waitUntil: 'networkidle' });
  await guest.getByRole('button', { name: /Join the room/ }).click();
  await guest.waitForTimeout(500);
  assert(await guest.locator('.waiting-card').isVisible(), 'guest did not reach the lobby');
  await host.waitForFunction(
    () => document.querySelectorAll('.peer-list li.online').length >= 2,
    null,
    { timeout: 15000 },
  );
  await host.getByRole('button', { name: /Start the game/ }).click();
  await guest.waitForSelector('.card-table', { timeout: 15000 });
  assert((await guest.locator('.card-face').count()) === 12, 'guest did not receive the table');

  const guestSet = await setOnPage(guest);
  assert(guestSet, 'no set found in the guest view');
  for (const card of guestSet) {
    await guest.locator(`.card-face[data-card-id="${card.id}"]`).click();
    await guest.waitForTimeout(80);
  }
  await guest.waitForTimeout(900);
  const guestScores = await scores(guest);
  const hostScores = await scores(host);
  assert(guestScores.reduce((sum, value) => sum + value, 0) === 1, 'guest claim did not score');
  assert(hostScores.reduce((sum, value) => sum + value, 0) === 1, 'host view did not score');
  assert((await guest.locator('.set-log li').count()) === 1, 'guest set log missing');
  await guestContext.close();
  await hostContext.close();
  relay.kill();
  relay = null;

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log(
    'E2E OK — bilingual UI, solo AI, hot-seat, invalid call, undo, full deck, record, autosave, 5-minute clock, mobile, LAN claim',
  );
} finally {
  if (relay) relay.kill();
  await browser.close();
}
