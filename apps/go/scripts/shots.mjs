import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5204';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// A natural 19×19 opening with corner and edge groups, replayed through the UI.
const OPENING = [
  72, 288, 300, 60, 92, 97, 62, 78, 262, 250,
  180, 187, 173, 47, 313, 309, 52, 318, 91, 79,
  90, 271, 263, 268, 24, 59, 280, 290,
];

// Two full-height walls leave a scored board with large territories.
const WALL_MOVES = (() => {
  const moves = [];
  for (let y = 0; y < 19; y++) {
    moves.push(y * 19 + 9, y * 19 + 11);
  }
  return moves;
})();

// A real 9×9 opening for the phone screenshot.
const MOBILE_MOVES = [56, 40, 20, 31, 24, 39, 60, 30, 41, 48];

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.go.save');
    localStorage.removeItem('familyarcade.go.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
}

async function clickPoint(page, index) {
  await page.locator('.go-point').nth(index).click();
  await page.waitForTimeout(22);
}

async function playPoints(page, points) {
  for (const point of points) await clickPoint(page, point);
}

async function passTwice(page) {
  await page.locator('.pass-button').click();
  await page.waitForTimeout(80);
  await page.locator('.pass-button').click();
  await page.waitForTimeout(350);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  // AI setup.
  await page.getByRole('button', { name: /Play against the computer|Play against the AI|和电脑下一局/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });
  await page.locator('.back').first().click();
  await page.waitForTimeout(150);

  // A real mid-game on 19×19.
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await page.getByRole('button', { name: /^Begin$|^开始$/ }).click();
  await page.waitForTimeout(250);
  await playPoints(page, OPENING);
  await page.waitForTimeout(300);
  const openingStones = await page.locator('.go-point.has-black, .go-point.has-white').count();
  if (openingStones !== OPENING.length) {
    throw new Error(`opening replay placed ${openingStones}/${OPENING.length} stones`);
  }
  await page.screenshot({ path: path.join(dir, 'game.png') });

  // Hint with a plain-language reason.
  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  // A scored wall game for the result screen.
  await page.locator('.game-top .back').click();
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await page.getByRole('button', { name: /^Begin$|^开始$/ }).click();
  await page.waitForTimeout(200);
  await playPoints(page, WALL_MOVES);
  const wallStones = await page.locator('.go-point.has-black, .go-point.has-white').count();
  if (wallStones !== WALL_MOVES.length) {
    throw new Error(`wall replay placed ${wallStones}/${WALL_MOVES.length} stones`);
  }
  await passTwice(page);
  if (!(await page.locator('.result-banner').isVisible())) {
    throw new Error('wall game did not finish');
  }
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Two more quick finished games give the record screen real history.
  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  await page.waitForTimeout(200);
  await playPoints(page, OPENING.slice(0, 8));
  await passTwice(page);
  await page.getByRole('button', { name: /Play again|再来一局/ }).click();
  await page.waitForTimeout(200);
  await playPoints(page, OPENING.slice(0, 6));
  await passTwice(page);

  await page.locator('.game-top .back').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  // Rules.
  await page.locator('.stats-shell .back').click();
  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.locator('.rules-shell .back').click();

  // LAN hub.
  await page.getByRole('button', { name: /LAN night|局域网对战/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  // Phone screenshots.
  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await mobile.getByRole('button', { name: /^9 × 9$/ }).click();
  await mobile.getByRole('button', { name: /^Begin$|^开始$/ }).click();
  await mobile.waitForTimeout(200);
  await playPoints(mobile, MOBILE_MOVES);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
