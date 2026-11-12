import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GAME_SEQUENCE, OPENING_SEQUENCE } from './sequence.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5213';
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
    localStorage.removeItem('familyarcade.hive.save');
    localStorage.removeItem('familyarcade.hive.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
}

function hex(q, r) {
  return `.hex[data-key="${q},${r}"]`;
}

function hand(player, kind) {
  return `.hand-piece[data-kind="${kind}"][data-player="${player}"]`;
}

async function move(page, moveValue, index, wait = 55) {
  const player = index % 2 === 0 ? 'W' : 'B';
  if (moveValue.type === 'place') {
    await page.locator(hand(player, moveValue.kind)).click();
    await page.waitForTimeout(20);
    await page.locator(hex(moveValue.at.q, moveValue.at.r)).click();
  } else {
    await page.locator(hex(moveValue.from.q, moveValue.from.r)).click();
    await page.waitForTimeout(20);
    await page.locator(hex(moveValue.to.q, moveValue.to.r)).click();
  }
  await page.waitForTimeout(wait);
}

async function local(page, lang) {
  await page
    .getByRole('button', {
      name: lang === 'en' ? 'Two players, one screen' : '两人同屏',
      exact: true,
    })
    .click();
}

async function shot(page, dir, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await shot(page, dir, 'home');

  await page
    .getByRole('button', { name: lang === 'en' ? 'Play the computer' : '和电脑下', exact: true })
    .click();
  await page.waitForTimeout(250);
  await shot(page, dir, 'setup');
  await page.locator('.back').first().click();
  await page.waitForTimeout(200);

  // A 12-move real game for the game and hint shots.
  await local(page, lang);
  for (let index = 0; index < OPENING_SEQUENCE.length; index += 1) {
    await move(page, OPENING_SEQUENCE[index], index);
  }
  await shot(page, dir, 'game');

  await page.getByRole('button', { name: lang === 'en' ? 'Hint' : '提示', exact: true }).click();
  await page.waitForTimeout(350);
  await shot(page, dir, 'game-hint');

  // A fresh deterministic game played to a real surround win.
  await page.locator('.back').first().click();
  await page.waitForTimeout(200);
  await local(page, lang);
  for (let index = 0; index < GAME_SEQUENCE.length; index += 1) {
    await move(page, GAME_SEQUENCE[index], index, 45);
  }
  await page.waitForTimeout(350);
  await shot(page, dir, 'game-over');

  await page.locator('.back').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: lang === 'en' ? 'View record' : '查看战绩' }).click();
  await page.waitForTimeout(250);
  await shot(page, dir, 'stats');

  await page.locator('.back').first().click();
  await page.waitForTimeout(200);
  await page.locator('.menu-links .text-button').first().click();
  await page.waitForTimeout(250);
  await shot(page, dir, 'rules');
  await page.getByRole('button', { name: lang === 'en' ? 'Close' : '关闭', exact: true }).click();
  await page.waitForTimeout(200);

  await page
    .getByRole('button', { name: lang === 'en' ? /Play on this network/ : /局域网对战/ })
    .click();
  await page.waitForTimeout(250);
  await shot(page, dir, 'lan');

  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await setLang(mobile, lang);
  await mobile.evaluate(() => {
    localStorage.removeItem('familyarcade.hive.save');
    localStorage.removeItem('familyarcade.hive.record');
  });
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(300);
  await shot(mobile, dir, 'home-mobile');
  await local(mobile, lang);
  for (let index = 0; index < 8; index += 1) {
    await move(mobile, OPENING_SEQUENCE[index], index, 60);
  }
  await shot(mobile, dir, 'game-mobile');

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
