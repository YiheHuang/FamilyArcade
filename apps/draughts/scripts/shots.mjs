import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5183';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const demo = JSON.parse(
  readFileSync(new URL('./demo-game.json', import.meta.url), 'utf8'),
);

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(320);
}

async function playMove(page, move) {
  for (const square of [move.from, ...move.path.slice(1)]) {
    await page.locator('.square').nth(square).click();
    await page.waitForTimeout(40);
  }
}

async function playSequence(page, from, to) {
  for (let index = from; index < to; index++) {
    await playMove(page, demo.moves[index]);
  }
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against|和 AI/ }).click();
  await page.getByRole('button', { name: /Hard|挑战/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'setup.png') });
  await page.getByRole('button', { name: /Back|返回/ }).first().click();

  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();

  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await page.waitForTimeout(260);
  await playSequence(page, 0, 12);
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });
  await page.keyboard.press('Escape');

  await playSequence(page, 12, demo.moves.length);
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await mobile.waitForTimeout(260);
  await mobile.locator('.square').nth(42).click();
  await mobile.waitForTimeout(260);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
