import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5201';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.gomoku.save');
    localStorage.removeItem('familyarcade.gomoku.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function clickCell(page, index, wait = 140) {
  await page.locator('.cell').nth(index).click();
  await page.waitForTimeout(wait);
}

async function playLocal(page, moves) {
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  for (const move of moves) await clickCell(page, move);
}

async function emptyNearCentre(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('.cell')];
    const prefs = [97, 98, 99, 111, 113, 126, 127, 128, 112];
    return prefs.find(
      (index) =>
        !cells[index].classList.contains('has-b') && !cells[index].classList.contains('has-w'),
    );
  });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against|和电脑/ }).click();
  await page.locator('.level-card').nth(3).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Begin|开始/ }).click();
  await page.waitForTimeout(300);
  await clickCell(page, 112, 80);
  await page.waitForFunction(() => document.querySelectorAll('.cell .stone').length >= 2, {
    timeout: 12000,
  });
  const empty = await emptyNearCentre(page);
  if (typeof empty === 'number') await clickCell(page, empty, 80);
  await page.waitForFunction(() => document.querySelectorAll('.cell .stone').length >= 4, {
    timeout: 12000,
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();

  await playLocal(page, [0, 15, 1, 16, 2, 17, 3, 18, 4]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  await playLocalMoves(page, [0, 15, 2, 16, 4, 17, 6, 18, 8, 19]);
  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  await playLocalMoves(page, [0, 15, 1, 16, 2, 17, 3, 18, 4]);

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /View record|查看战绩/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Same-network night|同一网络对战/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await clickCell(mobile, 112);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

async function playLocalMoves(page, moves) {
  for (const move of moves) await clickCell(page, move);
}

await run('en');
await run('zh');
process.exit(0);
