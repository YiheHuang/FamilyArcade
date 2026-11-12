import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5214';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const DRAW_BOARD = [6, 0, 5, 14, 15, 13, 3, 2, 4, 10, 11, 9, 8, 1, 12, 7];

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.quarto.save');
    localStorage.removeItem('familyarcade.quarto.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function choose(page, piece) {
  await page.locator(`.piece-slot[data-piece="${piece}"]`).click();
  await page.waitForTimeout(110);
}

async function place(page, cell) {
  await page.locator(`.cell[data-cell="${cell}"]`).click();
  await page.waitForTimeout(110);
}

async function playPairs(page, pairs) {
  for (const [piece, cell] of pairs) {
    await choose(page, piece);
    await place(page, cell);
  }
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.locator('[data-nav=ai]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });
  await page.locator('.back').click();
  await page.waitForTimeout(200);

  // A mid-game selection position shows the piece bank and the board.
  await page.locator('[data-nav=local]').click();
  await playPairs(page, [[0, 0], [2, 1], [4, 2], [8, 5]]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  // Hand a piece over, then ask for the winning placement hint.
  await choose(page, 12);
  await page.locator('[data-action=hint]').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await place(page, 3);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Player 1 wins the next game; then a full-board draw.
  await page.locator('[data-action=restart]').click();
  await playPairs(page, [[0, 0], [2, 1], [4, 2], [6, 3]]);

  await page.locator('[data-action=restart]').click();
  for (let index = 0; index < 16; index += 1) {
    await choose(page, DRAW_BOARD[index]);
    await place(page, index);
  }
  await page.waitForTimeout(250);

  await page.locator('[data-action=home]').click();
  await page.locator('[data-nav=stats]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('[data-action=home]').click();
  await page.locator('[data-nav=rules]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.locator('[data-action=close]').click();
  await page.locator('[data-nav=lan]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.locator('[data-nav=local]').click();
  await playPairs(mobile, [[0, 0], [2, 1], [4, 2], [8, 5]]);
  await choose(mobile, 12);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
