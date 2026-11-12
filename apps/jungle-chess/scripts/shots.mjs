import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5207';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const DEN_WIN = [
  [46, 45],
  [0, 7],
  [45, 38],
  [6, 13],
  [38, 31],
  [8, 1],
  [31, 24],
  [12, 5],
  [24, 17],
  [18, 19],
  [17, 10],
  [20, 27],
  [10, 3],
];

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function clickMoves(page, moves) {
  for (const [from, to] of moves) {
    await page.locator('.cell').nth(from).click();
    await page.waitForTimeout(70);
    await page.locator('.cell').nth(to).click();
    await page.waitForTimeout(100);
  }
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);

  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.jungle-chess.record');
    localStorage.removeItem('familyarcade.jungle-chess.save');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against|和电脑/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /^Begin$|^开始$/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.getByRole('button', { name: /^Close$|^关闭$/ }).click();
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await clickMoves(page, DEN_WIN);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Play on the same Wi-Fi|同一局域网对战/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await mobile.locator('.cell').nth(46).click();
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);

