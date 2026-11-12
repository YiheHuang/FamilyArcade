import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5205';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const blankHand = () => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });
const piece = (side, type, promoted = false) => ({ side, type, promoted });

function blankState(turn = 'b') {
  return {
    board: Array(81).fill(null),
    hands: { b: blankHand(), w: blankHand() },
    turn,
    status: 'playing',
    winner: null,
    check: false,
    moves: [],
    lastMove: null,
    positionCounts: {},
    endReason: null,
  };
}

function saved(state, mode = 'local', level = 'normal') {
  return { version: 1, state, mode, level, savedAt: Date.now() };
}

function promotionState() {
  const state = blankState();
  state.board[76] = piece('b', 'K');
  state.board[4] = piece('w', 'K');
  state.board[75] = piece('b', 'G');
  state.board[74] = piece('b', 'S');
  state.board[73] = piece('b', 'N');
  state.board[72] = piece('b', 'L');
  state.board[70] = piece('b', 'R');
  state.board[64] = piece('b', 'B');
  state.board[5] = piece('w', 'G');
  state.board[6] = piece('w', 'S');
  state.board[7] = piece('w', 'N');
  state.board[8] = piece('w', 'L');
  state.board[10] = piece('w', 'R');
  state.board[16] = piece('w', 'B');
  for (const index of [54, 55, 56, 57, 59, 60, 61, 62]) state.board[index] = piece('b', 'P');
  for (const index of [18, 20, 24, 26]) state.board[index] = piece('w', 'P');
  state.board[31] = piece('b', 'P');
  state.hands.b.P = 1;
  state.hands.w.P = 1;
  return state;
}

function mateState() {
  const state = blankState();
  state.board[76] = piece('b', 'K');
  state.board[4] = piece('w', 'K');
  state.board[2] = piece('b', 'G');
  state.board[6] = piece('b', 'G');
  state.board[21] = piece('b', 'G');
  state.board[23] = piece('b', 'G');
  state.board[12] = piece('b', 'R');
  state.board[18] = piece('w', 'P');
  state.board[26] = piece('w', 'P');
  state.board[29] = piece('w', 'P');
  state.board[33] = piece('w', 'P');
  state.board[45] = piece('w', 'G');
  state.board[53] = piece('w', 'S');
  state.board[54] = piece('b', 'P');
  state.board[62] = piece('b', 'P');
  state.board[63] = piece('b', 'S');
  state.board[71] = piece('b', 'S');
  state.board[74] = piece('b', 'G');
  state.board[78] = piece('b', 'G');
  state.hands.b.P = 1;
  state.hands.w.P = 1;
  return state;
}

function sampleRecord() {
  const now = Date.now();
  const recent = [
    { winner: 'b', mode: 'ai', level: 'normal', moves: 41, at: now - 3600_000 },
    { winner: 'b', mode: 'lan', moves: 72, at: now - 86_400_000 },
    { winner: 'w', mode: 'local', moves: 58, at: now - 172_800_000 },
    { winner: 'draw', mode: 'lan', moves: 96, at: now - 259_200_000 },
    { winner: 'b', mode: 'ai', level: 'hard', moves: 33, at: now - 345_600_000 },
    { winner: 'w', mode: 'ai', level: 'easy', moves: 47, at: now - 432_000_000 },
    { winner: 'b', mode: 'local', moves: 64, at: now - 518_400_000 },
  ];
  return {
    games: 7,
    winsBlack: 4,
    winsWhite: 2,
    draws: 1,
    streak: 2,
    bestStreak: 3,
    lastWinner: 'b',
    byMode: { ai: 3, local: 2, lan: 2 },
    recent,
  };
}

async function setLang(page, lang) {
  await page.addInitScript(
    ({ value, record }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.removeItem('familyarcade.shogi.save');
      localStorage.setItem('familyarcade.shogi.record', JSON.stringify(record));
    },
    { value: lang, record: sampleRecord() },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function seedSave(page, lang, state) {
  await page.addInitScript(
    ({ value, payload, record }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.setItem('familyarcade.shogi.record', JSON.stringify(record));
      localStorage.setItem('familyarcade.shogi.save', JSON.stringify(payload));
    },
    { value: lang, payload: saved(state), record: sampleRecord() },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
}

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play the computer|和电脑下一局/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /^Hard|^挑战/ }).click();
  await page.getByRole('button', { name: /Begin|开始/ }).click();
  await page.waitForTimeout(300);
  await page.locator('.cell').nth(58).click();
  await page.locator('.cell').nth(49).click();
  await page.waitForFunction(
    () => {
      const text = document.querySelector('.turn-copy strong')?.textContent ?? '';
      return text.includes('Your move') || text.includes('轮到你');
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.locator('.cell').nth(70).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-select.png') });

  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();

  await page.getByRole('button', { name: /Same Wi-Fi|同一无线网络/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await page.getByRole('button', { name: /Back|返回/ }).click();

  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  const promotionPage = await browser.newPage({ viewport: DESKTOP });
  await seedSave(promotionPage, lang, promotionState());
  await promotionPage.getByRole('button', { name: /Continue last game|继续上局/ }).click();
  await promotionPage.locator('.cell').nth(31).click();
  await promotionPage.locator('.cell').nth(22).click();
  await promotionPage.waitForTimeout(250);
  await promotionPage.screenshot({ path: path.join(dir, 'game-promotion.png') });

  const matePage = await browser.newPage({ viewport: DESKTOP });
  await seedSave(matePage, lang, mateState());
  await matePage.getByRole('button', { name: /Continue last game|继续上局/ }).click();
  await matePage.locator('.cell').nth(12).click();
  await matePage.locator('.cell').nth(13).click();
  await matePage.getByRole('button', { name: /Keep unpromoted|不升变/ }).click();
  await matePage.waitForTimeout(400);
  await matePage.screenshot({ path: path.join(dir, 'game-over.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await mobile.locator('.cell').nth(70).click();
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
