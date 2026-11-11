import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:5176';
const URL = `${BASE}/?tutorial=0&lang=en`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function firstSlot(page) {
  const slots = page.locator('.board-slot');
  assert(await slots.count(), 'no legal tile slot on screen');
  return slots.first();
}

async function placeFirst(page) {
  const before = await page.locator('[data-tile]').count();
  await (await firstSlot(page)).click();
  await page.waitForTimeout(250);
  await page.getByTestId('confirm-place').click();
  await page.waitForTimeout(600);
  const after = await page.locator('[data-tile]').count();
  assert(after >= before + 1, `tile count did not grow (${before} -> ${after})`);
}

async function playTarget(page, target) {
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${target.x},${target.y}"]`);
    if (await slot.count()) {
      await slot.click();
      await page.waitForTimeout(220);
      if (await page.getByTestId('confirm-place').count()) break;
    }
    await page.keyboard.press('r');
    await page.waitForTimeout(220);
  }
  if (target.meeple != null) {
    const chip = page.locator(`[data-feature="${target.meeple}"]`);
    if (await chip.count()) await chip.click();
  }
  await page.getByTestId('confirm-place').click();
  await page.waitForTimeout(900);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', (dialog) => dialog.accept());
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(await page.getByTestId('mode-solo').count(), 'home did not render');

  // Language switch is immediate.
  await page.getByTestId('toggle-lang').click();
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => document.documentElement.lang)) === 'zh-CN', 'language did not switch to zh');
  await page.getByTestId('toggle-lang').click();
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => document.documentElement.lang)) === 'en', 'language did not switch back');

  // Solo: human places, AI answers.
  await page.getByTestId('mode-solo').click();
  await page.waitForTimeout(300);
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(700);
  await placeFirst(page);
  await page.waitForTimeout(3500);
  const soloTiles = await page.locator('[data-tile]').count();
  assert(soloTiles >= 3, `AI did not place a tile (${soloTiles} on board)`);
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(500);

  // Hot-seat: place, undo, place, reload and resume.
  await page.getByTestId('mode-hotseat').click();
  await page.waitForTimeout(300);
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(700);
  await placeFirst(page);
  assert((await page.locator('[data-tile]').count()) === 2, 'hotseat tile was not placed');
  await page.getByTestId('undo').click();
  await page.waitForTimeout(500);
  assert((await page.locator('[data-tile]').count()) === 1, 'undo did not remove the tile');
  await placeFirst(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  assert(await page.getByTestId('continue-game').count(), 'continue card missing after reload');
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(700);
  assert((await page.locator('[data-tile]').count()) === 2, 'resume did not restore the tile');
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(500);

  // End, stats, replay.
  const endSave = await readFile('docs/end-save.en.json', 'utf8');
  const info = JSON.parse(await readFile('docs/demo-info.json', 'utf8'));
  await page.evaluate((json) => localStorage.setItem('fieldandwall.save.v1', json), endSave);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(700);
  await playTarget(page, info.target);
  assert(await page.getByTestId('end-dialog').count(), 'end dialog did not appear');
  const endText = await page.getByTestId('end-dialog').innerText();
  assert(/wins/i.test(endText), `end dialog lacks a winner: ${endText.slice(0, 120)}`);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fieldandwall.stats.v1') || '{}'),
  );
  assert(stored.games === 1, `stats games expected 1, got ${stored.games}`);

  await page.getByTestId('replay').click();
  await page.waitForTimeout(600);
  assert(await page.getByRole('heading', { name: /Replay/i }).count(), 'replay screen missing');
  await page.getByTestId('replay-next').click();
  await page.waitForTimeout(300);
  await page.getByTestId('back').click();
  await page.waitForTimeout(500);
  assert(await page.getByTestId('end-dialog').count(), 'back from replay did not return to the finished game');
  await page.getByTestId('modal-home').click();
  await page.waitForTimeout(400);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(500);
  assert(await page.getByRole('heading', { name: /Family stats/i }).count(), 'stats screen missing');
  await page.getByTestId('back').click();
  await page.waitForTimeout(300);

  // Mobile: no horizontal overflow, and a tile can be placed.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.on('dialog', (dialog) => dialog.accept());
  mobile.on('pageerror', (error) => errors.push(String(error)));
  await mobile.goto(URL, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  const demo = await readFile('docs/demo-save.en.json', 'utf8');
  await mobile.evaluate((json) => localStorage.setItem('fieldandwall.save.v1', json), demo);
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(500);
  await mobile.getByTestId('continue-game').click();
  await mobile.waitForTimeout(700);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!overflow, 'mobile page overflows horizontally');
  const before = await mobile.locator('[data-tile]').count();
  await (await firstSlot(mobile)).click();
  await mobile.waitForTimeout(250);
  await mobile.getByTestId('confirm-place').click();
  await mobile.waitForTimeout(600);
  const after = await mobile.locator('[data-tile]').count();
  assert(after === before + 1, `mobile tile was not placed (${before} -> ${after})`);
  await mobileContext.close();

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('E2E OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
