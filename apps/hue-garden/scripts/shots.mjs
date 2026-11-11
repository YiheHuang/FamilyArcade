import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const OUT = path.resolve('docs/screenshots');
const LANG = process.env.LANG_CODE || 'en';
const URL = `${BASE}/?tutorial=0&lang=${LANG}`;

async function loadSave(page, file) {
  const json = await readFile(path.resolve(file), 'utf8');
  await page.evaluate((value) => localStorage.setItem('huegarden.save.v1', value), json);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(550);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(750);
}

async function stageFirstPlay(page) {
  const tiles = page.locator('.rack .tile');
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    await tiles.nth(i).click();
    await page.waitForTimeout(180);
    if (await page.locator('.legal-cell').count()) {
      await page.locator('.legal-cell').first().click();
      await page.waitForTimeout(350);
      return true;
    }
    await tiles.nth(i).click();
    await page.waitForTimeout(80);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await mkdir(path.join(OUT, LANG), { recursive: true });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, LANG, 'home.png') });

  await page.getByTestId('mode-hotseat').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, LANG, 'setup.png') });

  await page.evaluate(() => localStorage.clear());
  await loadSave(page, `docs/demo-state.${LANG}.json`);
  await page.screenshot({ path: path.join(OUT, LANG, 'game.png') });
  if (await stageFirstPlay(page)) {
    await page.screenshot({ path: path.join(OUT, LANG, 'game-select.png') });
  }

  await page.getByTestId('game-home').click();
  await page.waitForTimeout(450);
  await page.getByTestId('home-rules').click();
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(OUT, LANG, 'rules.png') });

  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.getByTestId('home-settings').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, LANG, 'settings.png') });

  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.evaluate(() => localStorage.clear());
  await loadSave(page, `docs/win-state.${LANG}.json`);
  const tile = page.locator('.rack .tile').first();
  await tile.click();
  await page.waitForTimeout(250);
  await page.locator('.legal-cell').first().click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-move').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, LANG, 'game-over.png') });

  await page.getByTestId('modal-home').click();
  await page.waitForTimeout(500);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, LANG, 'stats.png') });

  // Optional richer replay screenshot.
  const replayButtons = page.locator('[data-testid^="replay-"]');
  if (await replayButtons.count()) {
    await replayButtons.first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, LANG, 'replay.png') });
    await page.getByTestId('back').click();
    await page.waitForTimeout(350);
  }

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('dialog', (dialog) => dialog.accept());
  await mobile.goto(URL, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  await loadSave(mobile, `docs/demo-state.${LANG}.json`);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: path.join(OUT, LANG, 'game-mobile.png') });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: path.join(OUT, LANG, 'home-mobile.png') });

  await browser.close();
  console.log(`screenshots written to ${OUT}/${LANG}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
