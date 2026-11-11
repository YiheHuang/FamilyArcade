import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5184';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const LABELS = {
  en: {
    continue: 'Continue last game',
    solo: 'Solo against the AI',
    hard: 'Hard',
    back: 'Back',
    hotseat: 'Two players, one screen',
    hint: 'Hint',
    home: 'Home',
    stats: 'Family record',
    rules: 'Rules',
  },
  zh: {
    continue: '继续上一局',
    solo: '和 AI 对弈',
    hard: '挑战',
    back: '返回',
    hotseat: '两人同屏',
    hint: '提示',
    home: '主页',
    stats: '家庭战绩',
    rules: '规则',
  },
};

async function openPage(browser, lang, options = { viewport: DESKTOP }) {
  const page = await browser.newPage(options);
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('familyarcade.shots.boot')) {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.removeItem('familyarcade.mill.save');
      localStorage.removeItem('familyarcade.mill.record');
      sessionStorage.setItem('familyarcade.shots.boot', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  return page;
}

async function clickPoint(page, point, wait = 140) {
  await page.locator(`.point[data-point="${point}"]`).click();
  await page.waitForTimeout(wait);
}

async function clickButton(page, text, wait = 200) {
  await page.locator('button').filter({ hasText: text }).first().click();
  await page.waitForTimeout(wait);
}

const savePayload = (state, mode = 'local') =>
  JSON.stringify({
    version: 2,
    state,
    mode,
    level: 'normal',
    human: 'W',
    savedAt: Date.now(),
  });

function fixtureState({
  board,
  turn,
  pendingCapture = null,
  quiet = 0,
  moveCount = 18,
  last = null,
}) {
  const count = (player) => board.filter((cell) => cell === player).length;
  return {
    board,
    turn,
    phase: 'moving',
    status: 'playing',
    winner: null,
    winReason: null,
    pendingCapture,
    hand: { W: 0, B: 0 },
    onBoard: { W: count('W'), B: count('B') },
    quiet,
    moveCount,
    last,
    first: 'W',
  };
}

function boardWith(entries) {
  const board = Array(24).fill(null);
  for (const [point, player] of entries) board[point] = player;
  return board;
}

const WHITE_WIN = fixtureState({
  board: boardWith([
    [16, 'W'], [18, 'W'], [19, 'W'], [20, 'W'],
    [0, 'B'], [1, 'B'], [4, 'B'],
  ]),
  turn: 'W',
  pendingCapture: 'B',
  moveCount: 20,
  last: { by: 'W', from: null, to: 19, capture: false, mill: [18, 19, 20] },
});

const BLACK_WIN = fixtureState({
  board: boardWith([
    [16, 'B'], [18, 'B'], [19, 'B'], [20, 'B'],
    [0, 'W'], [1, 'W'], [4, 'W'],
  ]),
  turn: 'B',
  pendingCapture: 'W',
  moveCount: 20,
  last: { by: 'B', from: null, to: 19, capture: false, mill: [18, 19, 20] },
});

const DRAW = fixtureState({
  board: boardWith([
    [16, 'W'], [17, 'W'], [19, 'W'],
    [0, 'B'], [1, 'B'], [3, 'B'],
  ]),
  turn: 'W',
  quiet: 99,
  moveCount: 60,
});

const MOVE_DAY = fixtureState({
  board: boardWith([
    [0, 'W'], [2, 'W'], [5, 'W'], [8, 'W'], [12, 'W'], [14, 'W'], [17, 'W'], [20, 'W'], [23, 'W'],
    [1, 'B'], [3, 'B'], [6, 'B'], [9, 'B'], [11, 'B'], [13, 'B'], [16, 'B'], [18, 'B'], [21, 'B'],
  ]),
  turn: 'W',
  moveCount: 18,
});

async function clickContinue(page, lang) {
  await clickButton(page, LABELS[lang].continue, 350);
}

async function finishFixture(page, state, lang) {
  await page.evaluate((payload) => {
    localStorage.setItem('familyarcade.mill.save', payload);
  }, savePayload(state));
  await page.reload({ waitUntil: 'networkidle' });
  await clickContinue(page, lang);
  if (state.pendingCapture) {
    await clickPoint(page, 0, 300);
  } else {
    await clickPoint(page, 19, 160);
    await clickPoint(page, 20, 300);
  }
  await clickButton(page, LABELS[lang].home, 300);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  const labels = LABELS[lang];
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await openPage(browser, lang);

  // Populate a genuine family record: Black win + draw; the White win comes later.
  await finishFixture(page, BLACK_WIN, lang);
  await finishFixture(page, DRAW, lang);

  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await clickButton(page, labels.solo, 250);
  await clickButton(page, labels.hard, 150);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'setup.png') });
  await clickButton(page, labels.back, 200);

  // A real hot-seat position, ten men on the board.
  await clickButton(page, labels.hotseat, 250);
  for (const point of [16, 8, 14, 11, 5, 20, 21, 1, 2, 13]) {
    await clickPoint(page, point, 90);
  }
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  // Moving-phase selection and a hinted idea, from a valid saved position.
  await page.evaluate((payload) => {
    localStorage.setItem('familyarcade.mill.save', payload);
  }, savePayload(MOVE_DAY));
  await page.reload({ waitUntil: 'networkidle' });
  await clickContinue(page, lang);
  await clickPoint(page, 5, 180);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'game-select.png') });
  await clickPoint(page, 5, 120);
  await clickButton(page, labels.hint, 1100);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });
  await clickButton(page, labels.home, 250);

  // A real mill with both capturable men ringed.
  await clickButton(page, labels.hotseat, 250);
  for (const point of [0, 8, 1, 9, 2]) await clickPoint(page, point, 120);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'game-mill.png') });

  // Finish the White win from a valid one-capture position.
  await page.evaluate((payload) => {
    localStorage.setItem('familyarcade.mill.save', payload);
  }, savePayload(WHITE_WIN));
  await page.reload({ waitUntil: 'networkidle' });
  await clickContinue(page, lang);
  await clickPoint(page, 0, 450);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });
  await clickButton(page, labels.home, 300);

  await clickButton(page, labels.stats, 300);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'stats.png') });
  await clickButton(page, labels.back, 200);

  await clickButton(page, labels.rules, 300);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  const mobile = await openPage(browser, lang, MOBILE);
  await mobile.mouse.move(2, 2);
  await mobile.screenshot({ path: path.join(OUT, lang, 'home-mobile.png') });
  await clickButton(mobile, labels.hotseat, 250);
  for (const point of [16, 8, 14, 11, 5, 20]) {
    await mobile.locator(`.point[data-point="${point}"]`).tap();
    await mobile.waitForTimeout(100);
  }
  await mobile.locator('.board-stage').scrollIntoViewIfNeeded();
  await mobile.evaluate(() => window.scrollBy(0, -12));
  await mobile.waitForTimeout(150);
  await mobile.screenshot({ path: path.join(OUT, lang, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
