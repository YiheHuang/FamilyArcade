import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5202';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const MATE = [
  [70, 7],
  [8, 7],
  [64, 1],
  [0, 1],
  [58, 49],
  [3, 13],
  [56, 47],
  [19, 73],
  [85, 76],
  [25, 23],
  [88, 69],
  [7, 79],
  [76, 67],
  [1, 64],
];

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

function point(page, index) {
  return page.locator(`.xq-point[data-index="${index}"]`);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.xiangqi.save');
    localStorage.removeItem('familyarcade.xiangqi.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function play(page, from, to) {
  await point(page, from).click();
  await point(page, to).click();
  await page.waitForTimeout(130);
}

async function playMate(page) {
  for (const [from, to] of MATE) await play(page, from, to);
  await page.waitForTimeout(250);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play the computer|和电脑下一局/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Begin|开始/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /^Two players|^两人同屏/ }).click();
  await play(page, 64, 67);
  await play(page, 1, 20);
  await play(page, 82, 65);
  await play(page, 7, 24);
  await play(page, 81, 82);
  await play(page, 0, 1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /^Two players|^两人同屏/ }).click();
  await playMate(page);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  await playMate(page);

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /View record|查看战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.getByRole('button', { name: /Play over the local network|局域网对战/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /^Two players|^两人同屏/ }).click();
  await play(mobile, 64, 67);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
