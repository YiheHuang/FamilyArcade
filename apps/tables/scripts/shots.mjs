import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5187';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function nearWin(side) {
  const points = Array(24).fill(0);
  if (side === 'W') {
    points[0] = 1;
    points[16] = -1;
    points[17] = -2;
    points[18] = -2;
    points[19] = -2;
    points[20] = -2;
    points[21] = -2;
    points[22] = -2;
    points[23] = -2;
  } else {
    points[23] = -1;
    points[0] = 2;
    points[1] = 2;
    points[2] = 2;
    points[3] = 2;
    points[4] = 2;
    points[5] = 2;
    points[6] = 2;
    points[7] = 1;
  }
  return {
    version: 1,
    mode: 'local',
    level: 'normal',
    savedAt: Date.now(),
    state: {
      points,
      bar: { W: 0, B: 0 },
      off: side === 'W' ? { W: 14, B: 0 } : { W: 0, B: 14 },
      turn: side,
      status: 'awaiting-roll',
      dice: [],
      roll: null,
      winner: null,
      first: 'W',
      turnNo: 41,
      lastMove: null,
      turnMoves: [],
      log: [],
    },
  };
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.tables.save');
    localStorage.removeItem('familyarcade.tables.record');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function finishFixture(page, side) {
  await page.evaluate((fixture) => {
    localStorage.setItem('familyarcade.tables.save', JSON.stringify(fixture));
  }, nearWin(side));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue last game|继续上局/ }).click();
  await page.getByRole('button', { name: /^Roll dice$|^掷骰$/ }).click();
  await page.waitForTimeout(250);
  await page.locator(side === 'W' ? '[data-point="0"]' : '[data-point="23"]').click();
  await page.getByTestId(side === 'W' ? 'off-white' : 'off-black').click();
  await page.waitForTimeout(450);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  console.log(`${lang}: home`);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against the AI|和 AI 下一局/ }).click();
  console.log(`${lang}: setup`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /^Begin$|^开始$/ }).click();
  console.log(`${lang}: game`);
  await page.getByRole('button', { name: /^Roll dice$|^掷骰$/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  const target = page.locator('.point.target').first();
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /← Home|← 主页/ }).click();
  console.log(`${lang}: rules`);
  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /^Close$|^关闭$/ }).click();

  // Three real finishes so the family record has honest numbers in the stats shot.
  await finishFixture(page, 'W');
  console.log(`${lang}: game over`);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });
  await page.getByRole('button', { name: /← Home|← 主页/ }).click();
  await finishFixture(page, 'B');
  await page.getByRole('button', { name: /← Home|← 主页/ }).click();
  await finishFixture(page, 'W');
  await page.getByRole('button', { name: /← Home|← 主页/ }).click();
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(250);
  console.log(`${lang}: stats`);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  console.log(`${lang}: mobile`);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await mobile.getByRole('button', { name: /^Roll dice$|^掷骰$/ }).click();
  await mobile.waitForTimeout(250);
  await mobile.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await mobile.waitForTimeout(250);
  const mobileTarget = mobile.locator('.point.target').first();
  if (await mobileTarget.count()) {
    await mobileTarget.click();
    await mobile.waitForTimeout(350);
  }
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

const langs = process.env.SHOT_LANG ? [process.env.SHOT_LANG] : ['en', 'zh'];
for (const lang of langs) await run(lang);
