import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const URL = `${BASE}/?tutorial=0&lang=en`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function stageFirstPlay(page) {
  const tiles = page.locator('.rack .tile');
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    await tiles.nth(i).click();
    await page.waitForTimeout(150);
    const target = page.locator('.legal-cell').first();
    if (await target.count()) {
      await target.click();
      await page.waitForTimeout(250);
      return true;
    }
    await tiles.nth(i).click();
    await page.waitForTimeout(60);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', (dialog) => dialog.accept());
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(await page.getByTestId('mode-solo').count(), 'home did not render');

  // Solo: human move, then the AI replies.
  await page.getByTestId('mode-solo').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(500);
  assert(await stageFirstPlay(page), 'solo: no legal human move');
  await page.getByTestId('confirm-move').click();
  await page.waitForTimeout(2800);
  const turnText = await page.locator('.turn-banner small').innerText();
  assert(/Turn\s*[3-9]/.test(turnText) || /Turn\s*[1-9][0-9]/.test(turnText), `AI did not reply: ${turnText}`);
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(350);

  // Hot-seat: move, undo, and verify the last move disappears.
  await page.getByTestId('mode-hotseat').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(500);
  assert(await stageFirstPlay(page), 'hotseat: no legal move');
  await page.getByTestId('confirm-move').click();
  await page.waitForTimeout(500);
  const lastAfterMove = await page.locator('.game__last').innerText();
  assert(/Player 1/.test(lastAfterMove), `last move not shown: ${lastAfterMove}`);
  await page.getByTestId('undo').click();
  await page.waitForTimeout(500);
  const lastAfterUndo = await page.locator('.game__last').count();
  assert(!lastAfterUndo, 'undo did not clear the last move');

  // Resume after reload.
  assert(await stageFirstPlay(page), 'resume: no legal move');
  await page.getByTestId('confirm-move').click();
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(await page.getByTestId('continue-game').count(), 'continue card missing after reload');
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(500);
  assert(await page.locator('.game__panel').count(), 'resume did not return to the game');
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(350);

  // Win, stats, replay.
  await page.evaluate(() => localStorage.clear());
  const winSave = await readFile('docs/win-state.en.json', 'utf8');
  await page.evaluate((json) => localStorage.setItem('huegarden.save.v1', json), winSave);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(550);
  await page.locator('.rack .tile').first().click();
  await page.waitForTimeout(200);
  const winCell = page.locator('.legal-cell').first();
  assert(await winCell.count(), 'win state has no legal cell');
  await winCell.click();
  await page.waitForTimeout(250);
  await page.getByTestId('confirm-move').click();
  await page.waitForTimeout(800);
  const dialog = page.getByRole('dialog');
  assert(await dialog.count(), 'win dialog did not appear');
  const dialogText = await dialog.innerText();
  assert(/wins/i.test(dialogText), `win dialog lacks winner: ${dialogText}`);
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('huegarden.stats.v1') || '{}'));
  assert(stats.games === 1, `stats games expected 1, got ${stats.games}`);
  assert(Object.keys(stats.wins ?? {}).length >= 1, 'stats wins missing');

  await page.getByTestId('replay').click();
  await page.waitForTimeout(500);
  assert(await page.getByRole('heading', { name: /Replay/i }).count(), 'replay screen missing');
  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  assert(await page.getByRole('dialog').count(), 'back from replay should return to the finished game');

  // Language switch keeps the app alive.
  await page.getByTestId('modal-home').click();
  await page.waitForTimeout(350);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(350);
  await page.getByTestId('back').click();
  await page.waitForTimeout(250);
  const langButton = page.getByRole('button', { name: '中文' });
  if (await langButton.count()) {
    await langButton.click();
    await page.waitForTimeout(250);
    assert((await page.locator('body').innerText()).includes('彩庭'), 'language switch did not show Chinese');
  }

  // Mobile overflow.
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(URL, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(500);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'mobile page overflows horizontally');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('E2E OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
