import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5181';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.four.save');
  }, lang);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(500);
}

async function drop(page, column) {
  await page.locator('.col').nth(column).click();
  await page.waitForTimeout(180);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: DESKTOP });
    await setLang(page, lang);
    await page.screenshot({ path: path.join(dir, 'home.png') });

    await page.getByRole('button', { name: /Play against|和 AI/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, 'setup.png') });

    await page.getByRole('button', { name: /Begin|开始/ }).click();
    await page.waitForTimeout(300);
    for (const column of [3, 2, 4]) {
      await drop(page, column);
      await page.waitForTimeout(850);
    }
    await page.screenshot({ path: path.join(dir, 'game.png') });

    await page.getByRole('button', { name: /Hint|提示/ }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(dir, 'game-hint.png') });

    await page.getByRole('button', { name: /Home|主页/ }).click();
    await page.getByRole('button', { name: /Rules|规则/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, 'rules.png') });
    await page.getByRole('button', { name: /Close|关闭/ }).click();

    await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
    for (const column of [0, 1, 1, 2, 2, 3, 2, 3, 3, 0, 3]) await drop(page, column);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(dir, 'game-over.png') });

    await page.getByRole('button', { name: /Home|主页/ }).click();
    await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, 'stats.png') });

    const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await setLang(mobile, lang);
    await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
    await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
    for (const column of [3, 3, 2, 4]) {
      await mobile.locator('.col').nth(column).click();
      await mobile.waitForTimeout(160);
    }
    await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });
  } finally {
    await browser.close();
  }
  console.log(`screenshots ${lang}: ok`);
}

const LANGS = (process.env.SHOTS_LANGS || 'en,zh').split(',').filter(Boolean);
for (const lang of LANGS) await run(lang);