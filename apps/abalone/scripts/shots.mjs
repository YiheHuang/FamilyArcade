import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5212';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const PREWIN = JSON.parse(
  readFileSync(new URL('./fixtures/abalone-prewin.json', import.meta.url), 'utf8'),
);

const T = {
  en: {
    ai: /Play the computer/,
    local: /Two players, one screen/,
    begin: /Begin/,
    hint: /^Hint$/,
    home: /Home/,
    rules: /^Rules/,
    close: /Close/,
    continue: /Continue last game/,
    record: /Family record/,
  },
  zh: {
    ai: /和电脑下一局/,
    local: /两人同屏/,
    begin: /开始/,
    hint: /^提示$/,
    home: /主页/,
    rules: /^规则/,
    close: /关闭/,
    continue: /继续上局/,
    record: /家庭战绩/,
  },
};

async function prepare(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.abalone.save');
    localStorage.removeItem('familyarcade.abalone.record');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}

async function shot(page, dir, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, name) });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const labels = T[lang];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await prepare(page, lang);
  await shot(page, dir, 'home.png');

  await page.getByRole('button', { name: labels.ai }).click();
  await shot(page, dir, 'setup.png');

  await page.getByRole('button', { name: labels.begin }).click();
  await shot(page, dir, 'game.png');

  for (const index of [11, 12, 13]) {
    await page.locator(`.ab-point[data-index="${index}"]`).click();
    await page.waitForTimeout(70);
  }
  await shot(page, dir, 'game-select.png');

  await page.getByRole('button', { name: labels.hint }).click();
  await page.waitForSelector('.ab-point.hint-source', { timeout: 30000 });
  await shot(page, dir, 'game-hint.png');

  await page.getByRole('button', { name: labels.home }).click();
  await page.getByRole('button', { name: labels.rules }).click();
  await shot(page, dir, 'rules.png');
  await page.getByRole('button', { name: labels.close }).click();

  await page.evaluate((state) => {
    localStorage.setItem(
      'familyarcade.abalone.save',
      JSON.stringify({ version: 1, state, mode: 'local', level: 'normal', savedAt: Date.now() }),
    );
  }, PREWIN);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: labels.continue }).click();
  await page.locator('.ab-point[data-index="12"]').click();
  await page.locator('.ab-point[data-index="6"]').click();
  await page.locator('.direction-button[data-dir="NE"]').click();
  await page.waitForSelector('.result-banner', { timeout: 5000 });
  await shot(page, dir, 'game-over.png');

  await page.getByRole('button', { name: labels.home }).click();
  await page.getByRole('button', { name: labels.record }).click();
  await shot(page, dir, 'stats.png');

  const mobileContext = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    isMobile: MOBILE.isMobile,
    hasTouch: MOBILE.hasTouch,
  });
  const mobile = await mobileContext.newPage();
  await prepare(mobile, lang);
  await shot(mobile, dir, 'home-mobile.png');
  await mobile.getByRole('button', { name: labels.local }).click();
  await mobile.locator('.ab-point[data-index="13"]').click();
  await shot(mobile, dir, 'game-mobile.png');
  await mobileContext.close();

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
