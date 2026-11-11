import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5180';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.triple.save');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function clickCell(page, index) {
  await page.locator('.cell').nth(index).click();
  await page.waitForTimeout(180);
}

async function playLocal(page, moves) {
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  for (const move of moves) await clickCell(page, move);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against|和 AI/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Begin|开始/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await playLocal(page, [0, 3, 1, 4, 2]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Two more finished games give the record screen real recent history.
  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  for (const move of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await clickCell(page, move);
  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  for (const move of [0, 3, 1, 4, 2]) await clickCell(page, move);

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /View record|查看战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /LAN night|局域网对战/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await clickCell(mobile, 4);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
