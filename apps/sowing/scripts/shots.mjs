import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5186';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const pits = (south, north) => {
  const slots = Array(14).fill(0);
  south.forEach((value, index) => { slots[index] = value; });
  north.forEach((value, index) => { slots[index + 7] = value; });
  return slots;
};

const midgame = {
  version: 2,
  mode: 'local',
  level: 'normal',
  savedAt: 1,
  state: {
    pits: pits([0, 6, 2, 2, 2, 8], [0, 2, 2, 0, 8, 8]),
    stores: [4, 4],
    turn: 0,
    status: 'playing',
    winner: null,
    moves: [2, 3, 8, 9, 4, 7, 10, 0],
    last: { pit: 0, path: [1, 2, 3, 4, 5, 6], capture: 0, extra: true },
    first: 0,
  },
};

const nearEnd = {
  version: 2,
  mode: 'local',
  level: 'normal',
  savedAt: 1,
  state: {
    pits: pits([0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1]),
    stores: [30, 11],
    turn: 0,
    status: 'playing',
    winner: null,
    moves: Array.from({ length: 40 }, () => 0),
    last: null,
    first: 0,
  },
};

const record = {
  games: 12,
  wins0: 7,
  wins1: 4,
  draws: 1,
  streak: 2,
  lastWinner: 0,
};

async function seed(page, save, nextRecord = record) {
  await page.evaluate(({ save, nextRecord }) => {
    if (save) localStorage.setItem('familyarcade.sowing.save', JSON.stringify(save));
    else localStorage.removeItem('familyarcade.sowing.save');
    localStorage.setItem('familyarcade.sowing.record', JSON.stringify(nextRecord));
  }, { save, nextRecord });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seed(page, null);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  // Setup with the strongest AI selected.
  await page.getByRole('button', { name: /Play against|和 AI/ }).click();
  await page.waitForTimeout(200);
  await page.locator('.level-card').nth(3).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // A real midgame in hot-seat.
  await seed(page, midgame);
  await page.getByRole('button', { name: /Continue|继续/ }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  // Hint with a visible reason in the toast.
  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  // Rules.
  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  // Finish a near-end game for the result banner.
  await seed(page, nearEnd);
  await page.getByRole('button', { name: /Continue|继续/ }).click();
  await page.waitForTimeout(250);
  await page.locator('.pit[data-pit="5"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Family record screen.
  await seed(page, null);
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  // Mobile home and a midgame board.
  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mobile.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await seed(mobile, null);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await seed(mobile, midgame);
  await mobile.getByRole('button', { name: /Continue|继续/ }).click();
  await mobile.waitForTimeout(350);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
