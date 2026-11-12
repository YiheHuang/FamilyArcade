import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5203';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.chess.save');
    localStorage.removeItem('familyarcade.chess.record');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function move(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.waitForTimeout(55);
  await page.locator(`[data-square="${to}"]`).click();
  await page.waitForTimeout(150);
}

async function play(page, moves) {
  for (const [from, to] of moves) await move(page, from, to);
}

const OPENING = [
  ['e2', 'e4'],
  ['e7', 'e5'],
  ['g1', 'f3'],
  ['b8', 'c6'],
  ['f1', 'c4'],
  ['g8', 'f6'],
];

const SCHOLARS_MATE = [
  ['e2', 'e4'],
  ['e7', 'e5'],
  ['f1', 'c4'],
  ['b8', 'c6'],
  ['d1', 'h5'],
  ['g8', 'f6'],
  ['h5', 'f7'],
];

const FOOLS_MATE = [
  ['f2', 'f3'],
  ['e7', 'e5'],
  ['g2', 'g4'],
  ['d8', 'h4'],
];

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  const aiButton = lang === 'zh' ? /和电脑下棋/ : /Play the computer/;
  const backButton = lang === 'zh' ? /返回/ : /Back/;
  const localButton = lang === 'zh' ? '两人同屏' : 'Two players, one screen';
  const hintButton = lang === 'zh' ? '提示' : 'Hint';
  const playAgain = lang === 'zh' ? '再来一局' : 'Play again';
  const homeButton = lang === 'zh' ? /主页/ : /Home/;
  const rulesButton = lang === 'zh' ? /规则/ : /^Rules/;
  const closeButton = lang === 'zh' ? '关闭' : 'Close';
  const recordButton = lang === 'zh' ? /家庭战绩/ : /Family record/;
  const lanButton = lang === 'zh' ? '局域网对战' : 'Play on the local network';

  await page.getByRole('button', { name: aiButton }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: backButton }).first().click();
  await page.getByRole('button', { name: localButton, exact: true }).click();
  await play(page, OPENING);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: hintButton }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: homeButton }).click();
  await page.getByRole('button', { name: localButton, exact: true }).click();
  await play(page, SCHOLARS_MATE);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: playAgain }).click();
  await play(page, FOOLS_MATE);
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: homeButton }).click();
  await page.getByRole('button', { name: rulesButton }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: closeButton }).click();

  await page.getByRole('button', { name: recordButton }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: homeButton }).click();
  await page.getByRole('button', { name: lanButton }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: localButton, exact: true }).click();
  for (const [from, to] of [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
  ]) {
    await mobile.locator(`[data-square="${from}"]`).click();
    await mobile.waitForTimeout(55);
    await mobile.locator(`[data-square="${to}"]`).click();
    await mobile.waitForTimeout(150);
  }
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
