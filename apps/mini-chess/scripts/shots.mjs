import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { clickSquare, playCheckmateLine } from './game-line.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5198';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE_OPTS = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function openPage(browser, viewport, lang, mobile = false) {
  const context = await browser.newContext(mobile ? MOBILE_OPTS : { viewport });
  const page = await context.newPage();
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  return { context, page, errors };
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { context, page, errors } = await openPage(browser, DESKTOP, lang);

  await page.screenshot({ path: path.join(dir, 'home.jpg') });

  await page.getByRole('button', { name: /Play against the AI|和 AI 下一局/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'setup.jpg') });

  await page.locator('.row-actions .primary').click();
  await clickSquare(page, 'e2', 80);
  await clickSquare(page, 'e4', 80);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(dir, 'game.jpg') });

  await page.locator('.side-actions .secondary').nth(1).click();
  await page.locator('.hint-from').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dir, 'game-hint.jpg') });

  await page.locator('.game-top .back').click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'rules.jpg') });
  await page.getByRole('button', { name: /Back to the table|回到牌桌/ }).click();

  await page.getByRole('button', { name: /Two players, one screen|两人同屏/ }).click();
  const promotionSeen = await playCheckmateLine(page, async () => {
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(dir, 'promotion.jpg') });
  });
  if (!promotionSeen) throw new Error('promotion dialog was not shown');
  await page.locator('.result-banner').waitFor({ state: 'visible' });
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'game-over.jpg') });

  await page.locator('.game-top .back').click();
  await page.locator('.menu-links .text-button').nth(1).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.jpg') });

  if (errors.length) throw new Error(`${lang} console errors: ${errors.join(' | ')}`);
  await context.close();

  const mobile = await openPage(browser, null, lang, true);
  await mobile.page.screenshot({ path: path.join(dir, 'home-mobile.jpg') });
  await mobile.page.getByRole('button', { name: /Two players, one screen|两人同屏/ }).click();
  await clickSquare(mobile.page, 'e2', 120);
  await mobile.page.screenshot({ path: path.join(dir, 'game-mobile.jpg') });
  if (mobile.errors.length) throw new Error(`${lang} mobile errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
